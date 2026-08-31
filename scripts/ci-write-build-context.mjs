import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const argumentValue = (name, fallback = "") => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const fail = (message) => {
  console.error(`Build context generation failed: ${message}`);
  process.exit(1);
};
const readRequired = (filePath, label) => {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    fail(`${label} does not exist: ${resolved}`);
  }
  return fs.readFileSync(resolved);
};
const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const manifestPath = argumentValue("--manifest", "dist-manifest.json");
const lockfilePath = argumentValue("--lockfile", "pnpm-lock.yaml");
const outputPath = path.resolve(
  argumentValue(
    "--output",
    ".agent/tasks/jq33-production-readiness-2026-07-29/raw/ci-build/build-context.json",
  ),
);
const manifestBytes = readRequired(manifestPath, "dist manifest");
const lockfileBytes = readRequired(lockfilePath, "lockfile");
let manifest;
try {
  manifest = JSON.parse(manifestBytes.toString("utf8"));
} catch (error) {
  fail(`dist manifest is not valid JSON: ${error.message}`);
}
if (!/^[a-f0-9]{64}$/.test(String(manifest.artifactSha256 || ""))) {
  fail("dist manifest lacks an artifact SHA-256.");
}
if (
  manifest.schemaVersion !== 2 ||
  !/^[a-f0-9]{64}$/.test(String(manifest.sourceTreeSha256 || "")) ||
  !Number.isSafeInteger(manifest.sourceInputCount) ||
  manifest.sourceInputCount < 1 ||
  manifest.sourceDirty !== false ||
  manifest.sourceChangeCount !== 0
) {
  fail("dist manifest does not bind a clean schema-v2 production source tree.");
}

const context = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  source: {
    repository: process.env.GITHUB_REPOSITORY || null,
    commit: process.env.GITHUB_SHA || manifest.sourceRevision,
    ref: process.env.GITHUB_REF || null,
    runId: process.env.GITHUB_RUN_ID || null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    lockfileSha256: sha256(lockfileBytes),
    sourceTreeSha256: manifest.sourceTreeSha256,
    sourceInputCount: manifest.sourceInputCount,
    sourceDirty: manifest.sourceDirty,
    sourceChangeCount: manifest.sourceChangeCount,
  },
  artifact: {
    sha256: manifest.artifactSha256,
    manifestSha256: sha256(manifestBytes),
    fileCount: Array.isArray(manifest.files) ? manifest.files.length : null,
  },
  toolchain: {
    node: process.version,
    pnpm: process.env.CI_PNPM_VERSION || null,
    chromium: process.env.CHROME_PATH || null,
    lighthouseBaseUrl: process.env.LIGHTHOUSE_BASE_URL || null,
    runnerImage: process.env.ImageOS || null,
    runnerImageVersion: process.env.ImageVersion || null,
  },
  completedCommands: [
    "corepack/pnpm setup at the pinned repository package-manager version",
    "pnpm install --frozen-lockfile --prod=false",
    "node scripts/check-ci-promotion.mjs",
    "pnpm build",
    "node scripts/ci-check-manual-cloudflare-analytics.mjs --root dist",
    "pnpm check:launch",
  ],
  requiredDeployedPreviewCommands: [
    "pnpm check:deployed",
    "LIGHTHOUSE_BASE_URL=<immutable preview origin> pnpm lighthouse:capture",
    "pnpm lighthouse:summarize",
  ],
  htmlMutationPolicy: "exact-byte-parity-reject",
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");
console.log(
  `Build context recorded for artifact ${context.artifact.sha256}, lockfile ${context.source.lockfileSha256}.`,
);
