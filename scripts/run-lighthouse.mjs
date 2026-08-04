import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  argumentValue,
  defaultRawRoot,
  publicRoutes,
  repositoryRoot,
  routeToRelativeHtml,
} from "../tests/helpers/site.mjs";

const baseValue = argumentValue("--base-url", process.env.LIGHTHOUSE_BASE_URL || "");
if (!baseValue) {
  console.error("LIGHTHOUSE_BASE_URL (or --base-url) is required; audits never skip.");
  process.exit(2);
}

let base;
try {
  base = new URL(baseValue);
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("URL must use HTTP(S)");
  if (base.pathname !== "/" || base.search || base.hash) {
    throw new Error("URL must be an origin with no path, query, or fragment");
  }
} catch (error) {
  console.error(`Invalid Lighthouse base URL: ${error.message}`);
  process.exit(2);
}

let lighthouse;
let launch;
let chromium;
try {
  ({ default: lighthouse } = await import("lighthouse"));
  ({ launch } = await import("chrome-launcher"));
  ({ chromium } = await import("@playwright/test"));
} catch (error) {
  console.error(
    `Pinned Lighthouse, Chrome Launcher, and Playwright devDependencies are required: ${error.message}`,
  );
  process.exit(2);
}
const chromePath = process.env.CHROME_PATH || chromium.executablePath();
if (!fs.existsSync(chromePath)) {
  console.error(`Pinned Chromium executable is missing: ${chromePath}`);
  process.exit(2);
}

const portableError = (error, context) => ({
  context,
  name: String(error?.name || "Error"),
  code: String(error?.code || "UNAVAILABLE"),
});

const outputDirectory = path.resolve(
  argumentValue(
    "--output-dir",
    process.env.LIGHTHOUSE_ARTIFACT_DIR || path.join(defaultRawRoot, "lighthouse"),
  ),
);
fs.mkdirSync(outputDirectory, { recursive: true });
for (const filename of fs.readdirSync(outputDirectory)) {
  if (
    filename.endsWith(".lhr.json") ||
    ["run-metadata.json", "summary.json"].includes(filename)
  ) {
    fs.rmSync(path.join(outputDirectory, filename), { force: true });
  }
}

const routeKey = (route) =>
  route === "/" ? "home" : route.replace(/^\/|\/$/g, "").replaceAll("/", "--");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const isSha256 = (value) => /^[a-f0-9]{64}$/i.test(String(value || ""));
const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);

const manifestPath = path.join(repositoryRoot, "dist-manifest.json");
let manifestBytes;
let manifest;
try {
  manifestBytes = fs.readFileSync(manifestPath);
  manifest = JSON.parse(manifestBytes.toString("utf8"));
} catch (error) {
  console.error(`A valid dist-manifest.json is required before Lighthouse: ${error.message}`);
  process.exit(2);
}
if (
  manifest.schemaVersion !== 2 ||
  !isSha256(manifest.artifactSha256) ||
  !isSha256(manifest.sourceTreeSha256) ||
  !Array.isArray(manifest.files) ||
  !Number.isSafeInteger(manifest.sourceInputCount) ||
  manifest.sourceInputCount < 1
) {
  console.error("Lighthouse requires an immutable schema-v2 distribution manifest.");
  process.exit(2);
}
if (!isLoopback && (manifest.sourceDirty !== false || manifest.sourceChangeCount !== 0)) {
  console.error("Deployed Lighthouse evidence requires a clean source-bound artifact.");
  process.exit(2);
}

