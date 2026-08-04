import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { canonicalOrigin, publicRoutes } from "../tests/helpers/site.mjs";

const argumentValue = (name, fallback = "") => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const baseUrl = argumentValue("--base-url", canonicalOrigin);
const outputPath = path.resolve(
  argumentValue(
    "--output",
    ".agent/tasks/jq33-production-readiness-2026-07-29/raw/deployed-production/browser-parity.json",
  ),
);
const runsPerRoute = Number(argumentValue("--runs", "3"));
const navigationTimeoutMs = Number(argumentValue("--timeout-ms", "30000"));
const settleMs = Number(argumentValue("--settle-ms", "3000"));
const maxLcpMs = Number(argumentValue("--max-lcp-ms", "2500"));
const maxCls = Number(argumentValue("--max-cls", "0.1"));
const maxBlockingInputMs = Number(
  argumentValue("--max-blocking-input-ms", "200"),
);
const selfTest = process.argv.includes("--self-test");
const boundaryFixturePath = path.resolve(
  argumentValue(
    "--boundary-fixture",
    "tests/fixtures/production-browser-parity-boundaries.json",
  ),
);
const failures = [];

let parsedBase;
try {
  parsedBase = new URL(baseUrl);
} catch {
  console.error("Production browser parity requires a valid --base-url.");
  process.exit(2);
}
if (parsedBase.origin !== canonicalOrigin || parsedBase.pathname !== "/") {
  console.error(`Production browser parity must target ${canonicalOrigin}.`);
  process.exit(2);
}
if (
  !Number.isInteger(runsPerRoute) ||
  runsPerRoute < 3 ||
  !Number.isFinite(navigationTimeoutMs) ||
  navigationTimeoutMs < 1 ||
  !Number.isFinite(settleMs) ||
  settleMs < 1
) {
  console.error("Browser parity run counts and timeouts are invalid.");
  process.exit(2);
}

const allowedThirdPartyHosts = new Set([
  "static.cloudflareinsights.com",
  "cloudflareinsights.com",
]);
const forbiddenBeforeActionHosts = [
  "formspree.io",
  "calendly.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "behance.net",
];
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const rounded = (value, digits = 2) =>
  Number(Number(value || 0).toFixed(digits));
const summarizeCwvMetrics = (rawMetrics, expectedRunCount, thresholds) => {
  if (!Array.isArray(rawMetrics) || rawMetrics.length !== expectedRunCount) {
    return { rawMedians: null, medians: null, violations: ["missing-runs"] };
  }
  const rawMedians = {
    lcpMs: median(rawMetrics.map((entry) => entry.lcpMs)),
    cls: median(rawMetrics.map((entry) => entry.cls)),
    longTaskBlockingInputMs: median(
      rawMetrics.map((entry) => entry.longTaskBlockingInputMs),
    ),
    domContentLoadedMs: median(
      rawMetrics.map((entry) => entry.domContentLoadedMs || 0),
    ),
    loadEventMs: median(rawMetrics.map((entry) => entry.loadEventMs || 0)),
  };
  const violations = [];
  if (rawMedians.lcpMs > thresholds.maxLcpMs) violations.push("lcp");
  if (rawMedians.cls > thresholds.maxCls) violations.push("cls");
  if (
    rawMedians.longTaskBlockingInputMs > thresholds.maxBlockingInputMs
  ) {
    violations.push("blocking-input");
  }
  return {
    rawMedians,
    medians: {
      lcpMs: rounded(rawMedians.lcpMs),
      cls: rounded(rawMedians.cls, 4),
      longTaskBlockingInputMs: rounded(rawMedians.longTaskBlockingInputMs),
      domContentLoadedMs: rounded(rawMedians.domContentLoadedMs),
      loadEventMs: rounded(rawMedians.loadEventMs),
    },
    violations,
  };
};

