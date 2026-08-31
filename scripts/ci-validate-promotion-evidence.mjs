import fs from "node:fs";
import path from "node:path";
import {
  MAX_EVIDENCE_AGE_MS,
  TASK_ID,
  TASK_ROOT,
  assertExactKeys,
  isCommit,
  isIsoTimestamp,
  isSha256,
  readJsonFile,
  sha256,
  validateProofRef,
  validateProofRefs,
} from "./ci-proof-utils.mjs";
import {
  validateCandidateIntegrations,
  validateExternalGateEvidence,
} from "./ci-external-gate-evidence.mjs";
import { publicRoutes } from "../tests/helpers/site.mjs";
import { RESOLVED_PROBLEMS_TEXT } from "./render-task-evidence.mjs";

const MAIN_REF = "refs/heads/main";
const PRODUCTION_DEFERRED_CRITERIA = new Map([
  [
    "AC2",
    "preview-route-integrity-complete; production-canonical-host-matrix-deferred",
  ],
  [
    "AC9",
    "preview-seo-and-crawl-complete; production-source-deploy-parity-deferred",
  ],
  [
    "AC10",
    "preview-lighthouse-budget-complete; production-browser-cwv-input-parity-deferred",
  ],
  [
    "AC11",
    "preview-security-and-privacy-complete; production-browser-and-effective-header-proof-deferred",
  ],
  [
    "AC13",
    "candidate-reproducibility-complete; production-promotion-parity-and-final-verifier-deferred",
  ],
]);
const BLOCKING_VALUES = new Set([
  "FAIL",
  "PARTIAL",
  "UNKNOWN",
  "BLOCKED",
  "PENDING",
  "UNVERIFIED",
  "SKIP",
  "SKIPPED",
  "N/A",
  "NA",
  "NOT_APPLICABLE",
]);

const argumentValue = (name, fallback = "") => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const fail = (message) => {
  console.error(`Promotion evidence validation failed: ${message}`);
  process.exit(1);
};

const evidencePath = path.resolve(
  argumentValue(
    "--evidence",
    `.agent/tasks/${TASK_ID}/evidence.json`,
  ),
);
const repoRoot = path.resolve(argumentValue("--repo-root", "."));
const problemsPath = path.resolve(
  argumentValue(
    "--problems",
    path.resolve(repoRoot, `${TASK_ROOT}/problems.md`),
  ),
);
if (
  !fs.existsSync(problemsPath) ||
  fs.readFileSync(problemsPath, "utf8") !== RESOLVED_PROBLEMS_TEXT
) {
  fail(
    `the selected problems file must exactly match the generated RESOLVED sentinel.`,
  );
}
const attestationPath = path.resolve(
  argumentValue("--candidate-attestation", "candidate-attestation.json"),
);
const outputPath = path.resolve(
  argumentValue("--output", "promotion-evidence-validation.json"),
);
const expectedEvidenceSha256 = argumentValue(
  "--expected-evidence-sha256",
  process.env.EXPECTED_EVIDENCE_SHA256 || "",
).toLowerCase();
const expectedRunId = String(
  argumentValue(
    "--expected-candidate-run-id",
    process.env.EXPECTED_CANDIDATE_RUN_ID || "",
  ),
);

if (!isSha256(expectedEvidenceSha256)) {
  fail("an exact lowercase --expected-evidence-sha256 is required.");
}
if (!/^[1-9]\d*$/.test(expectedRunId)) {
  fail("an exact numeric --expected-candidate-run-id is required.");
}
const evidenceFile = readJsonFile(evidencePath, "evidence", fail);
const candidateFile = readJsonFile(attestationPath, "candidate attestation", fail);
if (evidenceFile.sha256 !== expectedEvidenceSha256) {
  fail(
    `evidence hash ${evidenceFile.sha256} does not match supplied ${expectedEvidenceSha256}.`,
  );
}
const evidence = evidenceFile.value;
const candidate = candidateFile.value;
validateCandidateIntegrations(candidate.integrations, fail);

