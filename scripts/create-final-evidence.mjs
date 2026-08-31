import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  EXTERNAL_GATE_IDS,
  validateCandidateIntegrations,
  validateCandidateLegalDocuments,
} from "./ci-external-gate-evidence.mjs";
import {
  MAX_CLOCK_SKEW_MS,
  MAX_EVIDENCE_AGE_MS,
  TASK_ID,
  TASK_ROOT,
  WORKFLOW_PATH,
  assertExactKeys,
  isCommit,
  isIsoTimestamp,
  isSha256,
  readJsonFile,
  sha256,
  validateProofRef,
} from "./ci-proof-utils.mjs";
import { canonicalOrigin, publicRoutes } from "../tests/helpers/site.mjs";
import {
  EVIDENCE_MARKDOWN_PATH,
  PROBLEMS_PATH,
  checkEvidenceCompanions,
  commitFileBundle,
  writeEvidenceCompanions,
} from "./render-task-evidence.mjs";

const MAIN_REF = "refs/heads/main";
const VERDICT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CANDIDATE_PATH = `${TASK_ROOT}/raw/deployed-preview/candidate-attestation.json`;
const PROMOTION_VALIDATION_PATH = `${TASK_ROOT}/raw/promotion/evidence-validation.json`;
const CANDIDATE_RUN_VALIDATION_PATH = `${TASK_ROOT}/raw/promotion/candidate-run-validation.json`;
const PRODUCTION_PATH = `${TASK_ROOT}/raw/deployed-production/production-parity-attestation.json`;
const PRODUCTION_RUN_VALIDATION_PATH = `${TASK_ROOT}/raw/finalization/production-run-validation.json`;
const VERDICT_PATH = `${TASK_ROOT}/verdict.json`;
const OUTPUT_PATH = `${TASK_ROOT}/final-evidence.json`;
const FINAL_VALIDATOR_PATH = new URL("./ci-finalize-production.mjs", import.meta.url);

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

class FinalAssemblyError extends Error {}
const fail = (message) => {
  throw new FinalAssemblyError(message);
};

const normalized = (value) => value.split(path.sep).join("/");
const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const requireFreshTimestamp = (
  value,
  referenceTime,
  label,
  maxAgeMs = MAX_EVIDENCE_AGE_MS,
) => {
  if (!isIsoTimestamp(value)) fail(`${label} must be a UTC ISO-8601 timestamp.`);
  const timestamp = Date.parse(value);
  const reference = Date.parse(referenceTime);
  if (timestamp > reference + MAX_CLOCK_SKEW_MS) {
    fail(`${label} is dated in the future.`);
  }
  if (reference - timestamp > maxAgeMs) fail(`${label} is stale.`);
};

const requirePositiveRunId = (value, label) => {
  const normalizedValue = String(value ?? "");
  if (!/^[1-9]\d*$/.test(normalizedValue)) {
    fail(`${label} must be a positive numeric run ID.`);
  }
  return normalizedValue;
};

