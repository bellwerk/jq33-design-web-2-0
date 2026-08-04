import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  argumentValue,
  defaultRawRoot,
  publicRoutes,
  repositoryRoot,
} from "../tests/helpers/site.mjs";

const inputDirectory = path.resolve(
  argumentValue(
    "--input-dir",
    process.env.LIGHTHOUSE_ARTIFACT_DIR || path.join(defaultRawRoot, "lighthouse"),
  ),
);
const outputFile = path.resolve(
  argumentValue("--output-file", path.join(inputDirectory, "summary.json")),
);
const portableInputDirectory =
  path.relative(repositoryRoot, inputDirectory).replaceAll("\\", "/") || ".";

if (!fs.existsSync(inputDirectory) || !fs.statSync(inputDirectory).isDirectory()) {
  console.error(`Lighthouse report directory is missing: ${inputDirectory}`);
  process.exit(2);
}

const thresholds = {
  performance: { comparison: "minimum", value: 90 },
  accessibility: { comparison: "minimum", value: 95 },
  bestPractices: { comparison: "minimum", value: 95 },
  seo: { comparison: "minimum", value: 95 },
  lcpMs: { comparison: "maximum", value: 2500 },
  cls: { comparison: "maximum", value: 0.1 },
  tbtMs: { comparison: "maximum", value: 200 },
};
const failures = [];
const groups = new Map(publicRoutes.map((route) => [route, []]));
const metadataPath = path.join(inputDirectory, "run-metadata.json");
const routeKey = (route) =>
  route === "/" ? "home" : route.replace(/^\/|\/$/g, "").replaceAll("/", "--");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const isSha256 = (value) => /^[a-f0-9]{64}$/i.test(String(value || ""));
let metadata = null;
let metadataRuns = new Map();
let metadataStart = Number.NaN;
let metadataFinish = Number.NaN;