const manifestFiles = new Map(manifest.files.map((file) => [file.path, file]));
const statusMatrixValue = argumentValue(
  "--status-matrix",
  process.env.LIGHTHOUSE_STATUS_MATRIX || "",
);
let statusMatrixSha256 = "";
let statusMatrixCheckedAt = "";
if (!isLoopback && !statusMatrixValue) {
  console.error(
    "LIGHTHOUSE_STATUS_MATRIX (or --status-matrix) is required for deployed Lighthouse evidence.",
  );
  process.exit(2);
}
if (statusMatrixValue) {
  const statusMatrixPath = path.resolve(statusMatrixValue);
  let statusMatrixBytes;
  let statusMatrix;
  try {
    statusMatrixBytes = fs.readFileSync(statusMatrixPath);
    statusMatrix = JSON.parse(statusMatrixBytes.toString("utf8"));
  } catch (error) {
    console.error(`The deployed status matrix is invalid: ${error.message}`);
    process.exit(2);
  }
  const checkedAt = Date.parse(statusMatrix.checkedAt || "");
  const ageMs = Date.now() - checkedAt;
  const publicRecords = Array.isArray(statusMatrix.records)
    ? statusMatrix.records.filter((record) => record.kind === "public-route")
    : [];
  const matrixFailures = [];
  if (
    statusMatrix.schemaVersion !== 1 ||
    statusMatrix.result !== "PASS" ||
    statusMatrix.baseUrl !== base.origin
  ) {
    matrixFailures.push("matrix identity/result does not match the requested deployment origin");
  }
  if (!Number.isFinite(checkedAt) || ageMs < -5 * 60_000 || ageMs > 30 * 60_000) {
    matrixFailures.push("matrix timestamp is invalid, in the future, or older than 30 minutes");
  }
  if (publicRecords.length !== publicRoutes.length) {
    matrixFailures.push(
      `matrix has ${publicRecords.length} public-route records; ${publicRoutes.length} are required`,
    );
  }
  for (const route of publicRoutes) {
    const matching = publicRecords.filter((record) => record.route === route);
    const manifestFile = manifestFiles.get(routeToRelativeHtml(route));
    if (matching.length !== 1) {
      matrixFailures.push(`${route} must appear exactly once in the matrix`);
      continue;
    }
    const record = matching[0];
    if (
      !manifestFile ||
      record.url !== new URL(route, base).href ||
      record.status !== 200 ||
      record.location !== "" ||
      !/^text\/html\b/i.test(record.contentType || "") ||
      record.sha256 !== manifestFile.sha256 ||
      record.expectedSha256 !== manifestFile.sha256
    ) {
      matrixFailures.push(`${route} is not a direct 200 response bound to the sealed artifact`);
    }
  }
  if (matrixFailures.length) {
    console.error("The deployed status matrix cannot authorize Lighthouse:");
    for (const failure of matrixFailures) console.error(`- ${failure}.`);
    process.exit(2);
  }
  statusMatrixSha256 = sha256(statusMatrixBytes);
  statusMatrixCheckedAt = statusMatrix.checkedAt;
}

const metadata = {
  schemaVersion: 2,
  startedAt: new Date().toISOString(),
  baseUrl: base.origin,
  node: process.version,
  lighthouse: "",
  chromeExecutable: path.basename(chromePath),
  sourceCommit: "",
  sourceTreeSha256: manifest.sourceTreeSha256,
  sourceInputCount: manifest.sourceInputCount,
  sourceDirty: manifest.sourceDirty,
  sourceChangeCount: manifest.sourceChangeCount,
  artifactSha256: "",
  artifactManifestSha256: "",
  statusMatrixSha256,
  statusMatrixCheckedAt,
  settings: {
    formFactor: "mobile",
    runsPerRoute: 3,
    throttlingMethod: "simulate",
    screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75 },
  },
  runs: [],
};

try {
  metadata.sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
} catch {
  metadata.sourceCommit = "unavailable";
}
if (metadata.sourceCommit !== manifest.sourceRevision) {
  console.error("dist-manifest.json source revision does not match the current checkout.");
  process.exit(2);
}
try {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, "node_modules", "lighthouse", "package.json"), "utf8"),
  );
  metadata.lighthouse = packageJson.version;
} catch {
  metadata.lighthouse = "unavailable";
}
metadata.artifactSha256 = manifest.artifactSha256;
metadata.artifactGeneratedAt = manifest.generatedAt || "";
metadata.artifactManifestSha256 = sha256(manifestBytes);