const runBoundarySelfTest = () => {
  if (!fs.existsSync(boundaryFixturePath)) {
    throw new Error(`CWV boundary fixture is missing: ${boundaryFixturePath}`);
  }
  const fixture = JSON.parse(fs.readFileSync(boundaryFixturePath, "utf8"));
  if (fixture.schemaVersion !== 1 || !Array.isArray(fixture.cases)) {
    throw new Error("CWV boundary fixture must use schemaVersion 1 with cases.");
  }
  const requiredCases = new Set([
    "exact-boundaries-pass",
    "just-over-lcp-fails-before-rounding",
    "just-over-cls-fails-before-rounding",
    "just-over-blocking-input-fails-before-rounding",
  ]);
  for (const testCase of fixture.cases) {
    if (
      !testCase ||
      typeof testCase.id !== "string" ||
      !Array.isArray(testCase.runs) ||
      typeof testCase.expectedPass !== "boolean"
    ) {
      throw new Error("CWV boundary fixture contains an invalid case.");
    }
    requiredCases.delete(testCase.id);
    const summary = summarizeCwvMetrics(
      testCase.runs,
      testCase.runs.length,
      fixture.thresholds,
    );
    const actualPass = summary.violations.length === 0;
    if (actualPass !== testCase.expectedPass) {
      throw new Error(
        `${testCase.id} expected pass=${testCase.expectedPass}, received ${actualPass}.`,
      );
    }
    if (
      testCase.expectedRoundedMedians &&
      JSON.stringify(summary.medians) !==
        JSON.stringify(testCase.expectedRoundedMedians)
    ) {
      throw new Error(`${testCase.id} did not preserve display-only rounding.`);
    }
  }
  if (requiredCases.size) {
    throw new Error(
      `CWV boundary fixture is missing required cases: ${[...requiredCases].join(", ")}.`,
    );
  }
  console.log(
    `Production browser parity boundary self-test passed: ${fixture.cases.length} raw-value cases.`,
  );
};
const cloudflareAnalyticsRequestKind = (request, requestUrl) => {
  const method = String(request.method || "").toUpperCase();
  const resourceType = request.resourceType;
  if (
    requestUrl.hostname === "static.cloudflareinsights.com" &&
    /^\/beacon\.min\.js(?:\/|$)/.test(requestUrl.pathname) &&
    method === "GET" &&
    resourceType === "script"
  ) {
    return "beacon-script";
  }
  if (
    (requestUrl.hostname === "cloudflareinsights.com" ||
      requestUrl.origin === parsedBase.origin) &&
    requestUrl.pathname === "/cdn-cgi/rum" &&
    method === "POST" &&
    ["fetch", "xhr", "other"].includes(resourceType)
  ) {
    return "rum";
  }
  return "";
};