if (!fs.existsSync(metadataPath)) {
  failures.push("run-metadata.json is missing; raw reports cannot be proven to be one controlled run set.");
} else {
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    if (metadata.schemaVersion !== 2) {
      failures.push("run-metadata.json must use schemaVersion 2.");
    }
    if (!metadata.startedAt || !metadata.finishedAt) {
      failures.push("run-metadata.json lacks complete run timestamps.");
    }
    metadataStart = Date.parse(metadata.startedAt);
    metadataFinish = Date.parse(metadata.finishedAt);
    if (!Number.isFinite(metadataStart) || !Number.isFinite(metadataFinish) || metadataFinish < metadataStart) {
      failures.push("run-metadata.json has an invalid run time window.");
    }
    if (!metadata.sourceCommit || metadata.sourceCommit === "unavailable") {
      failures.push("run-metadata.json lacks a source commit.");
    }
    if (!metadata.lighthouse || metadata.lighthouse === "unavailable") {
      failures.push("run-metadata.json lacks the Lighthouse version.");
    }
    if (!isSha256(metadata.artifactSha256)) {
      failures.push("run-metadata.json lacks the sealed artifact SHA-256.");
    }
    if (!isSha256(metadata.artifactManifestSha256)) {
      failures.push("run-metadata.json lacks the artifact manifest SHA-256.");
    }
    if (!isSha256(metadata.sourceTreeSha256)) {
      failures.push("run-metadata.json lacks the declared source-tree SHA-256.");
    }
    if (!Number.isSafeInteger(metadata.sourceInputCount) || metadata.sourceInputCount < 1) {
      failures.push("run-metadata.json lacks a positive source input count.");
    }
    let metadataBase = null;
    try {
      metadataBase = new URL(metadata.baseUrl);
    } catch {
      failures.push("run-metadata.json has an invalid baseUrl.");
    }
    const metadataIsLoopback = metadataBase
      ? ["localhost", "127.0.0.1", "[::1]"].includes(metadataBase.hostname)
      : false;
    if (!metadataIsLoopback && metadata.sourceDirty !== false) {
      failures.push("deployed Lighthouse metadata must bind a clean source tree.");
    }
    if (!metadataIsLoopback && !isSha256(metadata.statusMatrixSha256)) {
      failures.push("deployed Lighthouse metadata lacks a status-matrix SHA-256.");
    }
    try {
      const manifestBytes = fs.readFileSync(
        path.join(repositoryRoot, "dist-manifest.json"),
      );
      const manifest = JSON.parse(manifestBytes.toString("utf8"));
      if (manifest.schemaVersion !== 2) {
        failures.push("dist-manifest.json must use schemaVersion 2.");
      }
      if (manifest.artifactSha256 !== metadata.artifactSha256) {
        failures.push("run-metadata.json artifact SHA-256 does not match dist-manifest.json.");
      }
      if (sha256(manifestBytes) !== metadata.artifactManifestSha256) {
        failures.push("run-metadata.json manifest SHA-256 does not match dist-manifest.json bytes.");
      }
      if (
        manifest.sourceRevision !== metadata.sourceCommit ||
        manifest.sourceTreeSha256 !== metadata.sourceTreeSha256 ||
        manifest.sourceInputCount !== metadata.sourceInputCount ||
        manifest.sourceDirty !== metadata.sourceDirty ||
        manifest.sourceChangeCount !== metadata.sourceChangeCount
      ) {
        failures.push("run-metadata.json source identity does not match dist-manifest.json.");
      }
    } catch (error) {
      failures.push(`dist-manifest.json cannot be correlated: ${error.message}`);
    }
    if (metadata.settings?.formFactor !== "mobile" || metadata.settings?.runsPerRoute !== 3 || metadata.settings?.throttlingMethod !== "simulate") {
      failures.push("run-metadata.json does not describe the required three-run simulated mobile configuration.");
    }
    if (!Array.isArray(metadata.runs) || metadata.runs.length !== publicRoutes.length * 3) {
      failures.push(
        `run-metadata.json has ${metadata.runs?.length ?? 0} run records; ${publicRoutes.length * 3} are required.`,
      );
    } else {
      for (const run of metadata.runs) {
        const expectedFilename = `${routeKey(run.route || "")}--run-${run.run}.lhr.json`;
        const key = `${run.route}#${run.run}`;
        if (metadataRuns.has(key)) {
          failures.push(`run-metadata.json contains duplicate run ${key}.`);
        }
        metadataRuns.set(key, run);
        if (!publicRoutes.includes(run.route) || ![1, 2, 3].includes(run.run)) {
          failures.push(`run-metadata.json contains unexpected route/run ${key}.`);
        }
        if (run.filename !== expectedFilename) {
          failures.push(`run-metadata.json filename ${run.filename || "(missing)"} does not match ${expectedFilename}.`);
        }
        let expectedUrl = "";
        try {
          expectedUrl = new URL(run.route, metadata.baseUrl).href;
        } catch {
          failures.push(`run-metadata.json has invalid base URL or route for ${key}.`);
        }
        if (expectedUrl && run.url !== expectedUrl) {
          failures.push(`run-metadata.json URL for ${key} does not match ${expectedUrl}.`);
        }
        if (run.result !== "CAPTURED") {
          failures.push(
            `run-metadata.json marks ${run.route || "unknown route"} run ${run.run || "?"} as ${run.result || "UNKNOWN"}.`,
          );
        }
        if (run.finalUrl !== run.url || run.responseStatus !== 200) {
          failures.push(`${key} is not an exact, direct HTTP 200 capture.`);
        }
        if (!run.filename || !fs.existsSync(path.join(inputDirectory, run.filename))) {
          failures.push(
            `run-metadata.json references a missing raw report: ${run.filename || "(missing filename)"}.`,
          );
        }
      }
    }
  } catch (error) {
    failures.push(`run-metadata.json is invalid: ${error.message}`);
  }
}

