import fs from "node:fs";
import path from "node:path";
import {
  MAX_EVIDENCE_AGE_MS,
  TASK_ID,
  assertExactKeys,
  isCommit,
  isIsoTimestamp,
  isSha256,
  readJsonFile,
  sha256,
  validateProofRef,
  validateProofRefs,
} from "./ci-proof-utils.mjs";
import { canonicalOrigin } from "../tests/helpers/site.mjs";
import { RESOLVED_PROBLEMS_TEXT } from "./render-task-evidence.mjs";

const argumentValue = (name, fallback = "") => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const fail = (message) => {
  console.error(`Production finalization failed: ${message}`);
  process.exit(1);
};

const finalEvidencePath = path.resolve(
  argumentValue("--final-evidence", `.agent/tasks/${TASK_ID}/final-evidence.json`),
);
const productionAttestationPath = path.resolve(
  argumentValue("--production-attestation", "production-parity-attestation.json"),
);
const repoRoot = path.resolve(argumentValue("--repo-root", "."));
const problemsPath = path.resolve(
  argumentValue(
    "--problems",
    path.resolve(repoRoot, `.agent/tasks/${TASK_ID}/problems.md`),
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
const outputPath = path.resolve(
  argumentValue("--output", "production-finalization-attestation.json"),
);
const expectedEvidenceSha256 = argumentValue(
  "--expected-final-evidence-sha256",
  process.env.EXPECTED_FINAL_EVIDENCE_SHA256 || "",
).toLowerCase();
const expectedProductionAttestationSha256 = argumentValue(
  "--expected-production-attestation-sha256",
  process.env.EXPECTED_PRODUCTION_ATTESTATION_SHA256 || "",
).toLowerCase();
const expectedCandidateRunId = String(
  argumentValue("--expected-candidate-run-id", process.env.CANDIDATE_RUN_ID || ""),
);
const expectedProductionRunId = String(
  argumentValue("--expected-production-run-id", process.env.PRODUCTION_RUN_ID || ""),
);

if (!isSha256(expectedEvidenceSha256)) fail("exact final evidence SHA-256 is required.");
if (!isSha256(expectedProductionAttestationSha256)) {
  fail("exact production parity attestation SHA-256 is required.");
}
if (!/^[1-9]\d*$/.test(expectedCandidateRunId)) fail("candidate run id is required.");
if (!/^[1-9]\d*$/.test(expectedProductionRunId)) fail("production run id is required.");

const evidenceFile = readJsonFile(finalEvidencePath, "final evidence", fail);
const productionFile = readJsonFile(
  productionAttestationPath,
  "production parity attestation",
  fail,
);
if (evidenceFile.sha256 !== expectedEvidenceSha256) {
  fail("final evidence hash does not match the dispatch input.");
}
if (productionFile.sha256 !== expectedProductionAttestationSha256) {
  fail("production parity attestation hash does not match the dispatch input.");
}
const evidence = evidenceFile.value;
const production = productionFile.value;

assertExactKeys(
  evidence,
  [
    "schemaVersion",
    "taskId",
    "scope",
    "generatedAt",
    "candidateRunId",
    "productionRunId",
    "source",
    "artifact",
    "production",
    "verifier",
    "criteria",
  ],
  "final evidence",
  fail,
);
if (evidence.schemaVersion !== 1) fail("final evidence schemaVersion must be 1.");
if (evidence.taskId !== TASK_ID) fail(`taskId must be ${TASK_ID}.`);
if (evidence.scope !== "post-production-finalization") {
  fail("final evidence scope must be post-production-finalization.");
}
if (!isIsoTimestamp(evidence.generatedAt)) fail("generatedAt must be UTC ISO-8601.");
const now = Date.now();
const generatedAt = Date.parse(evidence.generatedAt);
if (generatedAt > now + 5 * 60 * 1000 || now - generatedAt > MAX_EVIDENCE_AGE_MS) {
  fail("final evidence is future-dated or older than 14 days.");
}
if (String(evidence.candidateRunId) !== expectedCandidateRunId) {
  fail("candidate run id is not bound to final evidence.");
}
if (String(evidence.productionRunId) !== expectedProductionRunId) {
  fail("production run id is not bound to final evidence.");
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
if (!isCommit(evidence.source.commit) || evidence.source.ref !== "refs/heads/main") {
  fail("final evidence source must bind a full main-branch commit.");
}
if (!isSha256(evidence.source.lockfileSha256)) fail("source lockfile hash is invalid.");
if (
  !isSha256(evidence.source.sourceTreeSha256) ||
  !Number.isSafeInteger(evidence.source.sourceInputCount) ||
  evidence.source.sourceInputCount < 1 ||
  evidence.source.sourceDirty !== false ||
  evidence.source.sourceChangeCount !== 0
) {
  fail("final evidence source does not bind a clean declared production input tree.");
}
assertExactKeys(evidence.artifact, ["sha256"], "artifact", fail);
if (!isSha256(evidence.artifact.sha256)) fail("artifact hash is invalid.");
assertExactKeys(
  evidence.production,
  ["url", "deploymentId", "parityAttestationSha256"],
  "production",
  fail,
);
if (
  evidence.production.url !== canonicalOrigin ||
  typeof evidence.production.deploymentId !== "string" ||
  evidence.production.deploymentId.length < 8 ||
  evidence.production.parityAttestationSha256 !== productionFile.sha256
) {
  fail("final evidence production identity is incomplete or inconsistent.");
}

if (
  production.schemaVersion !== 1 ||
  production.kind !== "jq33-production-parity" ||
  production.result !== "PRODUCTION_PARITY_PASS_FINALIZATION_REQUIRED" ||
  production.finalVerifierRequired !== true ||
  String(production.candidateRunId) !== expectedCandidateRunId ||
  String(production.productionRunId) !== expectedProductionRunId ||
  production.production?.url !== canonicalOrigin ||
  !isIsoTimestamp(production.createdAt)
) {
  fail("input is not a production-parity attestation awaiting finalization.");
}
if (generatedAt < Date.parse(production.createdAt)) {
  fail("final evidence predates the production parity attestation.");
}
const bindings = [
  ["source commit", evidence.source.commit, production.source?.commit],
  ["source ref", evidence.source.ref, production.source?.ref],
  ["lockfile SHA-256", evidence.source.lockfileSha256, production.source?.lockfileSha256],
  ["source tree SHA-256", evidence.source.sourceTreeSha256, production.source?.sourceTreeSha256],
  ["source input count", evidence.source.sourceInputCount, production.source?.sourceInputCount],
  ["source dirty flag", evidence.source.sourceDirty, production.source?.sourceDirty],
  ["source change count", evidence.source.sourceChangeCount, production.source?.sourceChangeCount],
  ["artifact SHA-256", evidence.artifact.sha256, production.artifact?.sha256],
  ["deployment id", evidence.production.deploymentId, production.production?.deploymentId],
];
for (const [label, actual, expected] of bindings) {
  if (actual !== expected) fail(`${label} is not bound to production parity.`);
}
for (const id of ["AC2", "AC9", "AC10", "AC11"]) {
  if (production.deferredCriteriaClosure?.[id]?.status !== "PASS") {
    fail(`production parity did not close ${id}.`);
  }
}
if (production.deferredCriteriaClosure?.AC13?.status !== "PENDING_FINAL_VERIFIER") {
  fail("production parity does not explicitly leave AC13 to the final verifier.");
}
for (const hash of [
  production.production?.statusMatrixSha256,
  production.production?.canonicalHostMatrixSha256,
  production.production?.browserParitySha256,
  production.production?.performanceSmokeSha256,
]) {
  if (!isSha256(hash)) fail("production parity lacks a required raw proof hash.");
}

const proofOptions = (label) => ({
  repoRoot,
  referenceTime: evidence.generatedAt,
  label,
  fail,
});
assertExactKeys(evidence.verifier, ["verdict", "verifiedAt", "evidence"], "verifier", fail);
if (evidence.verifier.verdict !== "PASS" || !isIsoTimestamp(evidence.verifier.verifiedAt)) {
  fail("the fresh final verifier must declare PASS with a UTC timestamp.");
}
if (Date.parse(evidence.verifier.verifiedAt) < Date.parse(production.createdAt)) {
  fail("the final verifier ran before production parity existed.");
}
if (generatedAt - Date.parse(evidence.verifier.verifiedAt) > 24 * 60 * 60 * 1000) {
  fail("the final verifier is older than 24 hours relative to final evidence.");
}
if (!Array.isArray(evidence.verifier.evidence) || evidence.verifier.evidence.length !== 1) {
  fail("verifier.evidence must contain exactly one hashed verdict.json reference.");
}
const verdictReference = evidence.verifier.evidence[0];
if (!verdictReference?.path?.endsWith("/verdict.json")) {
  fail("final verifier evidence must point to verdict.json.");
}
const verdictProof = validateProofRef(verdictReference, {
  ...proofOptions("verifier.evidence[0]"),
  parseJson: true,
  maxAgeMs: 24 * 60 * 60 * 1000,
});
if (verdictReference.checkedAt !== evidence.verifier.verifiedAt) {
  fail("verifier.verifiedAt must equal verdict reference checkedAt.");
}
const verdict = verdictProof.json;
if (
  verdict?.task_id !== TASK_ID ||
  verdict?.overall_verdict !== "PASS" ||
  verdict?.verified_at !== verdictReference.checkedAt ||
  String(verdict?.candidate_run_id) !== expectedCandidateRunId ||
  String(verdict?.production_run_id) !== expectedProductionRunId ||
  verdict?.source_commit !== evidence.source.commit ||
  verdict?.source_tree_sha256 !== evidence.source.sourceTreeSha256 ||
  verdict?.artifact_sha256 !== evidence.artifact.sha256 ||
  verdict?.production_deployment_id !== evidence.production.deploymentId ||
  verdict?.production_parity_sha256 !== productionFile.sha256
) {
  fail(
    "parsed final verifier verdict is not fresh PASS proof bound to this task, candidate, production run/deployment, source, artifact, and parity attestation.",
  );
}

if (!Array.isArray(evidence.criteria) || evidence.criteria.length !== 13) {
  fail("final criteria must contain exactly AC1 through AC13.");
}
const ids = new Set();
const validatedPaths = new Map([[verdictProof.path, verdictProof.sha256]]);
for (const entry of evidence.criteria) {
  assertExactKeys(entry, ["id", "status", "scope", "evidence"], "criterion", fail);
  if (!/^AC(?:[1-9]|1[0-3])$/.test(entry.id) || ids.has(entry.id)) {
    fail(`invalid or duplicate final criterion ${entry.id}.`);
  }
  ids.add(entry.id);
  if (entry.status !== "PASS" || entry.scope !== "complete") {
    fail(`${entry.id} must be PASS for complete scope.`);
  }
  for (const reference of validateProofRefs(entry.evidence, proofOptions(`${entry.id}.evidence`))) {
    validatedPaths.set(reference.path, reference.sha256);
  }
}
if (ids.size !== 13) fail("final criterion coverage is incomplete.");
if (!Array.isArray(verdict.criteria) || verdict.criteria.length !== 13) {
  fail("parsed final verifier must judge exactly AC1 through AC13.");
}
const verdictIds = new Set();
for (const entry of verdict.criteria) {
  if (!entry || !ids.has(entry.id) || entry.status !== "PASS" || verdictIds.has(entry.id)) {
    fail("parsed final verifier criteria do not match all-PASS final evidence.");
  }
  verdictIds.add(entry.id);
}

const validatedReferences = [...validatedPaths.entries()]
  .map(([referencePath, referenceSha256]) => ({
    path: referencePath,
    sha256: referenceSha256,
  }))
  .sort((a, b) => a.path.localeCompare(b.path));
const report = {
  schemaVersion: 1,
  kind: "jq33-production-finalization",
  createdAt: new Date().toISOString(),
  result: "PASS",
  taskId: TASK_ID,
  candidateRunId: expectedCandidateRunId,
  productionRunId: expectedProductionRunId,
  source: evidence.source,
  artifact: evidence.artifact,
  production: {
    url: evidence.production.url,
    deploymentId: evidence.production.deploymentId,
    parityAttestationSha256: productionFile.sha256,
    browserParitySha256: production.production.browserParitySha256,
  },
  verifier: {
    verdict: verdict.overall_verdict,
    verdictPath: verdictProof.path,
    verdictSha256: verdictProof.sha256,
    verifiedAt: evidence.verifier.verifiedAt,
  },
  criteria: Object.fromEntries(
    evidence.criteria.map((entry) => [entry.id, "PASS"]),
  ),
  finalVerifierRequired: false,
  proof: {
    finalEvidenceSha256: evidenceFile.sha256,
    productionParityAttestationSha256: productionFile.sha256,
    validatedReferencesSha256: sha256(
      validatedReferences
        .map((entry) => `${entry.path}\0${entry.sha256}\n`)
        .join(""),
    ),
  },
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  `Production finalization passed for deployment ${report.production.deploymentId}; all AC1-AC13 are bound to the fresh parsed verifier verdict.`,
);