const requirePagesUrl = (value, label) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be an HTTPS pages.dev URL.`);
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname.endsWith(".pages.dev") ||
    parsed.username ||
    parsed.password
  ) {
    fail(`${label} must be a credential-free HTTPS pages.dev URL.`);
  }
};

const requireHashFields = (object, fields, label) => {
  for (const field of fields) {
    if (!isSha256(object?.[field])) {
      fail(`${label}.${field} must be a lowercase SHA-256.`);
    }
  }
};

const stableEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const canonicalPath = (repoRoot, relativePath) =>
  path.resolve(repoRoot, ...relativePath.split("/"));

const requireCanonicalInput = (repoRoot, actualPath, relativePath, label) => {
  const expected = canonicalPath(repoRoot, relativePath);
  if (path.resolve(actualPath) !== expected) {
    fail(`${label} must resolve to ${relativePath}.`);
  }
};

const safeVerdictPath = (repoRoot, verdictPath) => {
  const relative = normalized(path.relative(repoRoot, path.resolve(verdictPath)));
  if (
    relative.startsWith("../") ||
    path.isAbsolute(relative) ||
    !relative.startsWith(`${TASK_ROOT}/`) ||
    path.basename(relative) !== "verdict.json"
  ) {
    fail(`--verdict must be a verdict.json inside ${TASK_ROOT}/.`);
  }
  return relative;
};

const scanBlocking = (value, trail) => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanBlocking(entry, `${trail}[${index}]`));
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

const validateSourceAndArtifact = (source, artifact, label) => {
  assertExactKeys(
    source,
    [
      "commit",
      "ref",
      "lockfileSha256",
      "sourceTreeSha256",
      "sourceInputCount",
      "sourceDirty",
      "sourceChangeCount",
    ],
    `${label}.source`,
    fail,
  );
  if (!isCommit(source.commit) || source.ref !== MAIN_REF) {
    fail(`${label}.source must bind a full main-branch commit.`);
  }
  requireHashFields(source, ["lockfileSha256", "sourceTreeSha256"], `${label}.source`);
  if (
    !Number.isSafeInteger(source.sourceInputCount) ||
    source.sourceInputCount < 1 ||
    source.sourceDirty !== false ||
    source.sourceChangeCount !== 0
  ) {
    fail(`${label}.source must bind a clean declared production input tree.`);
  }
  assertExactKeys(
    artifact,
    ["sha256", "manifestSha256", "fileCount"],
    `${label}.artifact`,
    fail,
  );
  requireHashFields(artifact, ["sha256", "manifestSha256"], `${label}.artifact`);
  if (!Number.isSafeInteger(artifact.fileCount) || artifact.fileCount < 1) {
    fail(`${label}.artifact.fileCount must be positive.`);
  }
};

const validateCandidate = (candidate, generatedAt, expected) => {
  if (
    candidate?.schemaVersion !== 1 ||
    candidate?.kind !== "jq33-preview-candidate" ||
    candidate?.result !== "PASS"
  ) {
    fail("candidate attestation is not a passing jq33-preview-candidate.");
  }
  requireFreshTimestamp(candidate.createdAt, generatedAt, "candidate.createdAt");
  if (String(candidate.candidateRunId) !== expected.candidateRunId) {
    fail("candidate run does not match the requested finalization identity.");
  }
  validateSourceAndArtifact(candidate.source, candidate.artifact, "candidate");
  if (candidate.source.commit !== expected.candidateCommitSha) {
    fail("candidate source commit does not match --candidate-commit-sha.");
  }
  validateCandidateIntegrations(candidate.integrations, fail);
  validateCandidateLegalDocuments(candidate.legalDocuments, fail);
  const expectedBranch = `candidate-${candidate.source.commit.slice(0, 12)}`;
  if (
    candidate.preview?.branch !== expectedBranch ||
    candidate.preview?.mode !== "deployed-preview" ||
    candidate.preview?.productionMode !== false ||
    candidate.preview?.statusMatrix?.result !== "PASS" ||
    candidate.preview?.statusMatrix?.baseUrl !== candidate.preview?.url ||
    candidate.preview?.lighthouse?.baseUrl !== candidate.preview?.url ||
    candidate.preview?.lighthouse?.runsPerRoute !== 3 ||
    candidate.preview?.lighthouse?.rawReportCount !== publicRoutes.length * 3 ||
    candidate.preview?.analytics?.mode !== "source-managed-manual-snippet" ||
    candidate.preview?.analytics?.automaticHtmlInjection !== "disabled" ||
    candidate.preview?.analytics?.documentCount !== publicRoutes.length + 1 ||
    candidate.htmlMutationPolicy !== "exact-byte-parity-reject"
  ) {
    fail("candidate preview seal is incomplete or uses the wrong immutable branch.");
  }
  requirePagesUrl(candidate.preview.url, "candidate.preview.url");
  requireHashFields(
    candidate.preview.statusMatrix,
    ["sha256"],
    "candidate.preview.statusMatrix",
  );
  requireHashFields(
    candidate.preview.lighthouse,
    [
      "rawReportsSha256",
      "metadataSha256",
      "summarySha256",
      "statusMatrixSha256",
    ],
    "candidate.preview.lighthouse",
  );
  requireHashFields(candidate.preview.analytics, ["proofSha256"], "candidate.preview.analytics");
  if (
    candidate.preview.lighthouse.statusMatrixSha256 !==
      candidate.preview.statusMatrix.sha256
  ) {
    fail("candidate Lighthouse evidence is not bound to the preview status matrix.");
  }
};

const validateRunValidation = (
  report,
  { label, generatedAt, runId, commit, event, maxAgeMs },
) => {
  assertExactKeys(
    report,
    [
      "schemaVersion",
      "checkedAt",
      "result",
      "runId",
      "workflowName",
      "workflowId",
      "workflowPath",
      "event",
      "source",
      "runUrl",
    ],
    label,
    fail,
  );
  if (
    report.schemaVersion !== 1 ||
    report.result !== "PASS" ||
    String(report.runId) !== runId ||
    report.workflowName !== "Production readiness" ||
    report.workflowPath !== WORKFLOW_PATH ||
    report.event !== event ||
    !Number.isSafeInteger(report.workflowId) ||
    report.workflowId < 1
  ) {
    fail(`${label} does not bind the exact successful Production readiness run.`);
  }
  assertExactKeys(report.source, ["repository", "branch", "commit"], `${label}.source`, fail);
  if (
    report.source.branch !== "main" ||
    report.source.commit !== commit ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(report.source.repository)
  ) {
    fail(`${label}.source does not bind the requested main-branch commit.`);
  }
  requireFreshTimestamp(report.checkedAt, generatedAt, `${label}.checkedAt`, maxAgeMs);
};

const validatePromotionReport = (
  report,
  { generatedAt, candidate, candidateSha256, candidateRunId },
) => {
  if (
    report?.schemaVersion !== 1 ||
    report?.result !== "PASS" ||
    report.candidateAttestationSha256 !== candidateSha256 ||
    String(report.candidateRunId) !== candidateRunId ||
    report.source?.commit !== candidate.source.commit ||
    report.source?.sourceTreeSha256 !== candidate.source.sourceTreeSha256 ||
    report.artifact?.sha256 !== candidate.artifact.sha256 ||
    !stableEqual(report.integrations, candidate.integrations) ||
    !stableEqual(report.legalDocuments, candidate.legalDocuments) ||
    report.preview?.url !== candidate.preview.url ||
    report.preview?.deploymentId !== candidate.preview.deploymentId
  ) {
    fail("promotion evidence validation is not bound to the selected candidate.");
  }
  requireFreshTimestamp(report.checkedAt, generatedAt, "promotion validation.checkedAt");
  for (let number = 1; number <= 13; number += 1) {
    const id = `AC${number}`;
    const expectedStatus = ["AC2", "AC9", "AC10", "AC11", "AC13"].includes(id)
      ? "PRE_PROMOTION_PASS"
      : "PASS";
    if (report.criteria?.[id] !== expectedStatus) {
      fail(`promotion validation did not seal ${id} as ${expectedStatus}.`);
    }
  }
  for (const id of EXTERNAL_GATE_IDS) {
    if (report.externalGates?.[id] !== "PASS") {
      fail(`promotion validation did not seal external gate ${id}.`);
    }
  }
};

const validateProduction = (
  production,
  { generatedAt, expected, candidate, candidateSha256, promotionSha256 },
) => {
  assertExactKeys(
    production,
    [
      "schemaVersion",
      "kind",
      "createdAt",
      "result",
      "candidateRunId",
      "productionRunId",
      "source",
      "artifact",
      "integrations",
      "legalDocuments",
      "preview",
      "production",
      "htmlMutationPolicy",
      "deferredCriteriaClosure",
      "finalVerifierRequired",
      "proof",
    ],
    "production parity attestation",
    fail,
  );
  if (
    production.schemaVersion !== 1 ||
    production.kind !== "jq33-production-parity" ||
    production.result !== "PRODUCTION_PARITY_PASS_FINALIZATION_REQUIRED" ||
    production.finalVerifierRequired !== true ||
    String(production.candidateRunId) !== expected.candidateRunId ||
    String(production.productionRunId) !== expected.productionRunId ||
    production.htmlMutationPolicy !== "exact-byte-parity-reject"
  ) {
    fail("production proof is not a passing parity attestation awaiting finalization.");
  }
  requireFreshTimestamp(production.createdAt, generatedAt, "production.createdAt");
  validateSourceAndArtifact(production.source, production.artifact, "production");
  if (
    production.source.commit !== expected.candidateCommitSha ||
    !stableEqual(production.source, candidate.source) ||
    !stableEqual(production.artifact, candidate.artifact) ||
    !stableEqual(production.integrations, candidate.integrations) ||
    !stableEqual(production.legalDocuments, candidate.legalDocuments) ||
    !stableEqual(production.preview, candidate.preview)
  ) {
    fail("production parity source, artifact, integrations, legal documents, or preview differ from the candidate.");
  }
  validateCandidateIntegrations(production.integrations, fail);
  validateCandidateLegalDocuments(production.legalDocuments, fail);
  assertExactKeys(
    production.production,
    [
      "url",
      "immutableDeploymentUrl",
      "deploymentId",
      "statusMatrixSha256",
      "canonicalHostMatrixSha256",
      "browserParitySha256",
      "performanceSmokeSha256",
    ],
    "production.production",
    fail,
  );
  if (
    production.production.url !== canonicalOrigin ||
    typeof production.production.deploymentId !== "string" ||
    production.production.deploymentId.length < 8
  ) {
    fail("production identity does not bind the canonical origin and deployment.");
  }
  requirePagesUrl(
    production.production.immutableDeploymentUrl,
    "production.production.immutableDeploymentUrl",
  );
  requireHashFields(
    production.production,
    [
      "statusMatrixSha256",
      "canonicalHostMatrixSha256",
      "browserParitySha256",
      "performanceSmokeSha256",
    ],
    "production.production",
  );
  const closures = production.deferredCriteriaClosure;
  const expectedScopes = {
    AC2: "production-canonical-host-matrix",
    AC9: "production-source-deploy-parity",
    AC10: "production-browser-cwv-input-parity",
    AC11: "effective-production-headers-browser-network-and-privacy",
  };
  for (const [id, scope] of Object.entries(expectedScopes)) {
    if (closures?.[id]?.status !== "PASS" || closures[id].scope !== scope) {
      fail(`production parity did not close ${id} with its exact scope.`);
    }
    if (!isSha256(closures[id].evidenceSha256)) {
      fail(`production parity ${id} lacks a proof hash.`);
    }
  }
  if (
    closures?.AC13?.status !== "PENDING_FINAL_VERIFIER" ||
    closures.AC13.scope !==
      "production-promotion-and-immutable-parity-complete; fresh-final-verifier-deferred" ||
    !isSha256(closures.AC13.evidenceSha256) ||
    !isSha256(closures.AC13.deploymentEvidenceSha256)
  ) {
    fail("production parity does not leave only AC13 to the fresh final verifier.");
  }
  assertExactKeys(
    production.proof,
    [
      "candidateAttestationSha256",
      "promotionEvidenceValidationSha256",
      "cloudflareDeploymentSha256",
      "statusMatrixSha256",
      "canonicalHostMatrixSha256",
      "browserParitySha256",
      "performanceSmokeSha256",
    ],
    "production.proof",
    fail,
  );
  requireHashFields(production.proof, Object.keys(production.proof), "production.proof");
  const bindings = [
    [production.proof.candidateAttestationSha256, candidateSha256, "candidate attestation"],
    [
      production.proof.promotionEvidenceValidationSha256,
      promotionSha256,
      "promotion validation",
    ],
    [
      production.proof.statusMatrixSha256,
      production.production.statusMatrixSha256,
      "status matrix",
    ],
    [
      production.proof.canonicalHostMatrixSha256,
      production.production.canonicalHostMatrixSha256,
      "canonical host matrix",
    ],
    [
      production.proof.browserParitySha256,
      production.production.browserParitySha256,
      "browser parity",
    ],
    [
      production.proof.performanceSmokeSha256,
      production.production.performanceSmokeSha256,
      "performance smoke",
    ],
  ];
  for (const [actual, expectedValue, label] of bindings) {
    if (actual !== expectedValue) fail(`production ${label} hash is not bound.`);
  }
};

const validateFinalVerdict = (
  verdict,
  { generatedAt, expected, candidate, production, productionSha256 },
) => {
  if (
    verdict?.task_id !== TASK_ID ||
    verdict?.overall_verdict !== "PASS" ||
    String(verdict?.candidate_run_id) !== expected.candidateRunId ||
    String(verdict?.production_run_id) !== expected.productionRunId ||
    verdict?.source_commit !== expected.candidateCommitSha ||
    verdict?.source_tree_sha256 !== candidate.source.sourceTreeSha256 ||
    verdict?.artifact_sha256 !== candidate.artifact.sha256 ||
    verdict?.production_deployment_id !== production.production.deploymentId ||
    verdict?.production_parity_sha256 !== productionSha256 ||
    verdict?.production_run_commit_sha !== expected.productionRunCommitSha
  ) {
    fail("final verdict is not a PASS bound to the exact candidate, promotion run, production deployment, and parity proof.");
  }
  requireFreshTimestamp(
    verdict.verified_at,
    generatedAt,
    "verdict.verified_at",
    VERDICT_MAX_AGE_MS,
  );
  if (Date.parse(verdict.verified_at) < Date.parse(production.createdAt)) {
    fail("final verdict predates production parity.");
  }
  if (!Array.isArray(verdict.criteria) || verdict.criteria.length !== 13) {
    fail("final verdict must judge exactly AC1 through AC13.");
  }
  const ids = new Set();
  for (const entry of verdict.criteria) {
    if (
      !isPlainObject(entry) ||
      !/^AC(?:[1-9]|1[0-3])$/.test(entry.id) ||
      ids.has(entry.id) ||
      entry.status !== "PASS"
    ) {
      fail("final verdict contains an invalid, duplicate, or non-PASS criterion.");
    }
    ids.add(entry.id);
  }
  scanBlocking(verdict, "verdict");
};

const referenceFor = (repoRoot, relativePath, checkedAt, generatedAt, label) => {
  const reference = {
    path: relativePath,
    sha256: sha256(fs.readFileSync(canonicalPath(repoRoot, relativePath))),
    checkedAt,
  };
  validateProofRef(reference, {
    repoRoot,
    referenceTime: generatedAt,
    label,
    fail,
    parseJson: true,
  });
  return reference;
};

const buildFinalEvidence = ({
  generatedAt,
  expected,
  candidate,
  production,
  productionSha256,
  verdict,
  references,
}) => {
  const common = [
    references.candidate,
    references.promotion,
    references.production,
  ].map((reference) => ({ ...reference }));
  const criteria = Array.from({ length: 13 }, (_, index) => {
    const id = `AC${index + 1}`;
    const evidence = [...common];
    if (id === "AC13") {
      evidence.push(
        { ...references.candidateRun },
        { ...references.productionRun },
      );
    }
    return { id, status: "PASS", scope: "complete", evidence };
  });
  return {
    schemaVersion: 1,
    taskId: TASK_ID,
    scope: "post-production-finalization",
    generatedAt,
    candidateRunId: expected.candidateRunId,
    productionRunId: expected.productionRunId,
    source: { ...candidate.source },
    artifact: { sha256: candidate.artifact.sha256 },
    production: {
      url: canonicalOrigin,
      deploymentId: production.production.deploymentId,
      parityAttestationSha256: productionSha256,
    },
    verifier: {
      verdict: "PASS",
      verifiedAt: verdict.verified_at,
      evidence: [{ ...references.verdict }],
    },
    criteria,
  };
};

const validateCoreRunEquality = (sealed, fresh) => {
  for (const key of ["runId", "workflowName", "workflowId", "workflowPath", "event"]) {
    if (sealed[key] !== fresh[key]) {
      fail(`fresh production run validation differs from sealed ${key}.`);
    }
  }
  if (!stableEqual(sealed.source, fresh.source)) {
    fail("fresh production run validation differs from the sealed source identity.");
  }
};

const runFinalValidator = ({
  repoRoot,
  evidencePath,
  problemsPath,
  productionPath,
  evidenceSha256,
  productionSha256,
  expected,
}) => {
  const output = path.join(
    os.tmpdir(),
    `jq33-final-validation-${process.pid}-${Date.now()}.json`,
  );
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(FINAL_VALIDATOR_PATH),
      "--repo-root",
      repoRoot,
      "--final-evidence",
      evidencePath,
      "--problems",
      problemsPath,
      "--production-attestation",
      productionPath,
      "--expected-final-evidence-sha256",
      evidenceSha256,
      "--expected-production-attestation-sha256",
      productionSha256,
      "--expected-candidate-run-id",
      expected.candidateRunId,
      "--expected-production-run-id",
      expected.productionRunId,
      "--output",
      output,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  try {
    if (result.status !== 0) {
      const diagnostic = `${result.stderr || ""}\n${result.stdout || ""}`.trim();
      fail(`strict final validator rejected the assembled evidence: ${diagnostic}`);
    }
    const report = readJsonFile(output, "final validator output", fail).value;
    if (report.result !== "PASS" || report.finalVerifierRequired !== false) {
      fail("strict final validator did not return terminal PASS.");
    }
  } finally {
    fs.rmSync(output, { force: true });
  }
};

const loadInputs = (options, generatedAt) => {
  const repoRoot = options.repoRoot;
  const expected = {
    candidateRunId: requirePositiveRunId(options.candidateRunId, "--candidate-run-id"),
    productionRunId: requirePositiveRunId(options.productionRunId, "--production-run-id"),
    candidateCommitSha: String(options.candidateCommitSha || "").toLowerCase(),
    productionRunCommitSha: String(options.productionRunCommitSha || "").toLowerCase(),
  };
  if (!isCommit(expected.candidateCommitSha)) {
    fail("--candidate-commit-sha must be a full lowercase commit SHA.");
  }
  if (!isCommit(expected.productionRunCommitSha)) {
    fail("--production-run-commit-sha must be a full lowercase commit SHA.");
  }
  requireCanonicalInput(repoRoot, options.productionPath, PRODUCTION_PATH, "--production-attestation");
  requireCanonicalInput(repoRoot, options.outputPath, OUTPUT_PATH, "--output");
  const verdictRelative = safeVerdictPath(repoRoot, options.verdictPath);

  const candidateFile = readJsonFile(canonicalPath(repoRoot, CANDIDATE_PATH), "candidate attestation", fail);
  const promotionFile = readJsonFile(canonicalPath(repoRoot, PROMOTION_VALIDATION_PATH), "promotion validation", fail);
  const candidateRunFile = readJsonFile(canonicalPath(repoRoot, CANDIDATE_RUN_VALIDATION_PATH), "candidate run validation", fail);
  const productionRunFile = readJsonFile(canonicalPath(repoRoot, PRODUCTION_RUN_VALIDATION_PATH), "production run validation", fail);
  const productionFile = readJsonFile(options.productionPath, "production parity attestation", fail);
  const verdictFile = readJsonFile(options.verdictPath, "final verdict", fail);

  validateCandidate(candidateFile.value, generatedAt, expected);
  validatePromotionReport(promotionFile.value, {
    generatedAt,
    candidate: candidateFile.value,
    candidateSha256: candidateFile.sha256,
    candidateRunId: expected.candidateRunId,
  });
  validateRunValidation(candidateRunFile.value, {
    label: "candidate run validation",
    generatedAt,
    runId: expected.candidateRunId,
    commit: expected.candidateCommitSha,
    event: candidateRunFile.value.event,
    maxAgeMs: MAX_EVIDENCE_AGE_MS,
  });
  if (!["push", "workflow_dispatch"].includes(candidateRunFile.value.event)) {
    fail("candidate run validation event is not approved.");
  }
  validateRunValidation(productionRunFile.value, {
    label: "production run validation",
    generatedAt,
    runId: expected.productionRunId,
    commit: expected.productionRunCommitSha,
    event: "workflow_dispatch",
    maxAgeMs: VERDICT_MAX_AGE_MS,
  });
  validateProduction(productionFile.value, {
    generatedAt,
    expected,
    candidate: candidateFile.value,
    candidateSha256: candidateFile.sha256,
    promotionSha256: promotionFile.sha256,
  });
  validateFinalVerdict(verdictFile.value, {
    generatedAt,
    expected,
    candidate: candidateFile.value,
    production: productionFile.value,
    productionSha256: productionFile.sha256,
  });
  if (options.freshProductionRunValidation) {
    const freshFile = readJsonFile(
      options.freshProductionRunValidation,
      "fresh production run validation",
      fail,
    );
    validateRunValidation(freshFile.value, {
      label: "fresh production run validation",
      generatedAt,
      runId: expected.productionRunId,
      commit: expected.productionRunCommitSha,
      event: "workflow_dispatch",
      maxAgeMs: VERDICT_MAX_AGE_MS,
    });
    validateCoreRunEquality(productionRunFile.value, freshFile.value);
  }

  const references = {
    candidate: referenceFor(
      repoRoot,
      CANDIDATE_PATH,
      candidateFile.value.createdAt,
      generatedAt,
      "candidate reference",
    ),
    promotion: referenceFor(
      repoRoot,
      PROMOTION_VALIDATION_PATH,
      promotionFile.value.checkedAt,
      generatedAt,
      "promotion reference",
    ),
    candidateRun: referenceFor(
      repoRoot,
      CANDIDATE_RUN_VALIDATION_PATH,
      candidateRunFile.value.checkedAt,
      generatedAt,
      "candidate run reference",
    ),
    production: referenceFor(
      repoRoot,
      PRODUCTION_PATH,
      productionFile.value.createdAt,
      generatedAt,
      "production parity reference",
    ),
    productionRun: referenceFor(
      repoRoot,
      PRODUCTION_RUN_VALIDATION_PATH,
      productionRunFile.value.checkedAt,
      generatedAt,
      "production run reference",
    ),
    verdict: referenceFor(
      repoRoot,
      verdictRelative,
      verdictFile.value.verified_at,
      generatedAt,
      "verdict reference",
    ),
  };
  return {
    expected,
    candidate: candidateFile.value,
    production: productionFile.value,
    productionSha256: productionFile.sha256,
    verdict: verdictFile.value,
    references,
  };
};

const assembleFinalEvidence = (options) => {
  if (fs.existsSync(options.outputPath) && !options.force && !options.check) {
    fail(`refusing to overwrite ${OUTPUT_PATH}; rerun with --force.`);
  }
  let generatedAt = new Date().toISOString();
  let existingFile = null;
  if (options.check) {
    existingFile = readJsonFile(options.outputPath, "existing final evidence", fail);
    generatedAt = existingFile.value?.generatedAt;
  }
  if (!isIsoTimestamp(generatedAt)) {
    fail("final evidence generatedAt must be a UTC ISO-8601 timestamp.");
  }
  requireFreshTimestamp(generatedAt, new Date().toISOString(), "final evidence.generatedAt");
  const inputs = loadInputs(options, generatedAt);
  const evidence = buildFinalEvidence({ generatedAt, ...inputs });
  scanBlocking(evidence, "final evidence");
  const bytes = `${JSON.stringify(evidence, null, 2)}\n`;
  const evidenceSha256 = sha256(bytes);

  if (options.check) {
    if (!existingFile || !existingFile.bytes.equals(Buffer.from(bytes))) {
      fail(`${OUTPUT_PATH} is not the deterministic output for the current sealed inputs.`);
    }
    runFinalValidator({
      repoRoot: options.repoRoot,
      evidencePath: options.outputPath,
      problemsPath: canonicalPath(options.repoRoot, PROBLEMS_PATH),
      productionPath: options.productionPath,
      evidenceSha256,
      productionSha256: inputs.productionSha256,
      expected: inputs.expected,
    });
    checkEvidenceCompanions({
      evidence,
      evidencePath: OUTPUT_PATH,
      evidenceSha256,
      markdownPath: canonicalPath(options.repoRoot, EVIDENCE_MARKDOWN_PATH),
      problemsPath: canonicalPath(options.repoRoot, PROBLEMS_PATH),
    });
    return { evidence, evidenceSha256, expected: inputs.expected, checked: true };
  }

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  const pending = `${options.outputPath}.pending-${process.pid}-${Date.now()}`;
  const markdownPath = canonicalPath(options.repoRoot, EVIDENCE_MARKDOWN_PATH);
  const problemsPath = canonicalPath(options.repoRoot, PROBLEMS_PATH);
  const pendingMarkdown = `${markdownPath}.pending-${process.pid}-${Date.now()}`;
  const pendingProblems = `${problemsPath}.pending-${process.pid}-${Date.now()}`;
  fs.writeFileSync(pending, bytes, "utf8");
  try {
    writeEvidenceCompanions({
      evidence,
      evidencePath: OUTPUT_PATH,
      evidenceSha256,
      markdownPath: pendingMarkdown,
      problemsPath: pendingProblems,
    });
    runFinalValidator({
      repoRoot: options.repoRoot,
      evidencePath: pending,
      problemsPath: pendingProblems,
      productionPath: options.productionPath,
      evidenceSha256,
      productionSha256: inputs.productionSha256,
      expected: inputs.expected,
    });
    commitFileBundle([
      { pendingPath: pending, outputPath: options.outputPath },
      { pendingPath: pendingMarkdown, outputPath: markdownPath },
      { pendingPath: pendingProblems, outputPath: problemsPath },
    ]);
  } finally {
    fs.rmSync(pending, { force: true });
    fs.rmSync(pendingMarkdown, { force: true });
    fs.rmSync(pendingProblems, { force: true });
  }
  return { evidence, evidenceSha256, expected: inputs.expected, checked: false };
};

const jsonBytes = (value) => `${JSON.stringify(value, null, 2)}\n`;
const writeJson = (repoRoot, relativePath, value) => {
  const filePath = canonicalPath(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, jsonBytes(value), "utf8");
  return filePath;
};

const selfTestRunValidation = ({ checkedAt, runId, commit, event }) => ({
  schemaVersion: 1,
  checkedAt,
  result: "PASS",
  runId,
  workflowName: "Production readiness",
  workflowId: 98765,
  workflowPath: WORKFLOW_PATH,
  event,
  source: {
    repository: "jq33/design",
    branch: "main",
    commit,
  },
  runUrl: `https://github.com/jq33/design/actions/runs/${runId}`,
});