const normalizeRoute = (value) => {
  const pathname = new URL(value).pathname;
  if (pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
};

const reportFilenames = fs
  .readdirSync(inputDirectory)
  .filter((name) => name.endsWith(".lhr.json"))
  .sort();
if (reportFilenames.length !== publicRoutes.length * 3) {
  failures.push(
    `report directory contains ${reportFilenames.length} LHR files; exactly ${publicRoutes.length * 3} are required.`,
  );
}
for (const filename of reportFilenames) {
  const fullPath = path.join(inputDirectory, filename);
  let lhr;
  try {
    lhr = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (error) {
    failures.push(`${filename} is not valid JSON: ${error.message}`);
    continue;
  }
  if (lhr.runtimeError) {
    failures.push(`${filename} has runtimeError ${lhr.runtimeError.code || "unknown"}.`);
    continue;
  }
  const metadataRun = [...metadataRuns.values()].find(
    (run) => run.filename === filename,
  );
  if (!metadataRun) {
    failures.push(`${filename} is not referenced by run-metadata.json.`);
    continue;
  }
  if (lhr.requestedUrl !== metadataRun.url) {
    failures.push(`${filename} requestedUrl does not match run-metadata.json.`);
  }
  if (lhr.requestedUrl !== lhr.finalUrl || lhr.finalUrl !== metadataRun.url) {
    failures.push(`${filename} did not remain on the exact requested URL.`);
  }
  if (lhr.finalUrl !== metadataRun.finalUrl) {
    failures.push(`${filename} finalUrl does not match run-metadata.json.`);
  }
  if (lhr.lighthouseVersion !== metadata.lighthouse || metadataRun.lighthouseVersion !== metadata.lighthouse) {
    failures.push(`${filename} Lighthouse version does not match run-metadata.json.`);
  }
  if (lhr.fetchTime !== metadataRun.fetchTime) {
    failures.push(`${filename} fetchTime does not match run-metadata.json.`);
  }
  const fetchTime = Date.parse(lhr.fetchTime);
  if (!Number.isFinite(fetchTime) || fetchTime < metadataStart || fetchTime > metadataFinish) {
    failures.push(`${filename} fetchTime falls outside the controlled run window.`);
  }
  if (lhr.configSettings?.formFactor !== "mobile" || lhr.configSettings?.throttlingMethod !== "simulate") {
    failures.push(`${filename} does not use the required simulated mobile configuration.`);
  }
  if (lhr.audits?.["http-status-code"]?.score !== 1) {
    failures.push(`${filename} does not pass Lighthouse's HTTP status audit.`);
  }
  const networkRequests = lhr.audits?.["network-requests"]?.details?.items;
  if (
    !Array.isArray(networkRequests) ||
    !networkRequests.some(
      (request) =>
        request.resourceType === "Document" &&
        request.url === metadataRun.url &&
        request.statusCode === 200,
    )
  ) {
    failures.push(`${filename} lacks an exact main-document HTTP 200 network record.`);
  }
  let route;
  try {
    route = normalizeRoute(lhr.requestedUrl || lhr.finalUrl);
  } catch {
    failures.push(`${filename} lacks a valid requested/final URL.`);
    continue;
  }
  if (!groups.has(route)) {
    failures.push(`${filename} belongs to unexpected route ${route}.`);
    continue;
  }
  const metrics = {
    performance: lhr.categories?.performance?.score * 100,
    accessibility: lhr.categories?.accessibility?.score * 100,
    bestPractices: lhr.categories?.["best-practices"]?.score * 100,
    seo: lhr.categories?.seo?.score * 100,
    lcpMs: lhr.audits?.["largest-contentful-paint"]?.numericValue,
    cls: lhr.audits?.["cumulative-layout-shift"]?.numericValue,
    tbtMs: lhr.audits?.["total-blocking-time"]?.numericValue,
  };
  for (const [metric, value] of Object.entries(metrics)) {
    if (!Number.isFinite(value)) failures.push(`${filename} lacks numeric ${metric}.`);
  }
  groups.get(route).push({ filename, fetchTime: lhr.fetchTime, metrics });
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const routes = [];
for (const route of publicRoutes) {
  const runs = groups.get(route);
  if (runs.length !== 3) {
    failures.push(`${route} has ${runs.length} successful raw runs; exactly 3 are required.`);
    routes.push({ route, result: "UNKNOWN", runs });
    continue;
  }
  const medians = Object.fromEntries(
    Object.keys(thresholds).map((metric) => [
      metric,
      median(runs.map((run) => run.metrics[metric])),
    ]),
  );
  const routeFailures = [];
  for (const [metric, threshold] of Object.entries(thresholds)) {
    const value = medians[metric];
    const passed =
      threshold.comparison === "minimum"
        ? value >= threshold.value
        : value <= threshold.value;
    if (!passed) {
      routeFailures.push(
        `${metric} median ${value} does not meet ${threshold.comparison} ${threshold.value}`,
      );
    }
  }
  for (const failure of routeFailures) failures.push(`${route}: ${failure}.`);
  routes.push({
    route,
    result: routeFailures.length ? "FAIL" : "PASS",
    medians,
    runs,
  });
}

const uniqueFailures = [...new Set(failures)];
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(
  outputFile,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      summarizedAt: new Date().toISOString(),
      inputDirectory: portableInputDirectory,
      sourceCommit: metadata?.sourceCommit || "unavailable",
      sourceTreeSha256: metadata?.sourceTreeSha256 || "",
      sourceInputCount: metadata?.sourceInputCount || 0,
      sourceDirty: metadata?.sourceDirty ?? null,
      artifactSha256: metadata?.artifactSha256 || "",
      artifactManifestSha256: metadata?.artifactManifestSha256 || "",
      statusMatrixSha256: metadata?.statusMatrixSha256 || "",
      thresholds,
      result: uniqueFailures.length ? "FAIL" : "PASS",
      failures: uniqueFailures,
      routes,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

if (uniqueFailures.length) {
  console.error("Lighthouse median budget validation failed:");
  for (const failure of uniqueFailures) console.error(`- ${failure}`);
  console.error(`Raw summary: ${outputFile}`);
  process.exit(1);
}
console.log(`All per-route Lighthouse medians meet the budgets. Raw summary: ${outputFile}`);
