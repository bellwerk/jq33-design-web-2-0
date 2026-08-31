import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  argumentValue,
  canonicalOrigin,
  defaultRawRoot,
  getAttribute,
  negativeRoutes,
  publicRoutes,
  redirectRoutes,
  reportFailures,
  requireDirectory,
  resolveDistRoot,
  routeToRelativeHtml,
  sourceLeakRoutes,
  tags,
  walkFiles,
} from "../tests/helpers/site.mjs";

const baseValue = argumentValue("--base-url", process.env.DEPLOYED_BASE_URL || "");
const expectProduction =
  process.argv.includes("--production") || process.env.EXPECT_PRODUCTION === "1";
const failures = [];
const records = [];
const timeoutMs = Number(process.env.DEPLOYED_TIMEOUT_MS || 15_000);
const distRoot = resolveDistRoot();

if (!baseValue) {
  console.error("DEPLOYED_BASE_URL (or --base-url) is required; deployed checks never skip.");
  process.exit(2);
}

let base;
try {
  base = new URL(baseValue);
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("URL must use HTTP(S)");
  if (base.pathname !== "/" || base.search || base.hash) {
    throw new Error("URL must be an origin with no path, query, or fragment");
  }
  if (expectProduction && base.origin !== canonicalOrigin) {
    throw new Error(`production mode requires ${canonicalOrigin}`);
  }
} catch (error) {
  console.error(`Invalid deployed base URL: ${error.message}`);
  process.exit(2);
}

const outputDirectory = path.resolve(
  argumentValue(
    "--output-dir",
    process.env.DEPLOYED_ARTIFACT_DIR || path.join(defaultRawRoot, "deployed"),
  ),
);
fs.mkdirSync(outputDirectory, { recursive: true });