const createSelfTestWorkspace = (repoRoot) => {
  const now = Date.now();
  const time = (offset) => new Date(now + offset).toISOString();
  const candidateRunId = "123456789";
  const productionRunId = "223456789";
  const candidateCommitSha = "1".repeat(40);
  const productionRunCommitSha = "2".repeat(40);
  const source = {
    commit: candidateCommitSha,
    ref: MAIN_REF,
    lockfileSha256: "3".repeat(64),
    sourceTreeSha256: "4".repeat(64),
    sourceInputCount: 89,
    sourceDirty: false,
    sourceChangeCount: 0,
  };
  const artifact = {
    sha256: "5".repeat(64),
    manifestSha256: "6".repeat(64),
    fileCount: 89,
  };
  const integrations = {
    formspree: {
      contactEndpointSha256: sha256("https://formspree.io/f/contact123"),
      inquiryEndpointSha256: sha256("https://formspree.io/f/inquiry456"),
    },
    calendly: { eventUrlSha256: sha256("https://calendly.com/jq33/consultation") },
    social: { publishedProfileCount: 0, profiles: [] },
    cloudflareWebAnalytics: {
      tokenSha256: sha256("analytics-token"),
      documentCount: publicRoutes.length + 1,
    },
  };
  const legalDocuments = {
    privacy: {
      route: "/privacy/",
      artifactPath: "privacy/index.html",
      sha256: sha256("privacy"),
    },
    terms: {
      route: "/terms/",
      artifactPath: "terms/index.html",
      sha256: sha256("terms"),
    },
  };
  const previewUrl = "https://a1b2c3d4.jq33.pages.dev/";
  const statusSha = sha256("preview-status");
  const preview = {
    url: previewUrl,
    deploymentId: "preview-deployment-123",
    branch: `candidate-${candidateCommitSha.slice(0, 12)}`,
    mode: "deployed-preview",
    productionMode: false,
    statusMatrix: {
      baseUrl: previewUrl,
      result: "PASS",
      checkedAt: time(-390_000),
      recordCount: 117,
      publicRouteCount: publicRoutes.length,
      negativeRouteCount: 1,
      redirectRecordCount: 1,
      crawlFileCount: 2,
      artifactFileCount: 1,
      sha256: statusSha,
    },
    lighthouse: {
      baseUrl: previewUrl,
      runsPerRoute: 3,
      rawReportCount: publicRoutes.length * 3,
      rawReportsSha256: sha256("lighthouse-reports"),
      metadataSha256: sha256("lighthouse-metadata"),
      summarySha256: sha256("lighthouse-summary"),
      statusMatrixSha256: statusSha,
    },
    analytics: {
      mode: "source-managed-manual-snippet",
      automaticHtmlInjection: "disabled",
      documentCount: publicRoutes.length + 1,
      proofSha256: sha256("analytics-proof"),
    },
  };
  const candidate = {
    schemaVersion: 1,
    kind: "jq33-preview-candidate",
    createdAt: time(-360_000),
    result: "PASS",
    candidateRunId,
    source,
    artifact,
    integrations,
    legalDocuments,
    preview,
    htmlMutationPolicy: "exact-byte-parity-reject",
    proof: {
      candidateVerificationSha256: sha256("candidate-verification"),
      cloudflareDeploymentSha256: sha256("preview-deployment"),
      statusMatrixSha256: statusSha,
      lighthouseMetadataSha256: preview.lighthouse.metadataSha256,
      lighthouseSummarySha256: preview.lighthouse.summarySha256,
      lighthouseRawReportsSha256: preview.lighthouse.rawReportsSha256,
      manualCloudflareAnalyticsSha256: preview.analytics.proofSha256,
    },
  };
  const candidatePath = writeJson(repoRoot, CANDIDATE_PATH, candidate);
  const candidateSha256 = sha256(fs.readFileSync(candidatePath));
  const promotion = {
    schemaVersion: 1,
    checkedAt: time(-300_000),
    result: "PASS",
    evidenceSha256: sha256("prepromotion-evidence"),
    candidateAttestationSha256: candidateSha256,
    candidateRunId,
    source,
    artifact: { sha256: artifact.sha256 },
    integrations,
    legalDocuments,
    preview: {
      url: preview.url,
      deploymentId: preview.deploymentId,
      statusMatrixSha256: preview.statusMatrix.sha256,
      manualCloudflareAnalyticsSha256: preview.analytics.proofSha256,
    },
    verifier: {},
    deferredProductionCriteria: {},
    criteria: Object.fromEntries(
      Array.from({ length: 13 }, (_, index) => {
        const id = `AC${index + 1}`;
        return [
          id,
          ["AC2", "AC9", "AC10", "AC11", "AC13"].includes(id)
            ? "PRE_PROMOTION_PASS"
            : "PASS",
        ];
      }),
    ),
    externalGates: Object.fromEntries(EXTERNAL_GATE_IDS.map((id) => [id, "PASS"])),
    externalGateProofs: {},
    validatedReferences: [],
    validatedReferencesSha256: sha256("validated-references"),
  };
  const promotionPath = writeJson(repoRoot, PROMOTION_VALIDATION_PATH, promotion);
  writeJson(
    repoRoot,
    CANDIDATE_RUN_VALIDATION_PATH,
    selfTestRunValidation({
      checkedAt: time(-280_000),
      runId: candidateRunId,
      commit: candidateCommitSha,
      event: "push",
    }),
  );
  writeJson(
    repoRoot,
    PRODUCTION_RUN_VALIDATION_PATH,
    selfTestRunValidation({
      checkedAt: time(-90_000),
      runId: productionRunId,
      commit: productionRunCommitSha,
      event: "workflow_dispatch",
    }),
  );
  const production = {
    schemaVersion: 1,
    kind: "jq33-production-parity",
    createdAt: time(-120_000),
    result: "PRODUCTION_PARITY_PASS_FINALIZATION_REQUIRED",
    candidateRunId,
    productionRunId,
    source,
    artifact,
    integrations,
    legalDocuments,
    preview,
    production: {
      url: canonicalOrigin,
      immutableDeploymentUrl: "https://fedcba98.jq33.pages.dev/",
      deploymentId: "production-deployment-123",
      statusMatrixSha256: sha256("production-status"),
      canonicalHostMatrixSha256: sha256("canonical-hosts"),
      browserParitySha256: sha256("browser-parity"),
      performanceSmokeSha256: sha256("performance-smoke"),
    },
    htmlMutationPolicy: "exact-byte-parity-reject",
    deferredCriteriaClosure: {
      AC2: {
        status: "PASS",
        scope: "production-canonical-host-matrix",
        evidenceSha256: sha256("canonical-hosts"),
      },
      AC9: {
        status: "PASS",
        scope: "production-source-deploy-parity",
        evidenceSha256: sha256("production-status"),
      },
      AC10: {
        status: "PASS",
        scope: "production-browser-cwv-input-parity",
        evidenceSha256: sha256("browser-parity"),
        previewLighthouseSummarySha256: preview.lighthouse.summarySha256,
        previewLighthouseRawReportsSha256: preview.lighthouse.rawReportsSha256,
      },
      AC11: {
        status: "PASS",
        scope: "effective-production-headers-browser-network-and-privacy",
        evidenceSha256: sha256("browser-parity"),
        effectiveHeadersSha256: sha256("production-status"),
      },
      AC13: {
        status: "PENDING_FINAL_VERIFIER",
        scope:
          "production-promotion-and-immutable-parity-complete; fresh-final-verifier-deferred",
        evidenceSha256: sha256("production-status"),
        deploymentEvidenceSha256: sha256("production-deployment"),
      },
    },
    finalVerifierRequired: true,
    proof: {
      candidateAttestationSha256: candidateSha256,
      promotionEvidenceValidationSha256: sha256(fs.readFileSync(promotionPath)),
      cloudflareDeploymentSha256: sha256("production-deployment"),
      statusMatrixSha256: sha256("production-status"),
      canonicalHostMatrixSha256: sha256("canonical-hosts"),
      browserParitySha256: sha256("browser-parity"),
      performanceSmokeSha256: sha256("performance-smoke"),
    },
  };
  const productionPath = writeJson(repoRoot, PRODUCTION_PATH, production);
  const productionSha256 = sha256(fs.readFileSync(productionPath));
  const verdict = {
    task_id: TASK_ID,
    overall_verdict: "PASS",
    verified_at: time(-30_000),
    candidate_run_id: candidateRunId,
    production_run_id: productionRunId,
    source_commit: candidateCommitSha,
    source_tree_sha256: source.sourceTreeSha256,
    artifact_sha256: artifact.sha256,
    production_deployment_id: production.production.deploymentId,
    production_parity_sha256: productionSha256,
    production_run_commit_sha: productionRunCommitSha,
    criteria: Array.from({ length: 13 }, (_, index) => ({
      id: `AC${index + 1}`,
      status: "PASS",
      reason: "self-test",
    })),
  };
  const verdictPath = writeJson(repoRoot, VERDICT_PATH, verdict);
  return {
    repoRoot,
    productionPath,
    verdictPath,
    outputPath: canonicalPath(repoRoot, OUTPUT_PATH),
    candidateRunId,
    candidateCommitSha,
    productionRunId,
    productionRunCommitSha,
    freshProductionRunValidation: "",
    force: false,
    check: false,
  };
};