const successfulDocumentResponse = (lhr, expectedUrl) => {
  if (lhr.audits?.["http-status-code"]?.score !== 1) return false;
  const requests = lhr.audits?.["network-requests"]?.details?.items;
  if (!Array.isArray(requests)) return false;
  return requests.some(
    (request) =>
      request.resourceType === "Document" &&
      request.url === expectedUrl &&
      request.statusCode === 200,
  );
};

let chrome;
const chromeProfileDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "jq33-lighthouse-"),
);
let failed = false;
try {
  chrome = await launch({
    chromePath,
    logLevel: "error",
    userDataDir: chromeProfileDirectory,
    chromeFlags: [
      "--headless=new",
      ...(process.platform === "win32"
        ? ["--no-sandbox", "--disable-setuid-sandbox"]
        : []),
      "--no-first-run",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-sync",
    ],
  });

  for (const route of publicRoutes) {
    for (let run = 1; run <= 3; run += 1) {
      const url = new URL(route, base).href;
      const filename = `${routeKey(route)}--run-${run}.lhr.json`;
      const target = path.join(outputDirectory, filename);
      fs.rmSync(target, { force: true });
      const runRecord = {
        route,
        run,
        url,
        filename,
        startedAt: new Date().toISOString(),
        result: "UNKNOWN",
      };
      try {
        const result = await lighthouse(
          url,
          {
            port: chrome.port,
            output: "json",
            logLevel: "error",
            onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
            formFactor: "mobile",
            throttlingMethod: "simulate",
            screenEmulation: metadata.settings.screenEmulation,
            disableStorageReset: false,
          },
        );
        if (!result?.lhr) throw new Error("Lighthouse returned no LHR.");
        if (result.lhr.requestedUrl !== url) {
          throw new Error(
            `Lighthouse requested URL ${result.lhr.requestedUrl || "(missing)"} does not match ${url}.`,
          );
        }
        if (result.lhr.finalUrl !== url) {
          throw new Error(
            `Lighthouse final URL ${result.lhr.finalUrl || "(missing)"} does not match ${url}.`,
          );
        }
        if (!successfulDocumentResponse(result.lhr, url)) {
          throw new Error("Lighthouse did not observe an exact main-document HTTP 200 response.");
        }
        fs.writeFileSync(target, `${JSON.stringify(result.lhr)}\n`, "utf8");
        if (result.lhr.runtimeError) {
          throw new Error(
            `${result.lhr.runtimeError.code}: ${result.lhr.runtimeError.message}`,
          );
        }
        runRecord.result = "CAPTURED";
        runRecord.fetchTime = result.lhr.fetchTime;
        runRecord.finalUrl = result.lhr.finalUrl;
        runRecord.responseStatus = 200;
        runRecord.lighthouseVersion = result.lhr.lighthouseVersion;
      } catch (error) {
        failed = true;
        runRecord.result = "FAILED";
        runRecord.error = error.message;
        console.error(`${route} run ${run} failed: ${error.message}`);
      } finally {
        runRecord.finishedAt = new Date().toISOString();
        metadata.runs.push(runRecord);
      }
    }
  }
} catch (error) {
  failed = true;
  metadata.launchError = portableError(error, "lighthouse-runner");
  console.error(`Lighthouse runner failed: ${error.message}`);
} finally {
  if (chrome) {
    try {
      await Promise.resolve(chrome.kill());
    } catch (error) {
      metadata.cleanupWarnings = [portableError(error, "chrome-shutdown")];
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  try {
    fs.rmSync(chromeProfileDirectory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  } catch (error) {
    metadata.cleanupWarnings = [
      ...(metadata.cleanupWarnings || []),
      portableError(error, "temporary-profile-cleanup"),
    ];
  }
  metadata.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(outputDirectory, "run-metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );
}

if (failed || metadata.runs.length !== publicRoutes.length * 3) process.exit(1);
console.log(
  `Captured ${metadata.runs.length} raw mobile Lighthouse reports in ${outputDirectory}.`,
);
// Lighthouse and Chrome Launcher can retain Windows pipe handles after a
// successful shutdown. All evidence is synchronously sealed above, so end this
// CLI deterministically instead of leaving CI waiting on third-party handles.
process.exit(0);
