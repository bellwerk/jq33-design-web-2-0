const canonicalOrigin = "https://jq33.design";
const releaseFingerprint = "20260826-production-launch-closure-nav-1";
const timeoutMs = Number(process.env.PRODUCTION_HEALTH_TIMEOUT_MS || 15_000);
const expectedPermissionsPolicy =
  "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), publickey-credentials-get=(), usb=()";

const argumentValue = (name, fallback = "") => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : fallback;
};

const getAttribute = (tag, name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
    "i",
  ).exec(tag);
  return match ? match[1] ?? match[2] ?? match[3] ?? "" : "";
};

const request = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "jq33-production-health/1.0" },
    });
    return {
      status: response.status,
      location: response.headers.get("location") || "",
      contentType: response.headers.get("content-type") || "",
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text(),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const cspDirectives = (source) =>
  new Map(
    String(source || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name.toLowerCase(), values];
      }),
  );

const sameTokens = (actual, expected) =>
  actual.length === expected.length && expected.every((token) => actual.includes(token));

const securityFailures = (record, label, secure = true) => {
  const failures = [];
  const headers = record.headers || {};
  const csp = headers["content-security-policy"] || "";
  const directives = cspDirectives(csp);
  const exactDirectives = new Map([
    ["default-src", ["'self'"]],
    ["base-uri", ["'none'"]],
    ["object-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["form-action", ["https://formspree.io"]],
    ["img-src", ["'self'", "data:"]],
    ["font-src", ["'self'"]],
    ["connect-src", ["'self'", "https://formspree.io", "https://cloudflareinsights.com"]],
    ["frame-src", ["'none'"]],
    ["media-src", ["'none'"]],
    ["worker-src", ["'none'"]],
    ["manifest-src", ["'self'"]],
    ["upgrade-insecure-requests", []],
  ]);
  for (const [directive, expected] of exactDirectives) {
    const actual = directives.get(directive);
    if (!actual || !sameTokens(actual, expected)) {
      failures.push(`${label} CSP ${directive} is missing or exceeds the release allowlist.`);
    }
  }
  for (const [directive, required, fixedAllowed] of [
    ["script-src", ["'self'", "'unsafe-hashes'", "https://static.cloudflareinsights.com"], []],
    ["style-src", ["'self'", "'unsafe-hashes'"], []],
  ]) {
    const actual = directives.get(directive) || [];
    const allowed = new Set([...required, ...fixedAllowed]);
    if (
      !required.every((token) => actual.includes(token)) ||
      actual.some((token) => !allowed.has(token) && !/^'sha256-[A-Za-z0-9+/=]+'$/.test(token))
    ) {
      failures.push(`${label} CSP ${directive} is missing a required source or exceeds the release allowlist.`);
    }
  }
  if (/['"]unsafe-(?:inline|eval)['"]|(?:^|\s)\*(?:\s|$)/i.test(csp)) {
    failures.push(`${label} CSP contains a forbidden wildcard or unsafe directive.`);
  }
  if ((headers["x-frame-options"] || "").toUpperCase() !== "DENY") {
    failures.push(`${label} lacks X-Frame-Options: DENY.`);
  }
  if ((headers["x-content-type-options"] || "").toLowerCase() !== "nosniff") {
    failures.push(`${label} lacks X-Content-Type-Options: nosniff.`);
  }
  if ((headers["permissions-policy"] || "").replace(/\s+/g, " ").trim() !== expectedPermissionsPolicy) {
    failures.push(`${label} Permissions-Policy differs from the release allowlist.`);
  }
  if (!/^(?:no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin)$/i.test(
    headers["referrer-policy"] || "",
  )) {
    failures.push(`${label} lacks a restrictive Referrer-Policy.`);
  }
  if (secure) {
    const hsts = headers["strict-transport-security"] || "";
    const maxAge = Number(/max-age=(\d+)/i.exec(hsts)?.[1] || 0);
    if (maxAge < 31_536_000 || !/\bincludeSubDomains\b/i.test(hsts)) {
      failures.push(`${label} HSTS is missing or too short.`);
    }
  }
  return failures;
};

const validateSnapshot = (snapshot) => {
  const failures = [];
  const origin = snapshot.origin;
  const records = snapshot.records;
  const publicRoutes = [
    "/",
    "/projects/",
    "/projects/bruton-place-iv/",
    "/contact/",
    "/inquiry/",
  ];
  for (const route of publicRoutes) {
    const record = records[route];
    if (!record || record.status !== 200) {
      failures.push(`${route} returned ${record?.status ?? "no response"}; expected 200.`);
      continue;
    }
    if (!/^text\/html\b/i.test(record.contentType)) {
      failures.push(`${route} returned a non-HTML content type.`);
    }
    if (!record.body.includes(releaseFingerprint)) {
      failures.push(`${route} lacks the approved global-navigation fingerprint.`);
    }
    failures.push(...securityFailures(record, route, origin.startsWith("https://")));
  }

  for (const route of ["/robots.txt", "/sitemap.xml"]) {
    if (records[route]?.status !== 200) failures.push(`${route} must return 200.`);
  }

  const expectedHome = `${origin}/`;
  const home = records["/home-page"];
  if (home?.status !== 301 || new URL(home.location || "/invalid", origin).href !== expectedHome) {
    failures.push(`/home-page must redirect once with 301 to ${expectedHome}.`);
  }

  const notFoundRoutes = [
    "/__jq33-health-404__",
    "/package.json",
    "/.env.example",
    "/admin/portfolio/",
  ];
  for (const route of notFoundRoutes) {
    const record = records[route];
    if (!record || record.status !== 404 || record.location) {
      failures.push(`${route} must return a genuine non-redirecting 404.`);
      continue;
    }
    if (!/\bnoindex\b/i.test(record.body)) failures.push(`${route} 404 lacks noindex.`);
    failures.push(...securityFailures(record, route, origin.startsWith("https://")));
  }

  if (records["www:/projects/"]) {
    const record = records["www:/projects/"];
    const expected = `${origin}/projects/`;
    if (record.status !== 301 || new URL(record.location || "/invalid", origin).href !== expected) {
      failures.push(`www Projects must redirect once with 301 to ${expected}.`);
    }
  }

  const actions = {};
  for (const [route, kind] of [["/contact/", "contact"], ["/inquiry/", "inquiry"]]) {
    const form = [...(records[route]?.body || "").matchAll(/<form\b[^>]*>/gi)]
      .map((match) => match[0])
      .find((tag) => getAttribute(tag, "data-lead-form") === kind);
    actions[kind] = form ? getAttribute(form, "action") : "";
    if (!/^https:\/\/formspree\.io\/f\/[a-z0-9]+$/i.test(actions[kind])) {
      failures.push(`${route} lacks its direct production Formspree action.`);
    }
  }
  if (actions.contact && actions.contact === actions.inquiry) {
    failures.push("Contact and Inquiry must use distinct Formspree actions.");
  }
  return [...new Set(failures)];
};

const selfTest = () => {
  const headers = {
    "content-security-policy": "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action https://formspree.io; script-src 'self' 'unsafe-hashes' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-hashes'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://formspree.io https://cloudflareinsights.com; frame-src 'none'; media-src 'none'; worker-src 'none'; manifest-src 'self'; upgrade-insecure-requests",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "permissions-policy": expectedPermissionsPolicy,
    "referrer-policy": "strict-origin-when-cross-origin",
  };
  const html = `<meta name="jq33-release" content="${releaseFingerprint}">`;
  const ok = (body = html) => ({ status: 200, location: "", contentType: "text/html", headers, body });
  const missing = { status: 404, location: "", contentType: "text/html", headers, body: "<meta name=robots content=noindex>" };
  const records = {
    "/": ok(),
    "/projects/": ok(),
    "/projects/bruton-place-iv/": ok(),
    "/contact/": ok(`${html}<form data-lead-form="contact" action="https://formspree.io/f/contact1"></form>`),
    "/inquiry/": ok(`${html}<form data-lead-form="inquiry" action="https://formspree.io/f/inquiry1"></form>`),
    "/robots.txt": { ...ok("robots"), contentType: "text/plain" },
    "/sitemap.xml": { ...ok("sitemap"), contentType: "application/xml" },
    "/home-page": { ...ok(""), status: 301, location: "https://jq33.design/" },
    "/__jq33-health-404__": missing,
    "/package.json": missing,
    "/.env.example": missing,
    "/admin/portfolio/": missing,
    "www:/projects/": { ...ok(""), status: 301, location: "https://jq33.design/projects/" },
  };
  const snapshot = { origin: canonicalOrigin, records };
  const validFailures = validateSnapshot(snapshot);
  if (validFailures.length) {
    throw new Error(`valid production snapshot was rejected: ${validFailures.join(" | ")}`);
  }
  const negativeCases = [
    ["route", (broken) => { broken.records["/projects/bruton-place-iv/"].status = 500; }, "bruton-place-iv"],
    ["CSP", (broken) => { broken.records["/"].headers["content-security-policy"] = "default-src *"; }, "CSP"],
    ["HSTS", (broken) => { delete broken.records["/"].headers["strict-transport-security"]; }, "HSTS"],
    ["redirect", (broken) => { broken.records["/home-page"].status = 302; }, "/home-page"],
    ["source isolation", (broken) => { broken.records["/package.json"].status = 200; }, "/package.json"],
    ["fingerprint", (broken) => { broken.records["/"].body = "<main>wrong candidate</main>"; }, "fingerprint"],
    ["form distinctness", (broken) => {
      broken.records["/inquiry/"].body = `${html}<form data-lead-form="inquiry" action="https://formspree.io/f/contact1"></form>`;
    }, "distinct"],
  ];
  for (const [name, mutate, expectedFailure] of negativeCases) {
    const broken = structuredClone(snapshot);
    mutate(broken);
    if (!validateSnapshot(broken).some((failure) => failure.includes(expectedFailure))) {
      throw new Error(`${name} regression was accepted`);
    }
  }
  console.log("Production health self-test passed.");
};

const run = async () => {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const base = new URL(
    argumentValue("--base-url", process.env.PRODUCTION_BASE_URL || canonicalOrigin),
  );
  if (base.pathname !== "/" || base.search || base.hash || !/^https?:$/.test(base.protocol)) {
    throw new Error("production base URL must be an HTTP(S) origin");
  }
  const routes = [
    "/", "/projects/", "/projects/bruton-place-iv/", "/contact/", "/inquiry/",
    "/robots.txt", "/sitemap.xml", "/home-page", "/__jq33-health-404__",
    "/package.json", "/.env.example", "/admin/portfolio/",
  ];
  const records = Object.fromEntries(
    await Promise.all(routes.map(async (route) => [route, await request(new URL(route, base).href)])),
  );
  if (base.hostname === "jq33.design") {
    records["www:/projects/"] = await request("https://www.jq33.design/projects/");
  }
  const snapshot = { origin: base.origin, records };
  const failures = validateSnapshot(snapshot);
  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    baseUrl: base.origin,
    result: failures.length ? "FAIL" : "PASS",
    failures,
    records: Object.fromEntries(
      Object.entries(records).map(([route, record]) => [route, {
        status: record.status,
        location: record.location,
        contentType: record.contentType,
      }]),
    ),
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
};

run().catch((error) => {
  console.error(`Production health check failed: ${error.message}`);
  process.exitCode = 1;
});
