import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TASK_ID = "jq33-production-readiness-2026-07-29";
export const TASK_ROOT = `.agent/tasks/${TASK_ID}`;
export const WORKFLOW_PATH = ".github/workflows/production-readiness.yml";
export const MAX_EVIDENCE_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
export const isSha256 = (value) => /^[a-f0-9]{64}$/.test(String(value || ""));
export const isCommit = (value) => /^[a-f0-9]{40}$/.test(String(value || ""));
export const isIsoTimestamp = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value));

export const assertExactKeys = (object, expected, label, fail) => {
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    fail(`${label} must be an object.`);
  }
  const actual = Object.keys(object).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((value, index) => value !== wanted[index])
  ) {
    fail(`${label} keys must be exactly: ${wanted.join(", ")}.`);
  }
};

export const readJsonFile = (filePath, label, fail) => {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    fail(`${label} file does not exist: ${resolved}`);
  }
  const bytes = fs.readFileSync(resolved);
  try {
    return {
      path: resolved,
      bytes,
      sha256: sha256(bytes),
      value: JSON.parse(bytes.toString("utf8")),
    };
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
};

const normalizedRelativePath = (value) => value.split(path.sep).join("/");

export const validateProofRef = (
  reference,
  {
    repoRoot,
    referenceTime,
    label,
    fail,
    maxAgeMs = MAX_EVIDENCE_AGE_MS,
    parseJson = false,
  },
) => {
  assertExactKeys(reference, ["path", "sha256", "checkedAt"], label, fail);
  if (
    typeof reference.path !== "string" ||
    reference.path.startsWith("/") ||
    reference.path.includes("\\") ||
    !reference.path.startsWith(`${TASK_ROOT}/`) ||
    reference.path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    fail(`${label}.path must be a safe in-repository path beneath ${TASK_ROOT}/.`);
  }
  if (!isSha256(reference.sha256)) {
    fail(`${label}.sha256 must be a lowercase SHA-256.`);
  }
  if (!isIsoTimestamp(reference.checkedAt)) {
    fail(`${label}.checkedAt must be a UTC ISO-8601 timestamp.`);
  }
  const checkedAt = Date.parse(reference.checkedAt);
  const referenceMillis = Date.parse(referenceTime);
  if (!Number.isFinite(referenceMillis)) {
    fail(`${label} cannot be freshness-checked against an invalid reference time.`);
  }
  if (checkedAt > referenceMillis + MAX_CLOCK_SKEW_MS) {
    fail(`${label} is dated in the future.`);
  }
  if (referenceMillis - checkedAt > maxAgeMs) {
    fail(`${label} is stale (older than ${Math.round(maxAgeMs / 86_400_000)} days).`);
  }

  const repositoryRoot = fs.realpathSync(path.resolve(repoRoot));
  const taskRoot = fs.realpathSync(path.resolve(repositoryRoot, TASK_ROOT));
  const resolved = path.resolve(repositoryRoot, ...reference.path.split("/"));
  if (!fs.existsSync(resolved)) {
    fail(`${label} points to a missing file: ${reference.path}.`);
  }
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail(`${label} must point to a regular, non-symlink file.`);
  }
  const real = fs.realpathSync(resolved);
  const relativeToTask = normalizedRelativePath(path.relative(taskRoot, real));
  if (
    relativeToTask === "" ||
    relativeToTask === ".." ||
    relativeToTask.startsWith("../") ||
    path.isAbsolute(relativeToTask)
  ) {
    fail(`${label} resolves outside ${TASK_ROOT}/.`);
  }
  const bytes = fs.readFileSync(real);
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== reference.sha256) {
    fail(
      `${label} hash ${actualSha256} does not match declared ${reference.sha256}.`,
    );
  }
  let json = null;
  if (parseJson) {
    try {
      json = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      fail(`${label} must contain valid JSON: ${error.message}`);
    }
  }
  return {
    path: reference.path,
    sha256: actualSha256,
    checkedAt: reference.checkedAt,
    bytes: bytes.length,
    json,
  };
};

export const validateProofRefs = (references, options) => {
  if (!Array.isArray(references) || references.length === 0) {
    options.fail(`${options.label} must cite at least one structured evidence reference.`);
  }
  const seen = new Set();
  return references.map((reference, index) => {
    const result = validateProofRef(reference, {
      ...options,
      label: `${options.label}[${index}]`,
    });
    if (seen.has(result.path)) {
      options.fail(`${options.label} contains duplicate path ${result.path}.`);
    }
    seen.add(result.path);
    return result;
  });
};