const request = async (url, redirect = "manual") => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect,
      signal: controller.signal,
      headers: { "User-Agent": "jq33-production-readiness-check/1.0" },
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const body = buffer.toString("utf8");
    return {
      url,
      status: response.status,
      location: response.headers.get("location") || "",
      contentType: response.headers.get("content-type") || "",
      headers: Object.fromEntries(response.headers.entries()),
      bytes: buffer.length,
      sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const checkSecurityHeaders = (record, label) => {
  const headers = record.headers;
  const csp = headers["content-security-policy"] || "";
  for (const directive of [
    "default-src",
    "script-src",
    "style-src",
    "connect-src",
    "img-src",
    "font-src",
    "form-action",
    "frame-ancestors",
    "object-src",
    "base-uri",
  ]) {
    if (!new RegExp(`(?:^|;)\\s*${directive}\\s+`, "i").test(csp)) {
      failures.push(`${label} response CSP is missing ${directive}.`);
    }
  }
  if (/'unsafe-inline'|'unsafe-eval'/i.test(csp)) {
    failures.push(`${label} response CSP contains an unsafe directive.`);
  }
  if (!/frame-ancestors\s+'none'/i.test(csp)) {
    failures.push(`${label} response CSP must deny framing.`);
  }
  if ((headers["x-frame-options"] || "").toUpperCase() !== "DENY") {
    failures.push(`${label} response lacks X-Frame-Options: DENY.`);
  }
  const hsts = headers["strict-transport-security"] || "";
  const maxAge = Number(/max-age=(\d+)/i.exec(hsts)?.[1] || 0);
  if (base.protocol === "https:" && (maxAge < 31_536_000 || !/\bincludeSubDomains\b/i.test(hsts))) {
    failures.push(`${label} response HSTS is missing/too short.`);
  }
  if (/\bpreload\b/i.test(hsts)) failures.push(`${label} response HSTS requests preload.`);
  if ((headers["x-content-type-options"] || "").toLowerCase() !== "nosniff") {
    failures.push(`${label} response lacks X-Content-Type-Options: nosniff.`);
  }
  if (!/^(?:no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin)$/i.test(headers["referrer-policy"] || "")) {
    failures.push(`${label} response lacks a restrictive Referrer-Policy.`);
  }
  if (!headers["permissions-policy"]) failures.push(`${label} response lacks Permissions-Policy.`);
};

const followRedirect = async (startUrl, expectedStatus, expectedFinal) => {
  const seen = new Set();
  let current = startUrl;
  let hops = 0;
  while (true) {
    if (seen.has(current)) {
      failures.push(`Redirect loop detected at ${current}.`);
      return;
    }
    seen.add(current);
    const record = await request(current);
    records.push({ kind: "redirect", ...record, body: undefined });
    if (hops === 0 && record.status !== expectedStatus) {
      failures.push(`${startUrl} returned ${record.status}; expected ${expectedStatus}.`);
    }
    if (record.status < 300 || record.status >= 400) {
      if (current !== expectedFinal || record.status !== 200) {
        failures.push(`${startUrl} ended at ${current} (${record.status}), expected ${expectedFinal} (200).`);
      }
      if (hops !== 1) failures.push(`${startUrl} used ${hops} redirects; expected exactly one.`);
      return;
    }
    if (!record.location) {
      failures.push(`${current} redirects without a Location header.`);
      return;
    }
    current = new URL(record.location, current).href;
    hops += 1;
    if (hops > 5) {
      failures.push(`${startUrl} exceeded the redirect-hop limit.`);
      return;
    }
  }
};

try {
  requireDirectory(distRoot, "Authoritative distribution directory");
  const localHash = (relativePath) =>
    crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(distRoot, ...relativePath.split("/"))))
      .digest("hex");

  for (const route of publicRoutes) {
    const url = new URL(route, base).href;
    const record = await request(url);
    const expectedSha256 = localHash(routeToRelativeHtml(route));
    records.push({
      kind: "public-route",
      route,
      expectedSha256,
      ...record,
      body: undefined,
    });
    if (record.status !== 200) failures.push(`${route} returned ${record.status}; expected 200.`);
    if (!/^text\/html\b/i.test(record.contentType)) {
      failures.push(`${route} returned non-HTML content type "${record.contentType}".`);
    }
    if (record.location) failures.push(`${route} unexpectedly returned Location: ${record.location}.`);
    if (record.sha256 !== expectedSha256) {
      failures.push(`${route} deployed HTML bytes differ from the authoritative dist artifact.`);
    }
    const canonical = tags(record.body, "link")
      .filter((tag) => getAttribute(tag, "rel").toLowerCase().split(/\s+/).includes("canonical"))
      .map((tag) => getAttribute(tag, "href"));
    const expectedCanonical = `${canonicalOrigin}${route}`;
    if (canonical.length !== 1 || canonical[0] !== expectedCanonical) {
      failures.push(`${route} deployed canonical must be ${expectedCanonical}.`);
    }
    checkSecurityHeaders(record, route);
  }

  const notFoundSha256 = localHash("404.html");
  for (const route of [...negativeRoutes, ...sourceLeakRoutes, "/_headers", "/_redirects"]) {
    const record = await request(new URL(route, base).href);
    records.push({
      kind: sourceLeakRoutes.includes(route) ? "source-negative" : "unknown-negative",
      route,
      expectedSha256: notFoundSha256,
      ...record,
      body: undefined,
    });
    if (record.status !== 404) failures.push(`${route} returned ${record.status}; expected a genuine 404.`);
    if (record.location) failures.push(`${route} must not redirect.`);
    if (!/\bnoindex\b/i.test(record.body)) failures.push(`${route} 404 body lacks noindex.`);
    if (record.sha256 !== notFoundSha256) {
      failures.push(`${route} does not return the authoritative branded 404 artifact.`);
    }
    checkSecurityHeaders(record, route);
  }

  for (const route of redirectRoutes) {
    await followRedirect(new URL(route, base).href, 301, new URL("/", base).href);
  }

  for (const route of ["/robots.txt", "/sitemap.xml"]) {
    const record = await request(new URL(route, base).href);
    const expectedSha256 = localHash(route.slice(1));
    records.push({ kind: "crawl-file", route, expectedSha256, ...record, body: undefined });
    if (record.status !== 200) failures.push(`${route} returned ${record.status}; expected 200.`);
    if (record.sha256 !== expectedSha256) {
      failures.push(`${route} deployed bytes differ from the authoritative dist artifact.`);
    }
  }

  const artifactFiles = walkFiles(distRoot)
    .map((file) => path.relative(distRoot, file).split(path.sep).join("/"))
    .filter(
      (relative) =>
        !relative.endsWith(".html") &&
        !["_headers", "_redirects", "robots.txt", "sitemap.xml"].includes(relative),
    );
  for (const relative of artifactFiles) {
    const route = `/${relative.split("/").map(encodeURIComponent).join("/")}`;
    const record = await request(new URL(route, base).href);
    const expectedSha256 = localHash(relative);
    records.push({ kind: "artifact-file", route, expectedSha256, ...record, body: undefined });
    if (record.status !== 200) {
      failures.push(`${route} returned ${record.status}; expected 200 for an allowlisted artifact.`);
    }
    if (record.sha256 !== expectedSha256) {
      failures.push(`${route} deployed bytes differ from the authoritative dist artifact.`);
    }
  }

  if (expectProduction || base.origin === canonicalOrigin) {
    for (const route of ["/", "/projects/", "/contact/"]) {
      await followRedirect(
        `https://www.jq33.design${route}`,
        301,
        `${canonicalOrigin}${route}`,
      );
    }
  }
} catch (error) {
  failures.push(`Deployed request failed: ${error.message}`);
}

const uniqueFailures = [...new Set(failures)];
fs.writeFileSync(
  path.join(outputDirectory, "status-matrix.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      checkedAt: new Date().toISOString(),
      baseUrl: base.origin,
      productionMode: expectProduction,
      productionHostRedirectsChecked: expectProduction || base.origin === canonicalOrigin,
      timeoutMs,
      result: uniqueFailures.length ? "FAIL" : "PASS",
      failures: uniqueFailures,
      records,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

reportFailures(
  "Deployed route/header validation",
  uniqueFailures,
  `Deployed route/header validation passed; raw matrix: ${path.join(outputDirectory, "status-matrix.json")}`,
);