assertExactKeys(
  evidence,
  [
    "schemaVersion",
    "taskId",
    "scope",
    "generatedAt",
    "candidateRunId",
    "source",
    "artifact",
    "preview",
    "verifier",
    "criteria",
    "externalGates",
  ],
  "evidence",
  fail,
);
if (evidence.schemaVersion !== 1) fail("schemaVersion must be 1.");
if (evidence.taskId !== TASK_ID) fail(`taskId must be ${TASK_ID}.`);
if (evidence.scope !== "pre-promotion") {
  fail("scope must be pre-promotion; production closure is a separate workflow.");
}
if (!isIsoTimestamp(evidence.generatedAt)) {
  fail("generatedAt must be a UTC ISO-8601 timestamp.");
}
const now = Date.now();
const generatedAt = Date.parse(evidence.generatedAt);
if (
  generatedAt > now + 5 * 60 * 1000 ||
  now - generatedAt > MAX_EVIDENCE_AGE_MS
) {
  fail("generatedAt is future-dated or older than the 14-day promotion window.");
}
if (String(evidence.candidateRunId) !== expectedRunId) {
  fail("candidateRunId does not match the selected immutable candidate run.");
}

assertExactKeys(
  evidence.source,
  [
    "commit",
    "ref",
    "lockfileSha256",
    "sourceTreeSha256",
    "sourceInputCount",
    "sourceDirty",
    "sourceChangeCount",
  ],
  "source",
  fail,
);
if (!isCommit(evidence.source.commit)) fail("source.commit must be a full commit SHA.");
if (evidence.source.ref !== MAIN_REF) fail(`source.ref must be ${MAIN_REF}.`);
if (!isSha256(evidence.source.lockfileSha256)) {
  fail("source.lockfileSha256 must be a lowercase SHA-256.");
}
if (
  !isSha256(evidence.source.sourceTreeSha256) ||
  !Number.isSafeInteger(evidence.source.sourceInputCount) ||
  evidence.source.sourceInputCount < 1 ||
  evidence.source.sourceDirty !== false ||
  evidence.source.sourceChangeCount !== 0
) {
  fail("source must bind a clean declared production input tree.");
}
assertExactKeys(evidence.artifact, ["sha256"], "artifact", fail);
if (!isSha256(evidence.artifact.sha256)) {
  fail("artifact.sha256 must be a lowercase SHA-256.");
}

const proofOptions = (label) => ({
  repoRoot,
  referenceTime: evidence.generatedAt,
  label,
  fail,
});
const validatedReferencePaths = new Map();
const registerValidatedReference = (reference) => {
  const prior = validatedReferencePaths.get(reference.path);
  if (prior && prior !== reference.sha256) {
    fail(`${reference.path} is cited with inconsistent hashes.`);
  }
  validatedReferencePaths.set(reference.path, reference.sha256);
};
const validateReferences = (references, label) => {
  const validated = validateProofRefs(references, proofOptions(label));
  for (const reference of validated) {
    registerValidatedReference(reference);
  }
  return validated;
};

assertExactKeys(
  evidence.preview,
  ["url", "deploymentId", "status", "evidence"],
  "preview",
  fail,
);
let previewUrl;
try {
  previewUrl = new URL(evidence.preview.url);
} catch {
  fail("preview.url must be a valid URL.");
}
if (
  previewUrl.protocol !== "https:" ||
  !previewUrl.hostname.endsWith(".pages.dev") ||
  previewUrl.pathname !== "/" ||
  previewUrl.search ||
  previewUrl.hash
) {
  fail("preview.url must be an HTTPS pages.dev origin.");
}
if (
  typeof evidence.preview.deploymentId !== "string" ||
  evidence.preview.deploymentId.trim().length < 8
) {
  fail("preview.deploymentId must be a non-placeholder deployment identifier.");
}
if (evidence.preview.status !== "PASS") fail("preview.status must be PASS.");
const candidateEvidencePath = `${TASK_ROOT}/raw/deployed-preview/candidate-attestation.json`;
if (
  !Array.isArray(evidence.preview.evidence) ||
  evidence.preview.evidence.length !== 1
) {
  fail("preview.evidence must contain exactly one immutable candidate attestation reference.");
}
const previewCandidateReference = evidence.preview.evidence[0];
if (previewCandidateReference?.path !== candidateEvidencePath) {
  fail(`preview.evidence must cite exactly ${candidateEvidencePath}.`);
}
if (!isIsoTimestamp(candidate.createdAt)) {
  fail("candidate.createdAt must be a UTC ISO-8601 timestamp.");
}
if (
  previewCandidateReference.sha256 !== candidateFile.sha256 ||
  previewCandidateReference.checkedAt !== candidate.createdAt
) {
  fail(
    "preview.evidence must hash the independently supplied candidate attestation and use its createdAt timestamp.",
  );
}
const validatedPreviewCandidate = validateProofRef(previewCandidateReference, {
  ...proofOptions("preview.evidence[0]"),
  parseJson: true,
});
if (validatedPreviewCandidate.sha256 !== candidateFile.sha256) {
  fail("the in-repo candidate attestation copy differs from the supplied immutable candidate.");
}
registerValidatedReference(validatedPreviewCandidate);