const runSelfTest = () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jq33-final-assembler-"));
  try {
    const options = createSelfTestWorkspace(temporaryRoot);
    const result = assembleFinalEvidence(options);
    assert.equal(result.evidence.scope, "post-production-finalization");
    assert.equal(result.evidence.criteria.length, 13);
    assert(result.evidence.criteria.every((entry) => entry.status === "PASS"));
    assert.equal(sha256(fs.readFileSync(options.outputPath)), result.evidenceSha256);

    assert.throws(() => assembleFinalEvidence(options), /refusing to overwrite/);
    assembleFinalEvidence({ ...options, check: true });

    fs.rmSync(options.outputPath, { force: true });
    const blockerText = "# Problems\n\nStatus: BLOCKED\n\nSelf-test blocker.\n";
    const problemsPath = canonicalPath(temporaryRoot, PROBLEMS_PATH);
    fs.writeFileSync(problemsPath, blockerText, "utf8");
    const verdictBytes = fs.readFileSync(options.verdictPath);
    const blockedVerdict = JSON.parse(verdictBytes.toString("utf8"));
    blockedVerdict.criteria[12].status = "UNKNOWN";
    fs.writeFileSync(options.verdictPath, jsonBytes(blockedVerdict), "utf8");
    assert.throws(() => assembleFinalEvidence(options), /non-PASS criterion/);
    assert.equal(fs.existsSync(options.outputPath), false);
    assert.equal(fs.readFileSync(problemsPath, "utf8"), blockerText);
    fs.writeFileSync(options.verdictPath, verdictBytes);

    const wrongFreshPath = writeJson(
      temporaryRoot,
      `${TASK_ROOT}/raw/finalization/wrong-runtime-production-run-validation.json`,
      selfTestRunValidation({
        checkedAt: new Date().toISOString(),
        runId: options.productionRunId,
        commit: "f".repeat(40),
        event: "workflow_dispatch",
      }),
    );
    assert.throws(
      () =>
        assembleFinalEvidence({
          ...options,
          freshProductionRunValidation: wrongFreshPath,
        }),
      /requested main-branch commit/,
    );
    assert.equal(fs.existsSync(options.outputPath), false);
    assert.equal(fs.readFileSync(problemsPath, "utf8"), blockerText);

    console.log(
      "Final evidence assembler self-test passed: canonical parity, candidate/promotion/run identities, strict final-validator round-trip, deterministic companions, atomic blocker preservation, overwrite guard, UNKNOWN rejection, and fresh-run mismatch rejection.",
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
};

const parseArguments = () => {
  const options = {
    productionAttestation: "",
    verdict: VERDICT_PATH,
    output: OUTPUT_PATH,
    candidateRunId: "",
    candidateCommitSha: "",
    productionRunId: "",
    productionRunCommitSha: "",
    freshProductionRunValidation: "",
    force: false,
    check: false,
    selfTest: false,
  };
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--force") options.force = true;
    else if (argument === "--check") options.check = true;
    else if (argument === "--production-attestation") {
      options.productionAttestation = process.argv[++index] || "";
    } else if (argument === "--verdict") options.verdict = process.argv[++index] || "";
    else if (argument === "--output") options.output = process.argv[++index] || "";
    else if (argument === "--candidate-run-id") {
      options.candidateRunId = process.argv[++index] || "";
    } else if (argument === "--candidate-commit-sha") {
      options.candidateCommitSha = process.argv[++index] || "";
    } else if (argument === "--production-run-id") {
      options.productionRunId = process.argv[++index] || "";
    } else if (argument === "--production-run-commit-sha") {
      options.productionRunCommitSha = process.argv[++index] || "";
    } else if (argument === "--fresh-production-run-validation") {
      options.freshProductionRunValidation = process.argv[++index] || "";
    } else fail(`unknown argument: ${argument}`);
  }
  return options;
};

