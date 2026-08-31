import fs from "node:fs";
import path from "node:path";
import {
  canonicalOrigin,
  publicRoutes,
  redirectRoutes,
} from "../tests/helpers/site.mjs";

const argumentValue = (name, fallback = "") => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const outputPath = path.resolve(
  argumentValue(
    "--output",
    ".agent/tasks/jq33-production-readiness-2026-07-29/raw/deployed-production/canonical-host-matrix.json",
  ),
);
const timeoutMs = Number(
  argumentValue("--timeout-ms", process.env.DEPLOYED_TIMEOUT_MS || "15000"),
);
const selfTest = process.argv.includes("--self-test");
const queryFixturePath = path.resolve(
  argumentValue(
    "--query-fixture",
    "tests/fixtures/canonical-host-query-preservation.json",
  ),
);
const QUERY_PROBE_PARAMETER = "jq33_redirect_probe";
const records = [];
const failures = [];

const redirectContractFailures = (record, source, expectedTarget) => {
  const issues = [];
  if (record.status !== 301) {
    issues.push(`returned ${record.status}; expected 301`);
  }
  let location = "";
  try {
    location = record.location ? new URL(record.location, source).href : "";
  } catch {
    issues.push("returned an invalid Location header");
  }
  if (location !== expectedTarget) {
    issues.push(
      `redirects to ${location || "(missing)"}, expected ${expectedTarget}`,
    );
  }
  return issues;
};

const withQueryProbe = (source, expectedTarget, tag) => {
  const taggedSource = new URL(source);
  taggedSource.searchParams.set(QUERY_PROBE_PARAMETER, tag);
  const taggedTarget = new URL(expectedTarget);
  taggedTarget.search = taggedSource.search;
  return { source: taggedSource.href, expectedTarget: taggedTarget.href };
};

const routeTag = (route) =>
  route.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-") || "root";

const runQuerySelfTest = () => {
  if (!fs.existsSync(queryFixturePath)) {
    throw new Error(`canonical query fixture is missing: ${queryFixturePath}`);
  }
  const fixture = JSON.parse(fs.readFileSync(queryFixturePath, "utf8"));
  if (fixture.schemaVersion !== 1 || !Array.isArray(fixture.cases)) {
    throw new Error("canonical query fixture must use schemaVersion 1 with cases.");
  }
  let passingCases = 0;
  let failingCases = 0;
  const coveredHosts = new Set();
  for (const testCase of fixture.cases) {
    if (
      !testCase ||
      typeof testCase.id !== "string" ||
      typeof testCase.source !== "string" ||
      typeof testCase.expectedTarget !== "string" ||
      typeof testCase.location !== "string" ||
      typeof testCase.status !== "number" ||
      typeof testCase.expectedPass !== "boolean"
    ) {
      throw new Error("canonical query fixture contains an invalid case.");
    }
    coveredHosts.add(new URL(testCase.source).hostname);
    const issues = redirectContractFailures(
      { status: testCase.status, location: testCase.location },
      testCase.source,
      testCase.expectedTarget,
    );
    const actualPass = issues.length === 0;
    if (actualPass !== testCase.expectedPass) {
      throw new Error(
        `${testCase.id} expected pass=${testCase.expectedPass}, received ${actualPass}.`,
      );
    }
    if (actualPass) passingCases += 1;
    else failingCases += 1;
  }
  if (
    passingCases === 0 ||
    failingCases === 0 ||
    !coveredHosts.has("jq33.design") ||
    !coveredHosts.has("www.jq33.design")
  ) {
    throw new Error(
      "canonical query fixture must contain positive and negative apex/www coverage.",
    );
  }
  console.log(
    `Canonical query preservation self-test passed: ${passingCases} positive and ${failingCases} negative cases.`,
  );
};

if (selfTest) {
  runQuerySelfTest();
  process.exit(0);
}

const request = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "jq33-canonical-host-check/1.0" },
    });
    return {
      url,
      status: response.status,
      location: response.headers.get("location") || "",
    };
  } finally {
    clearTimeout(timeout);
  }
};

const assertDirectRedirect = async (source, expectedTarget, label) => {
  let record;
  try {
    record = await request(source);
  } catch (error) {
    failures.push(`${label} request failed: ${error.message}`);
    return;
  }
  records.push({ kind: "canonical-redirect", label, expectedTarget, ...record });
  for (const issue of redirectContractFailures(record, source, expectedTarget)) {
    failures.push(`${label} ${issue}.`);
  }
};

const assertTaggedDirectRedirect = async (source, expectedTarget, label, tag) => {
  const tagged = withQueryProbe(source, expectedTarget, tag);
  await assertDirectRedirect(tagged.source, tagged.expectedTarget, label);
};

for (const route of [...publicRoutes, "/robots.txt", "/sitemap.xml"]) {
  const expected = `${canonicalOrigin}${route}`;
  await assertTaggedDirectRedirect(
    `http://jq33.design${route}`,
    expected,
    `HTTP apex ${route}`,
    `http-apex-${routeTag(route)}`,
  );
  await assertTaggedDirectRedirect(
    `https://www.jq33.design${route}`,
    expected,
    `HTTPS www ${route}`,
    `https-www-${routeTag(route)}`,
  );
  await assertTaggedDirectRedirect(
    `http://www.jq33.design${route}`,
    expected,
    `HTTP www ${route}`,
    `http-www-${routeTag(route)}`,
  );
}

for (const route of redirectRoutes) {
  const expected = `${canonicalOrigin}/`;
  await assertTaggedDirectRedirect(
    `${canonicalOrigin}${route}`,
    expected,
    `legacy apex ${route}`,
    `legacy-apex-${routeTag(route)}`,
  );
  await assertTaggedDirectRedirect(
    `https://www.jq33.design${route}`,
    expected,
    `legacy HTTPS www ${route}`,
    `legacy-https-www-${routeTag(route)}`,
  );
  await assertTaggedDirectRedirect(
    `http://www.jq33.design${route}`,
    expected,
    `legacy HTTP www ${route}`,
    `legacy-http-www-${routeTag(route)}`,
  );
}

const uniqueFailures = [...new Set(failures)];
const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  result: uniqueFailures.length ? "FAIL" : "PASS",
  canonicalOrigin,
  timeoutMs,
  queryProbe: {
    parameter: QUERY_PROBE_PARAMETER,
    expectedPreservation: "exact",
  },
  failures: uniqueFailures,
  records,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (uniqueFailures.length) {
  console.error("Canonical host matrix failed:");
  uniqueFailures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(
  `Canonical host matrix passed: ${records.length} one-hop 301 redirects.`,
);