assertExactKeys(
  evidence.verifier,
  ["verdict", "verifiedAt", "evidence"],
  "verifier",
  fail,
);
if (evidence.verifier.verdict !== "PRE_PROMOTION_PASS") {
  fail("verifier.verdict must be PRE_PROMOTION_PASS, never full PASS before production.");
}
if (!isIsoTimestamp(evidence.verifier.verifiedAt)) {
  fail("verifier.verifiedAt must be a UTC ISO-8601 timestamp.");
}
if (generatedAt - Date.parse(evidence.verifier.verifiedAt) > 24 * 60 * 60 * 1000) {
  fail("the pre-promotion verifier is older than 24 hours relative to evidence generation.");
}
if (evidence.verifier.evidence.length !== 1) {
  fail("verifier.evidence must contain exactly one hashed fresh verdict.json reference.");
}
const verifierReference = evidence.verifier.evidence[0];
if (!verifierReference?.path?.endsWith("/verdict.json")) {
  fail("verifier evidence must point to an in-repo verdict.json.");
}
const verifierProof = validateProofRef(verifierReference, {
  ...proofOptions("verifier.evidence[0]"),
  parseJson: true,
  maxAgeMs: 24 * 60 * 60 * 1000,
});
if (verifierReference.checkedAt !== evidence.verifier.verifiedAt) {
  fail("verifier.verifiedAt must equal the hashed verdict reference checkedAt.");
}
validatedReferencePaths.set(verifierProof.path, verifierProof.sha256);
const actualVerdict = verifierProof.json;
if (
  actualVerdict?.task_id !== TASK_ID ||
  actualVerdict?.overall_verdict !== evidence.verifier.verdict ||
  actualVerdict?.verified_at !== verifierReference.checkedAt ||
  String(actualVerdict?.candidate_run_id) !== expectedRunId ||
  actualVerdict?.source_commit !== evidence.source.commit ||
  actualVerdict?.source_tree_sha256 !== evidence.source.sourceTreeSha256 ||
  actualVerdict?.artifact_sha256 !== evidence.artifact.sha256
) {
  fail(
    "the parsed verifier verdict is not fresh PRE_PROMOTION_PASS proof bound to this task, candidate run, source commit, and artifact.",
  );
}