const main = () => {
  const parsed = parseArguments();
  if (parsed.selfTest) {
    if (
      parsed.productionAttestation ||
      parsed.force ||
      parsed.check ||
      parsed.candidateRunId ||
      parsed.productionRunId
    ) {
      fail("--self-test cannot be combined with assembly options.");
    }
    runSelfTest();
    return;
  }
  if (!parsed.productionAttestation) {
    fail(`--production-attestation ${PRODUCTION_PATH} is required.`);
  }
  if (parsed.force && parsed.check) fail("--force and --check are mutually exclusive.");
  const repoRoot = process.cwd();
  const result = assembleFinalEvidence({
    repoRoot,
    productionPath: path.resolve(repoRoot, parsed.productionAttestation),
    verdictPath: path.resolve(repoRoot, parsed.verdict),
    outputPath: path.resolve(repoRoot, parsed.output),
    candidateRunId: parsed.candidateRunId,
    candidateCommitSha: parsed.candidateCommitSha,
    productionRunId: parsed.productionRunId,
    productionRunCommitSha: parsed.productionRunCommitSha,
    freshProductionRunValidation: parsed.freshProductionRunValidation
      ? path.resolve(repoRoot, parsed.freshProductionRunValidation)
      : "",
    force: parsed.force,
    check: parsed.check,
  });
  console.log(
    `${result.checked ? "Checked" : "Assembled"} terminal final evidence for candidate run ${result.expected.candidateRunId} and production run ${result.expected.productionRunId}.`,
  );
  console.log(`Output: ${OUTPUT_PATH}`);
  console.log(`SHA-256: ${result.evidenceSha256}`);
};

try {
  main();
} catch (error) {
  console.error(`Final evidence assembly failed: ${error.message}`);
  process.exitCode = 1;
}