if (selfTest) {
  runBoundarySelfTest();
  process.exit(0);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-background-networking", "--no-default-browser-check"],
});
const routeReports = [];
try {
  for (const route of publicRoutes) {
    const runReports = [];
    const rawRunMetrics = [];
    for (let runNumber = 1; runNumber <= runsPerRoute; runNumber += 1) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      await context.addInitScript(() => {
        window.__JQ33_CWV_INPUTS__ = {
          lcpMs: 0,
          cls: 0,
          longTasks: [],
        };
        try {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const last = entries[entries.length - 1];
            if (last) window.__JQ33_CWV_INPUTS__.lcpMs = last.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) {
                window.__JQ33_CWV_INPUTS__.cls += entry.value;
              }
            }
          }).observe({ type: "layout-shift", buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              window.__JQ33_CWV_INPUTS__.longTasks.push(entry.duration);
            }
          }).observe({ type: "longtask", buffered: true });
        } catch {
          // Missing observers result in zero/missing metrics and are rejected below.
        }
      });
      const page = await context.newPage();
      const consoleMessages = [];
      const pageErrors = [];
      const requests = [];
      const failedRequests = [];
      const badResponses = [];
      page.on("console", (message) => {
        consoleMessages.push({ type: message.type(), text: message.text() });
      });
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("request", (request) => {
        requests.push({
          url: request.url(),
          method: request.method(),
          resourceType: request.resourceType(),
        });
      });
      page.on("requestfailed", (request) => {
        failedRequests.push({
          url: request.url(),
          method: request.method(),
          resourceType: request.resourceType(),
          error: request.failure()?.errorText || "unknown",
        });
      });
      page.on("response", (response) => {
        if (response.status() >= 400) {
          badResponses.push({ url: response.url(), status: response.status() });
        }
      });

      const url = new URL(route, parsedBase).href;
      let navigationError = "";
      try {
        await page.goto(url, {
          waitUntil: "load",
          timeout: navigationTimeoutMs,
        });
        await page.waitForTimeout(settleMs);
      } catch (error) {
        navigationError = error.message;
      }
      const metrics = navigationError
        ? null
        : await page.evaluate(() => {
            const data = window.__JQ33_CWV_INPUTS__ || {};
            const navigation = performance.getEntriesByType("navigation")[0];
            const longTasks = Array.isArray(data.longTasks) ? data.longTasks : [];
            return {
              lcpMs: data.lcpMs || 0,
              cls: data.cls || 0,
              longTaskBlockingInputMs: longTasks.reduce(
                (total, duration) => total + Math.max(0, duration - 50),
                0,
              ),
              longTaskCount: longTasks.length,
              domContentLoadedMs: navigation?.domContentLoadedEventEnd || 0,
              loadEventMs: navigation?.loadEventEnd || 0,
              transferSize: navigation?.transferSize || 0,
              encodedBodySize: navigation?.encodedBodySize || 0,
            };
          });
      await context.close();
      if (metrics) rawRunMetrics.push(metrics);

      const thirdPartyRequests = [];
      const disallowedThirdPartyRequests = [];
      const preActionProcessorRequests = [];
      const remoteImageOrFontRequests = [];
      const supabaseRequests = [];
      const cloudflareAnalyticsScriptRequests = [];
      const cloudflareRumRequests = [];
      for (const request of requests) {
        let requestUrl;
        try {
          requestUrl = new URL(request.url);
        } catch {
          continue;
        }
        if (!["http:", "https:"].includes(requestUrl.protocol)) continue;
        const hostname = requestUrl.hostname.toLowerCase();
        const analyticsKind = cloudflareAnalyticsRequestKind(request, requestUrl);
        if (analyticsKind === "beacon-script") {
          cloudflareAnalyticsScriptRequests.push(request);
        } else if (analyticsKind === "rum") {
          cloudflareRumRequests.push(request);
        }
        if (hostname.includes("supabase")) supabaseRequests.push(request);
        if (forbiddenBeforeActionHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
          preActionProcessorRequests.push(request);
        }
        if (hostname !== parsedBase.hostname) {
          thirdPartyRequests.push(request);
          if (!analyticsKind) {
            disallowedThirdPartyRequests.push(request);
          }
          if (["image", "font"].includes(request.resourceType)) {
            remoteImageOrFontRequests.push(request);
          }
        }
      }
      const errorConsoleMessages = consoleMessages.filter(
        (message) => message.type === "error" || message.type === "assert",
      );
      const report = {
        run: runNumber,
        url,
        navigationError,
        metrics: metrics
          ? {
              lcpMs: rounded(metrics.lcpMs),
              cls: rounded(metrics.cls, 4),
              longTaskBlockingInputMs: rounded(metrics.longTaskBlockingInputMs),
              longTaskCount: metrics.longTaskCount,
              domContentLoadedMs: rounded(metrics.domContentLoadedMs),
              loadEventMs: rounded(metrics.loadEventMs),
              transferSize: metrics.transferSize,
              encodedBodySize: metrics.encodedBodySize,
            }
          : null,
        consoleMessages,
        pageErrors,
        requestCount: requests.length,
        thirdPartyRequests,
        disallowedThirdPartyRequests,
        preActionProcessorRequests,
        remoteImageOrFontRequests,
        supabaseRequests,
        cloudflareAnalyticsScriptRequests,
        cloudflareRumRequests,
        failedRequests,
        badResponses,
      };
      runReports.push(report);
      const prefix = `${route} run ${runNumber}`;
      if (navigationError) failures.push(`${prefix} navigation failed: ${navigationError}`);
      if (!metrics || metrics.lcpMs <= 0) failures.push(`${prefix} did not capture an LCP input.`);
      if (errorConsoleMessages.length) failures.push(`${prefix} emitted console errors.`);
      if (pageErrors.length) failures.push(`${prefix} emitted runtime page errors.`);
      if (failedRequests.length) failures.push(`${prefix} had failed network requests.`);
      if (badResponses.length) failures.push(`${prefix} received HTTP error responses.`);
      if (disallowedThirdPartyRequests.length) failures.push(`${prefix} contacted an unapproved third party.`);
      if (preActionProcessorRequests.length) failures.push(`${prefix} contacted an action-only processor before user action.`);
      if (remoteImageOrFontRequests.length) failures.push(`${prefix} loaded a remote image or font.`);
      if (supabaseRequests.length) failures.push(`${prefix} contacted Supabase.`);
      if (cloudflareAnalyticsScriptRequests.length === 0) {
        failures.push(`${prefix} did not load the source-managed Cloudflare Web Analytics beacon.`);
      }
      if (cloudflareRumRequests.length === 0) {
        failures.push(`${prefix} did not emit a Cloudflare Web Analytics RUM request.`);
      }
    }
    const cwvSummary = summarizeCwvMetrics(rawRunMetrics, runsPerRoute, {
      maxLcpMs,
      maxCls,
      maxBlockingInputMs,
    });
    const medians = cwvSummary.medians;
    if (!medians) {
      failures.push(`${route} is missing one or more browser metric runs.`);
    } else {
      if (cwvSummary.violations.includes("lcp")) {
        failures.push(`${route} median LCP input exceeds ${maxLcpMs}ms.`);
      }
      if (cwvSummary.violations.includes("cls")) {
        failures.push(`${route} median CLS input exceeds ${maxCls}.`);
      }
      if (cwvSummary.violations.includes("blocking-input")) {
        failures.push(`${route} median long-task blocking input exceeds ${maxBlockingInputMs}ms.`);
      }
    }
    routeReports.push({ route, medians, runs: runReports });
  }
} finally {
  await browser.close();
}

const uniqueFailures = [...new Set(failures)];
const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  result: uniqueFailures.length ? "FAIL" : "PASS",
  scope: "production-browser-parity",
  baseUrl: parsedBase.origin,
  productionMode: true,
  browserEngine: "playwright-chromium",
  viewport: { width: 390, height: 844, mobile: true },
  runsPerRoute,
  thresholds: { maxLcpMs, maxCls, maxBlockingInputMs },
  thresholdComparisonPrecision: "raw-unrounded",
  privacyPolicy: {
    allowedThirdPartyHosts: [...allowedThirdPartyHosts].sort(),
    sourceManagedCloudflareAnalyticsRequired: true,
    actionOnlyProcessorsMustRemainIdle: true,
    remoteImagesAndFontsAllowed: false,
    supabaseAllowed: false,
  },
  failures: uniqueFailures,
  routes: routeReports,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (uniqueFailures.length) {
  console.error("Production browser parity failed:");
  uniqueFailures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(
  `Production browser parity passed for ${publicRoutes.length} routes x ${runsPerRoute} runs: source-managed Cloudflare analytics is live, no console/runtime/network/privacy regressions occurred, and CWV inputs are within budget.`,
);