if (!Array.isArray(evidence.criteria) || evidence.criteria.length !== 13) {
  fail("criteria must contain exactly AC1 through AC13.");
}
const criterionIds = new Set();
const expectedCriterionStatus = new Map();
for (const entry of evidence.criteria) {
  assertExactKeys(entry, ["id", "status", "scope", "evidence"], "criterion", fail);
  if (!/^AC(?:[1-9]|1[0-3])$/.test(entry.id)) fail(`invalid criterion id: ${entry.id}`);
  if (criterionIds.has(entry.id)) fail(`duplicate criterion id: ${entry.id}`);
  criterionIds.add(entry.id);
  if (PRODUCTION_DEFERRED_CRITERIA.has(entry.id)) {
    const expectedScope = PRODUCTION_DEFERRED_CRITERIA.get(entry.id);
    if (entry.status !== "PRE_PROMOTION_PASS" || entry.scope !== expectedScope) {
      fail(`${entry.id} must be PRE_PROMOTION_PASS with exact scope "${expectedScope}".`);
    }
  } else if (entry.status !== "PASS" || entry.scope !== "complete") {
    fail(`${entry.id} must be PASS for the complete scope.`);
  }
  expectedCriterionStatus.set(entry.id, entry.status);
  validateReferences(entry.evidence, `${entry.id}.evidence`);
}
for (let number = 1; number <= 13; number += 1) {
  if (!criterionIds.has(`AC${number}`)) fail(`criteria is missing AC${number}.`);
}
if (!Array.isArray(actualVerdict.criteria) || actualVerdict.criteria.length !== 13) {
  fail("the parsed verifier verdict must judge exactly AC1 through AC13.");
}
const actualCriterionIds = new Set();
for (const entry of actualVerdict.criteria) {
  if (!entry || typeof entry.id !== "string" || typeof entry.status !== "string") {
    fail("the parsed verifier verdict contains an invalid criterion result.");
  }
  if (actualCriterionIds.has(entry.id)) fail(`verifier repeats ${entry.id}.`);
  actualCriterionIds.add(entry.id);
  if (entry.status !== expectedCriterionStatus.get(entry.id)) {
    fail(`verifier ${entry.id} status does not match sealed evidence.`);
  }
}
if (actualCriterionIds.size !== 13) fail("verifier criterion coverage is incomplete.");

const validatedExternalGates = validateExternalGateEvidence({
  externalGates: evidence.externalGates,
  repoRoot,
  referenceTime: evidence.generatedAt,
  candidateRunId: expectedRunId,
  sourceCommit: evidence.source.commit,
  artifactSha256: evidence.artifact.sha256,
  previewUrl: evidence.preview.url,
  requiredZoomRoutes: publicRoutes,
  candidateIntegrations: candidate.integrations,
  candidateLegalDocuments: candidate.legalDocuments,
  fail,
  registerReference: registerValidatedReference,
});

