import fs from "node:fs";
import path from "node:path";
import {
  canonicalOrigin,
  publicRoutes,
} from "../tests/helpers/site.mjs";

const argumentValue = (name, fallback = "") => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const outputPath = path.resolve(
  argumentValue(
    "--output",
    ".agent/tasks/jq33-production-readiness-2026-07-29/raw/deployed-production/performance-smoke.json",
  ),
);
const attemptsPerRoute = Number(argumentValue("--attempts", "3"));
const timeoutMs = Number(argumentValue("--timeout-ms", "15000"));
const maxMedianResponseMs = Number(
  argumentValue("--max-median-response-ms", "2500"),
);
const failures = [];
const routes = [];

if (!Number.isInteger(attemptsPerRoute) || attemptsPerRoute < 3) {
  console.error("Production performance smoke requires at least three attempts per route.");
  process.exit(2);
}
if (
  !Number.isFinite(timeoutMs) ||
  timeoutMs <= 0 ||
  !Number.isFinite(maxMedianResponseMs) ||
  maxMedianResponseMs <= 0
) {
  console.error("Performance smoke timing limits must be positive numbers.");
  process.exit(2);
}

const request = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "text/html",
        "Cache-Control": "no-cache",
        "User-Agent": "jq33-production-performance-smoke/1.0",
      },
    });
    const body = Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      bytes: body.length,
      contentType: response.headers.get("content-type") || "",
      location: response.headers.get("location") || "",
      cfCacheStatus: response.headers.get("cf-cache-status") || "",
      serverTiming: response.headers.get("server-timing") || "",
    };
  } finally {
    clearTimeout(timeout);
  }
};

for (const route of publicRoutes) {
  const url = `${canonicalOrigin}${route}`;
  const attempts = [];
  try {
    // Warm the public edge once; only the following three or more requests are measured.
    await request(url);
    for (let attempt = 0; attempt < attemptsPerRoute; attempt += 1) {
      attempts.push(await request(url));
    }
  } catch (error) {
    failures.push(`${route} request failed: ${error.message}`);
  }
  for (const [index, result] of attempts.entries()) {
    if (result.status !== 200) {
      failures.push(`${route} attempt ${index + 1} returned ${result.status}.`);
    }
    if (!/^text\/html\b/i.test(result.contentType)) {
      failures.push(
        `${route} attempt ${index + 1} returned "${result.contentType}", not HTML.`,
      );
    }
    if (result.location) {
      failures.push(`${route} attempt ${index + 1} unexpectedly redirected.`);
    }
    if (result.bytes === 0) {
      failures.push(`${route} attempt ${index + 1} returned an empty body.`);
    }
  }
  const durations = attempts
    .map((attempt) => attempt.durationMs)
    .sort((a, b) => a - b);
  const medianResponseMs =
    durations.length > 0 ? durations[Math.floor(durations.length / 2)] : null;
  if (
    medianResponseMs !== null &&
    medianResponseMs > maxMedianResponseMs
  ) {
    failures.push(
      `${route} median response ${medianResponseMs}ms exceeds ${maxMedianResponseMs}ms.`,
    );
  }
  routes.push({ route, url, medianResponseMs, attempts });
}

const uniqueFailures = [...new Set(failures)];
const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  result: uniqueFailures.length ? "FAIL" : "PASS",
  scope: "production-performance-parity-smoke",
  baseUrl: canonicalOrigin,
  attemptsPerRoute,
  timeoutMs,
  maxMedianResponseMs,
  failures: uniqueFailures,
  routes,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (uniqueFailures.length) {
  console.error("Production performance smoke failed:");
  uniqueFailures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(
  `Production performance smoke passed for ${routes.length} routes (${attemptsPerRoute} measured requests each).`,
);