const scanBlocking = (value, trail = "evidence") => {
  if (Array.isArray(value)) {
    value.forEach((child, index) => scanBlocking(child, `${trail}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (
      ["status", "result", "verdict", "overall_verdict"].includes(key) &&
      typeof child === "string" &&
      BLOCKING_VALUES.has(child.toUpperCase())
    ) {
      fail(`${trail}.${key} contains blocking value ${child}.`);
    }
    scanBlocking(child, `${trail}.${key}`);
  }
};
scanBlocking(evidence);
scanBlocking(actualVerdict, "actualVerifierVerdict");

if (
  candidate.schemaVersion !== 1 ||
  candidate.kind !== "jq33-preview-candidate" ||
  candidate.result !== "PASS"
) {
  fail("candidate attestation is not a passing JQ33 preview attestation.");
}
const comparisons = [
  ["candidate run", String(candidate.candidateRunId), expectedRunId],
  ["source commit", candidate.source?.commit, evidence.source.commit],
  ["source ref", candidate.source?.ref, evidence.source.ref],
  ["lockfile SHA-256", candidate.source?.lockfileSha256, evidence.source.lockfileSha256],
  ["source tree SHA-256", candidate.source?.sourceTreeSha256, evidence.source.sourceTreeSha256],
  ["source input count", candidate.source?.sourceInputCount, evidence.source.sourceInputCount],
  ["source dirty flag", candidate.source?.sourceDirty, evidence.source.sourceDirty],
  ["source change count", candidate.source?.sourceChangeCount, evidence.source.sourceChangeCount],
  ["artifact SHA-256", candidate.artifact?.sha256, evidence.artifact.sha256],
  ["preview URL", candidate.preview?.url, evidence.preview.url],
  ["preview deployment ID", candidate.preview?.deploymentId, evidence.preview.deploymentId],
];
for (const [label, actual, expected] of comparisons) {
  if (actual !== expected) fail(`${label} does not match candidate attestation (${actual} != ${expected}).`);
}
if (candidate.htmlMutationPolicy !== "exact-byte-parity-reject") {
  fail("candidate does not reject edge HTML mutation.");
}
const expectedPreviewBranch = `candidate-${evidence.source.commit.slice(0, 12)}`;
if (
  candidate.preview?.branch !== expectedPreviewBranch ||
  candidate.preview?.mode !== "deployed-preview" ||
  candidate.preview?.productionMode !== false ||
  candidate.preview?.statusMatrix?.baseUrl !== candidate.preview?.url ||
  candidate.preview?.statusMatrix?.result !== "PASS" ||
  !Number.isSafeInteger(candidate.preview?.statusMatrix?.recordCount) ||
  candidate.preview.statusMatrix.recordCount < 1 ||
  !isSha256(candidate.preview?.statusMatrix?.sha256)
) {
  fail(
    `candidate does not bind the ${expectedPreviewBranch} deployed-preview status matrix and mode.`,
  );
}
if (
  candidate.preview?.lighthouse?.baseUrl !== candidate.preview?.url ||
  candidate.preview?.lighthouse?.runsPerRoute !== 3 ||
  candidate.preview?.lighthouse?.rawReportCount !== 42 ||
  !isSha256(candidate.preview?.lighthouse?.rawReportsSha256) ||
  !isSha256(candidate.preview?.lighthouse?.metadataSha256) ||
  !isSha256(candidate.preview?.lighthouse?.summarySha256) ||
  candidate.preview?.lighthouse?.statusMatrixSha256 !==
    candidate.preview?.statusMatrix?.sha256 ||
  candidate.preview?.analytics?.mode !== "source-managed-manual-snippet" ||
  candidate.preview?.analytics?.automaticHtmlInjection !== "disabled" ||
  candidate.preview?.analytics?.documentCount !== publicRoutes.length + 1 ||
  !isSha256(candidate.preview?.analytics?.proofSha256)
) {
  fail("candidate lacks sealed deployed-preview Lighthouse and manual-analytics proof.");
}

const references = [...validatedReferencePaths.entries()]
  .map(([referencePath, referenceSha256]) => ({
    path: referencePath,
    sha256: referenceSha256,
  }))
  .sort((a, b) => a.path.localeCompare(b.path));
const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  result: "PASS",
  evidenceSha256: evidenceFile.sha256,
  candidateAttestationSha256: candidateFile.sha256,
  candidateRunId: expectedRunId,
  source: evidence.source,
  artifact: evidence.artifact,
  integrations: candidate.integrations,
  legalDocuments: candidate.legalDocuments,
  preview: {
    url: evidence.preview.url,
    deploymentId: evidence.preview.deploymentId,
    statusMatrixSha256: candidate.preview.statusMatrix.sha256,
    manualCloudflareAnalyticsSha256: candidate.preview.analytics.proofSha256,
  },
  verifier: {
    declaredVerdict: evidence.verifier.verdict,
    parsedVerdict: actualVerdict.overall_verdict,
    verdictPath: verifierProof.path,
    verdictSha256: verifierProof.sha256,
    verifiedAt: evidence.verifier.verifiedAt,
  },
  deferredProductionCriteria: Object.fromEntries(PRODUCTION_DEFERRED_CRITERIA.entries()),
  criteria: Object.fromEntries(evidence.criteria.map((entry) => [entry.id, entry.status])),
  externalGates: Object.fromEntries(evidence.externalGates.map((entry) => [entry.id, entry.status])),
  externalGateProofs: Object.fromEntries(
    validatedExternalGates.map((entry) => [
      entry.id,
      {
        path: entry.proofPath,
        sha256: entry.proofSha256,
        checkedAt: entry.checkedAt,
        artifactCount: entry.artifactCount,
      },
    ]),
  ),
  validatedReferences: references,
  validatedReferencesSha256: sha256(
    references.map((entry) => `${entry.path}\0${entry.sha256}\n`).join(""),
  ),
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  "Promotion evidence passed: every structured in-repo proof exists, matches its SHA-256, is fresh, and the parsed PRE_PROMOTION_PASS verifier verdict is bound to the candidate.",
);
