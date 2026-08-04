import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  EXTERNAL_GATE_IDS,
  REQUIRED_NVDA_CHECKS,
  REQUIRED_PRIVACY_FLOWS,
  REQUIRED_PRIVACY_PROCESSORS,
  REQUIRED_ZOOM_TEMPLATES,
  externalGateDetailsSha256,
  externalGateDirectory,
  validateCandidateIntegrations,
  validateCandidateLegalDocuments,
  validateExternalGateEvidence,
} from "./ci-external-gate-evidence.mjs";
import {
  MAX_CLOCK_SKEW_MS,
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
} from "./ci-proof-utils.mjs";
import { publicRoutes } from "../tests/helpers/site.mjs";
import {
  EVIDENCE_MARKDOWN_PATH,
  PROBLEMS_PATH,
  commitFileBundle,
  writeEvidenceCompanions,
} from "./render-task-evidence.mjs";

const MAIN_REF = "refs/heads/main";
const CANDIDATE_REFERENCE_PATH =
  `${TASK_ROOT}/raw/deployed-preview/candidate-attestation.json`;
const DEFAULT_VERDICT_PATH = `${TASK_ROOT}/verdict.json`;
const DEFAULT_OUTPUT_PATH = `${TASK_ROOT}/evidence.json`;
const VERDICT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const VALIDATOR_PATH = new URL("./ci-validate-promotion-evidence.mjs", import.meta.url);

const DEFERRED_SCOPES = Object.freeze({
  AC2: "preview-route-integrity-complete; production-canonical-host-matrix-deferred",
  AC9: "preview-seo-and-crawl-complete; production-source-deploy-parity-deferred",
  AC10:
    "preview-lighthouse-budget-complete; production-browser-cwv-input-parity-deferred",
  AC11:
    "preview-security-and-privacy-complete; production-browser-and-effective-header-proof-deferred",
  AC13:
    "candidate-reproducibility-complete; production-promotion-parity-and-final-verifier-deferred",
});

const CRITERION_GATE_MAP = Object.freeze({
  AC1: [],
  AC2: [],
  AC3: [],
  AC4: ["browser-zoom-200"],
  AC5: ["browser-zoom-200"],
  AC6: [
    "formspree-contact-delivery",
    "formspree-inquiry-delivery",
    "formspree-spam-retention",
    "legal-privacy-retention",
  ],
  AC7: ["calendly-booking-cancel", "social-profile-ownership"],
  AC8: ["nvda-windows", "browser-zoom-200"],
  AC9: ["google-search-console", "schema-rich-results"],
  AC10: ["browser-zoom-200"],
  AC11: [
    "cloudflare-pages-web-analytics",
    "formspree-spam-retention",
    "legal-privacy-retention",
    "operational-privacy",
  ],
  AC12: [
    "cloudflare-pages-web-analytics",
    "google-search-console",
    "dns-mx-spf-dkim-dmarc",
  ],
  AC13: [...EXTERNAL_GATE_IDS],
});

class AssemblyError extends Error {}

const fail = (message) => {
  throw new AssemblyError(message);
};

const normalized = (value) => value.split(path.sep).join("/");
const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const safeTaskRelativePath = (repoRoot, filePath, label) => {
  const repositoryRoot = path.resolve(repoRoot);
  const resolved = path.resolve(filePath);
  const relative = normalized(path.relative(repositoryRoot, resolved));
  if (
    relative.startsWith("../") ||
    relative === ".." ||
    path.isAbsolute(relative) ||
    !relative.startsWith(`${TASK_ROOT}/`)
  ) {
    fail(`${label} must be inside ${TASK_ROOT}/.`);
  }
  return relative;
};

const requireFreshTimestamp = (
  value,
  referenceTime,
  label,
  maxAgeMs = MAX_EVIDENCE_AGE_MS,
) => {
  if (!isIsoTimestamp(value)) {
    fail(`${label} must be a UTC ISO-8601 timestamp.`);
  }
  const timestamp = Date.parse(value);
  const reference = Date.parse(referenceTime);
  if (timestamp > reference + MAX_CLOCK_SKEW_MS) {
    fail(`${label} is dated in the future.`);
  }
  if (reference - timestamp > maxAgeMs) {
    fail(`${label} is stale.`);
  }
};

const requirePositiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(`${label} must be a positive integer.`);
  }
};

const requirePagesOrigin = (value, label) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be an HTTPS pages.dev origin.`);
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname.endsWith(".pages.dev") ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    fail(`${label} must be a credential-free HTTPS pages.dev origin.`);
  }
};

const requireHashFields = (object, fields, label) => {
  for (const field of fields) {
    if (!isSha256(object?.[field])) {
      fail(`${label}.${field} must be a lowercase SHA-256.`);
    }
  }
};

const validateCandidateAttestation = (candidate, generatedAt) => {
  assertExactKeys(
    candidate,
    [
      "schemaVersion",
      "kind",
      "createdAt",
      "result",
      "candidateRunId",
      "source",
      "artifact",
      "integrations",
      "legalDocuments",
      "preview",
      "htmlMutationPolicy",
      "proof",
    ],
    "candidate attestation",
    fail,
  );
  if (
    candidate.schemaVersion !== 1 ||
    candidate.kind !== "jq33-preview-candidate" ||
    candidate.result !== "PASS"
  ) {
    fail("candidate attestation must be a passing jq33-preview-candidate schema v1 document.");
  }
  requireFreshTimestamp(candidate.createdAt, generatedAt, "candidate.createdAt");
  const candidateRunId = String(candidate.candidateRunId ?? "");
  if (!/^[1-9]\d*$/.test(candidateRunId)) {
    fail("candidate.candidateRunId must be a positive numeric run ID.");
  }

  assertExactKeys(
    candidate.source,
    [
      "commit",
      "ref",
      "lockfileSha256",
      "sourceTreeSha256",
      "sourceInputCount",
      "sourceDirty",
      "sourceChangeCount",
    ],
    "candidate.source",
    fail,
  );
  if (!isCommit(candidate.source.commit)) {
    fail("candidate.source.commit must be a full lowercase commit SHA.");
  }
  if (
    candidate.source.ref !== MAIN_REF ||
    candidate.source.sourceDirty !== false ||
    candidate.source.sourceChangeCount !== 0
  ) {
    fail("candidate source must bind a clean refs/heads/main production input tree.");
  }
  requireHashFields(
    candidate.source,
    ["lockfileSha256", "sourceTreeSha256"],
    "candidate.source",
  );
  requirePositiveInteger(
    candidate.source.sourceInputCount,
    "candidate.source.sourceInputCount",
  );

  assertExactKeys(
    candidate.artifact,
    ["sha256", "manifestSha256", "fileCount"],
    "candidate.artifact",
    fail,
  );
  requireHashFields(
    candidate.artifact,
    ["sha256", "manifestSha256"],
    "candidate.artifact",
  );
  requirePositiveInteger(candidate.artifact.fileCount, "candidate.artifact.fileCount");

  assertExactKeys(
    candidate.preview,
    [
      "url",
      "deploymentId",
      "branch",
      "mode",
      "productionMode",
      "statusMatrix",
      "lighthouse",
      "analytics",
    ],
    "candidate.preview",
    fail,
  );
  requirePagesOrigin(candidate.preview.url, "candidate.preview.url");
  if (
    typeof candidate.preview.deploymentId !== "string" ||
    candidate.preview.deploymentId.trim().length < 8 ||
    /(?:example|placeholder|replace|dummy|test)/i.test(
      candidate.preview.deploymentId,
    )
  ) {
    fail("candidate.preview.deploymentId must be a non-placeholder deployment ID.");
  }
  const expectedPreviewBranch = `candidate-${candidate.source.commit.slice(0, 12)}`;
  if (
    candidate.preview.branch !== expectedPreviewBranch ||
    candidate.preview.mode !== "deployed-preview" ||
    candidate.preview.productionMode !== false
  ) {
    fail(
      `candidate.preview must be the non-production ${expectedPreviewBranch} deployment derived from main.`,
    );
  }

  const status = candidate.preview.statusMatrix;
  assertExactKeys(
    status,
    [
      "baseUrl",
      "result",
      "checkedAt",
      "recordCount",
      "publicRouteCount",
      "negativeRouteCount",
      "redirectRecordCount",
      "crawlFileCount",
      "artifactFileCount",
      "sha256",
    ],
    "candidate.preview.statusMatrix",
    fail,
  );
  if (
    status.baseUrl !== candidate.preview.url ||
    status.result !== "PASS" ||
    status.publicRouteCount !== publicRoutes.length ||
    !Number.isSafeInteger(status.negativeRouteCount) ||
    status.negativeRouteCount < 1 ||
    !Number.isSafeInteger(status.redirectRecordCount) ||
    status.redirectRecordCount < 1 ||
    status.crawlFileCount !== 2 ||
    !Number.isSafeInteger(status.artifactFileCount) ||
    status.artifactFileCount < 1
  ) {
    fail("candidate status matrix does not seal the complete passing preview route contract.");
  }
  requirePositiveInteger(status.recordCount, "candidate.preview.statusMatrix.recordCount");
  requireFreshTimestamp(
    status.checkedAt,
    candidate.createdAt,
    "candidate.preview.statusMatrix.checkedAt",
  );
  requireHashFields(status, ["sha256"], "candidate.preview.statusMatrix");

  const lighthouse = candidate.preview.lighthouse;
  assertExactKeys(
    lighthouse,
    [
      "baseUrl",
      "runsPerRoute",
      "rawReportCount",
      "rawReportsSha256",
      "metadataSha256",
      "summarySha256",
      "statusMatrixSha256",
    ],
    "candidate.preview.lighthouse",
    fail,
  );
  if (
    lighthouse.baseUrl !== candidate.preview.url ||
    lighthouse.runsPerRoute !== 3 ||
    lighthouse.rawReportCount !== publicRoutes.length * 3 ||
    lighthouse.statusMatrixSha256 !== status.sha256
  ) {
    fail("candidate Lighthouse seal is incomplete or not bound to the preview matrix.");
  }
  requireHashFields(
    lighthouse,
    [
      "rawReportsSha256",
      "metadataSha256",
      "summarySha256",
      "statusMatrixSha256",
    ],
    "candidate.preview.lighthouse",
  );

  const analytics = candidate.preview.analytics;
  assertExactKeys(
    analytics,
    ["mode", "automaticHtmlInjection", "documentCount", "proofSha256"],
    "candidate.preview.analytics",
    fail,
  );
  if (
    analytics.mode !== "source-managed-manual-snippet" ||
    analytics.automaticHtmlInjection !== "disabled" ||
    analytics.documentCount !== publicRoutes.length + 1
  ) {
    fail("candidate analytics seal must prove one source-managed beacon per public document.");
  }
  requireHashFields(analytics, ["proofSha256"], "candidate.preview.analytics");

  if (candidate.htmlMutationPolicy !== "exact-byte-parity-reject") {
    fail("candidate must reject edge HTML mutation.");
  }
  validateCandidateIntegrations(candidate.integrations, fail);
  validateCandidateLegalDocuments(candidate.legalDocuments, fail);
  if (
    candidate.integrations.cloudflareWebAnalytics.documentCount !==
    analytics.documentCount
  ) {
    fail("candidate analytics integration count does not match its preview seal.");
  }

  assertExactKeys(
    candidate.proof,
    [
      "candidateVerificationSha256",
      "cloudflareDeploymentSha256",
      "statusMatrixSha256",
      "lighthouseMetadataSha256",
      "lighthouseSummarySha256",
      "lighthouseRawReportsSha256",
      "manualCloudflareAnalyticsSha256",
    ],
    "candidate.proof",
    fail,
  );
  requireHashFields(candidate.proof, Object.keys(candidate.proof), "candidate.proof");
  const proofBindings = [
    [candidate.proof.statusMatrixSha256, status.sha256, "status matrix"],
    [
      candidate.proof.lighthouseMetadataSha256,
      lighthouse.metadataSha256,
      "Lighthouse metadata",
    ],
    [
      candidate.proof.lighthouseSummarySha256,
      lighthouse.summarySha256,
      "Lighthouse summary",
    ],
    [
      candidate.proof.lighthouseRawReportsSha256,
      lighthouse.rawReportsSha256,
      "Lighthouse reports",
    ],
    [
      candidate.proof.manualCloudflareAnalyticsSha256,
      analytics.proofSha256,
      "manual Cloudflare analytics",
    ],
  ];
  for (const [actual, expected, label] of proofBindings) {
    if (actual !== expected) {
      fail(`candidate ${label} proof is not internally bound.`);
    }
  }

  return {
    candidateRunId,
    sourceCommit: candidate.source.commit,
    sourceTreeSha256: candidate.source.sourceTreeSha256,
    artifactSha256: candidate.artifact.sha256,
    previewUrl: candidate.preview.url,
    deploymentId: candidate.preview.deploymentId,
    integrations: candidate.integrations,
  };
};

const expectedCriterionStatus = (id) =>
  Object.hasOwn(DEFERRED_SCOPES, id) ? "PRE_PROMOTION_PASS" : "PASS";

const validateVerdict = (verdict, identity, generatedAt) => {
  if (!isPlainObject(verdict)) fail("verdict must be a JSON object.");
  if (
    verdict.task_id !== TASK_ID ||
    verdict.overall_verdict !== "PRE_PROMOTION_PASS"
  ) {
    fail("verdict must be a PRE_PROMOTION_PASS judgment for this frozen task.");
  }
  requireFreshTimestamp(
    verdict.verified_at,
    generatedAt,
    "verdict.verified_at",
    VERDICT_MAX_AGE_MS,
  );
  const bindings = [
    [String(verdict.candidate_run_id ?? ""), identity.candidateRunId, "candidate run"],
    [verdict.source_commit, identity.sourceCommit, "source commit"],
    [verdict.source_tree_sha256, identity.sourceTreeSha256, "source tree"],
    [verdict.artifact_sha256, identity.artifactSha256, "artifact"],
  ];
  for (const [actual, expected, label] of bindings) {
    if (actual !== expected) {
      fail(`verdict ${label} does not match the sealed candidate.`);
    }
  }
  if (!Array.isArray(verdict.criteria) || verdict.criteria.length !== 13) {
    fail("verdict.criteria must judge exactly AC1 through AC13.");
  }
  const ids = new Set();
  for (const entry of verdict.criteria) {
    if (!isPlainObject(entry) || typeof entry.id !== "string") {
      fail("verdict.criteria contains a malformed criterion result.");
    }
    if (!/^AC(?:[1-9]|1[0-3])$/.test(entry.id) || ids.has(entry.id)) {
      fail(`verdict.criteria contains an invalid or duplicate id: ${entry.id}.`);
    }
    ids.add(entry.id);
    if (entry.status !== expectedCriterionStatus(entry.id)) {
      fail(
        `verdict ${entry.id} must be ${expectedCriterionStatus(entry.id)}.`,
      );
    }
  }
  for (let number = 1; number <= 13; number += 1) {
    if (!ids.has(`AC${number}`)) fail(`verdict.criteria is missing AC${number}.`);
  }
};

const proofReference = (relativePath, checkedAt, repoRoot) => {
  const resolved = path.resolve(repoRoot, ...relativePath.split("/"));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    fail(`evidence file does not exist: ${relativePath}.`);
  }
  return {
    path: relativePath,
    sha256: sha256(fs.readFileSync(resolved)),
    checkedAt,
  };
};

const discoverExternalGates = ({ repoRoot, generatedAt, identity, candidate }) => {
  const externalGates = [];
  let latestCheckedAt = candidate.createdAt;
  for (const gateId of EXTERNAL_GATE_IDS) {
    const relativePath = `${externalGateDirectory(gateId)}/evidence.json`;
    const resolved = path.resolve(repoRoot, ...relativePath.split("/"));
    if (!fs.existsSync(resolved)) {
      const template = path.resolve(
        repoRoot,
        ...`${externalGateDirectory(gateId)}/evidence.template.json`.split("/"),
      );
      if (fs.existsSync(template)) {
        fail(
          `${gateId} remains an UNKNOWN template; complete its gate-specific evidence.json first.`,
        );
      }
      fail(`${gateId} is missing its completed gate-specific evidence.json.`);
    }
    const proofFile = readJsonFile(resolved, `${gateId} proof`, fail);
    const checkedAt = proofFile.value?.checkedAt;
    if (!isIsoTimestamp(checkedAt)) {
      fail(`${gateId} proof checkedAt must be a UTC ISO-8601 timestamp.`);
    }
    if (
      Date.parse(checkedAt) + MAX_CLOCK_SKEW_MS <
      Date.parse(candidate.createdAt)
    ) {
      fail(`${gateId} proof predates the sealed preview candidate.`);
    }
    if (Date.parse(checkedAt) > Date.parse(latestCheckedAt)) {
      latestCheckedAt = checkedAt;
    }
    externalGates.push({
      id: gateId,
      status: "PASS",
      evidence: [
        {
          path: relativePath,
          sha256: proofFile.sha256,
          checkedAt,
        },
      ],
    });
  }

  const validated = validateExternalGateEvidence({
    externalGates,
    repoRoot,
    referenceTime: generatedAt,
    candidateRunId: identity.candidateRunId,
    sourceCommit: identity.sourceCommit,
    artifactSha256: identity.artifactSha256,
    previewUrl: identity.previewUrl,
    requiredZoomRoutes: publicRoutes,
    candidateIntegrations: candidate.integrations,
    candidateLegalDocuments: candidate.legalDocuments,
    fail,
  });
  if (validated.length !== EXTERNAL_GATE_IDS.length) {
    fail("external gate validation returned incomplete coverage.");
  }
  return { externalGates, latestCheckedAt };
};

const assembleEvidenceValue = ({
  generatedAt,
  candidate,
  candidateReference,
  verdict,
  verdictReference,
  externalGates,
}) => {
  const gateReferences = new Map(
    externalGates.map((entry) => [entry.id, entry.evidence[0]]),
  );
  const criteria = Array.from({ length: 13 }, (_, index) => {
    const id = `AC${index + 1}`;
    const relevantGateReferences = CRITERION_GATE_MAP[id].map((gateId) => ({
      ...gateReferences.get(gateId),
    }));
    return {
      id,
      status: expectedCriterionStatus(id),
      scope: DEFERRED_SCOPES[id] || "complete",
      evidence: [{ ...candidateReference }, ...relevantGateReferences],
    };
  });

  return {
    schemaVersion: 1,
    taskId: TASK_ID,
    scope: "pre-promotion",
    generatedAt,
    candidateRunId: String(candidate.candidateRunId),
    source: { ...candidate.source },
    artifact: { sha256: candidate.artifact.sha256 },
    preview: {
      url: candidate.preview.url,
      deploymentId: candidate.preview.deploymentId,
      status: "PASS",
      evidence: [{ ...candidateReference }],
    },
    verifier: {
      verdict: "PRE_PROMOTION_PASS",
      verifiedAt: verdict.verified_at,
      evidence: [{ ...verdictReference }],
    },
    criteria,
    externalGates,
  };
};

const runPromotionValidator = ({
  repoRoot,
  candidatePath,
  evidencePath,
  problemsPath,
  evidenceSha256,
  candidateRunId,
}) => {
  const validationOutput = path.join(
    os.tmpdir(),
    `jq33-prepromotion-validation-${process.pid}-${Date.now()}.json`,
  );
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(VALIDATOR_PATH),
      "--repo-root",
      repoRoot,
      "--evidence",
      evidencePath,
      "--problems",
      problemsPath,
      "--candidate-attestation",
      candidatePath,
      "--expected-evidence-sha256",
      evidenceSha256,
      "--expected-candidate-run-id",
      candidateRunId,
      "--output",
      validationOutput,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  try {
    if (result.status !== 0) {
      const diagnostic = `${result.stderr || ""}\n${result.stdout || ""}`.trim();
      fail(`strict promotion validator rejected the assembled evidence: ${diagnostic}`);
    }
    const validation = readJsonFile(
      validationOutput,
      "strict promotion validation",
      fail,
    ).value;
    if (validation.result !== "PASS") {
      fail("strict promotion validator did not return PASS.");
    }
  } finally {
    fs.rmSync(validationOutput, { force: true });
  }
};

const assemblePrepromotionEvidence = ({
  repoRoot,
  candidatePath,
  verdictPath,
  outputPath,
  force = false,
  generatedAt = new Date().toISOString(),
}) => {
  const expectedCandidatePath = path.resolve(
    repoRoot,
    ...CANDIDATE_REFERENCE_PATH.split("/"),
  );
  if (path.resolve(candidatePath) !== expectedCandidatePath) {
    fail(
      `--candidate-attestation must resolve to ${CANDIDATE_REFERENCE_PATH}.`,
    );
  }
  const expectedOutputPath = path.resolve(
    repoRoot,
    ...DEFAULT_OUTPUT_PATH.split("/"),
  );
  if (path.resolve(outputPath) !== expectedOutputPath) {
    fail(`--output must resolve to ${DEFAULT_OUTPUT_PATH}.`);
  }
  const verdictRelativePath = safeTaskRelativePath(
    repoRoot,
    verdictPath,
    "--verdict",
  );
  if (path.basename(verdictRelativePath) !== "verdict.json") {
    fail("--verdict must point to a verdict.json file inside the frozen task.");
  }
  if (fs.existsSync(outputPath) && !force) {
    fail(`refusing to overwrite ${DEFAULT_OUTPUT_PATH}; rerun with --force.`);
  }
  if (!isIsoTimestamp(generatedAt)) {
    fail("generatedAt must be a UTC ISO-8601 timestamp.");
  }

  const candidateFile = readJsonFile(candidatePath, "candidate attestation", fail);
  const identity = validateCandidateAttestation(candidateFile.value, generatedAt);
  const candidateReference = {
    path: CANDIDATE_REFERENCE_PATH,
    sha256: candidateFile.sha256,
    checkedAt: candidateFile.value.createdAt,
  };
  validateProofRef(candidateReference, {
    repoRoot,
    referenceTime: generatedAt,
    label: "candidate attestation reference",
    fail,
    parseJson: true,
  });

  const verdictFile = readJsonFile(verdictPath, "verdict", fail);
  validateVerdict(verdictFile.value, identity, generatedAt);
  const verdictReference = {
    path: verdictRelativePath,
    sha256: verdictFile.sha256,
    checkedAt: verdictFile.value.verified_at,
  };
  validateProofRef(verdictReference, {
    repoRoot,
    referenceTime: generatedAt,
    label: "verdict reference",
    fail,
    maxAgeMs: VERDICT_MAX_AGE_MS,
    parseJson: true,
  });

  const discoveredGates = discoverExternalGates({
    repoRoot,
    generatedAt,
    identity,
    candidate: candidateFile.value,
  });
  if (
    Date.parse(verdictFile.value.verified_at) + MAX_CLOCK_SKEW_MS <
    Date.parse(discoveredGates.latestCheckedAt)
  ) {
    fail("verdict.verified_at predates the latest candidate-bound external proof.");
  }
  const evidence = assembleEvidenceValue({
    generatedAt,
    candidate: candidateFile.value,
    candidateReference,
    verdict: verdictFile.value,
    verdictReference,
    externalGates: discoveredGates.externalGates,
  });
  const bytes = `${JSON.stringify(evidence, null, 2)}\n`;
  const evidenceSha256 = sha256(bytes);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.pending-${process.pid}-${Date.now()}`;
  const markdownPath = path.resolve(repoRoot, ...EVIDENCE_MARKDOWN_PATH.split("/"));
  const problemsPath = path.resolve(repoRoot, ...PROBLEMS_PATH.split("/"));
  const temporaryMarkdownPath = `${markdownPath}.pending-${process.pid}-${Date.now()}`;
  const temporaryProblemsPath = `${problemsPath}.pending-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, bytes, "utf8");
  try {
    writeEvidenceCompanions({
      evidence,
      evidencePath: DEFAULT_OUTPUT_PATH,
      evidenceSha256,
      markdownPath: temporaryMarkdownPath,
      problemsPath: temporaryProblemsPath,
    });
    runPromotionValidator({
      repoRoot,
      candidatePath,
      evidencePath: temporaryPath,
      problemsPath: temporaryProblemsPath,
      evidenceSha256,
      candidateRunId: identity.candidateRunId,
    });
    commitFileBundle([
      { pendingPath: temporaryPath, outputPath },
      { pendingPath: temporaryMarkdownPath, outputPath: markdownPath },
      { pendingPath: temporaryProblemsPath, outputPath: problemsPath },
    ]);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
    fs.rmSync(temporaryMarkdownPath, { force: true });
    fs.rmSync(temporaryProblemsPath, { force: true });
  }
  return { evidence, evidenceSha256, identity };
};

const jsonBytes = (value) => `${JSON.stringify(value, null, 2)}\n`;

const writeJson = (repoRoot, relativePath, value) => {
  const filePath = path.resolve(repoRoot, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, jsonBytes(value), "utf8");
  return filePath;
};

const selfTestDetails = (gateId, fixture) => {
  switch (gateId) {
    case "formspree-contact-delivery":
    case "formspree-inquiry-delivery": {
      const contact = gateId === "formspree-contact-delivery";
      return {
        form: contact ? "contact" : "inquiry",
        requestCount: 1,
        providerAcceptanceCount: 1,
        inboxReceiptCount: 1,
        duplicateCount: 0,
        endpointSha256: contact
          ? fixture.integrations.formspree.contactEndpointSha256
          : fixture.integrations.formspree.inquiryEndpointSha256,
        tagSha256: sha256(contact ? "contact-tag" : "inquiry-tag"),
        submissionSha256: sha256(
          contact ? "contact-submission" : "inquiry-submission",
        ),
      };
    }
    case "formspree-spam-retention":
      return {
        accountEvidenceSha256: sha256("formspree-account-evidence"),
        contactEndpointSha256:
          fixture.integrations.formspree.contactEndpointSha256,
        inquiryEndpointSha256:
          fixture.integrations.formspree.inquiryEndpointSha256,
        spamProtectionEnabled: true,
        retentionMonths: 12,
        deletionConfirmed: true,
      };
    case "calendly-booking-cancel":
      return {
        eventUrl: fixture.calendlyUrl,
        eventUrlSha256: fixture.integrations.calendly.eventUrlSha256,
        published: true,
        bookingCount: 1,
        inviteCount: 1,
        cancellationCount: 1,
        extraCount: 0,
      };
    case "social-profile-ownership":
      return {
        userConfirmed: true,
        publishedProfileCount: fixture.socialProfiles.length,
        profiles: fixture.socialProfiles.map((entry) => ({
          platform: entry.platform,
          url: entry.url,
          confirmed: true,
        })),
      };
    case "cloudflare-pages-web-analytics":
      return {
        sourceMode: "source-manual",
        automaticInjection: "disabled",
        tokenSha256: fixture.integrations.cloudflareWebAnalytics.tokenSha256,
        dashboardPageView: {
          url: `${fixture.previewUrl}contact/`,
          observedAt: fixture.checkedAt,
          count: 1,
        },
      };
    case "dns-mx-spf-dkim-dmarc":
      return {
        domain: "jq33.design",
        senderDomain: "jq33.design",
        mxValid: true,
        mxRecordCount: 2,
        spfRecordCount: 1,
        dkimRecordCount: 1,
        dkimSelectors: ["formspree"],
        dmarcRecordCount: 1,
        alignmentResult: "PASS",
        resolvers: [
          { name: "1.1.1.1", result: "PASS" },
          { name: "8.8.8.8", result: "PASS" },
        ],
      };
    case "google-search-console":
      return {
        property: "jq33.design",
        propertyType: "DOMAIN",
        ownershipVerified: true,
        sitemap: {
          url: "https://jq33.design/sitemap.xml",
          status: "ACCEPTED",
          fetchable: true,
        },
      };
    case "nvda-windows":
      return {
        platform: "Windows",
        screenReader: "NVDA",
        result: "PASS",
        checklist: REQUIRED_NVDA_CHECKS.map((id) => ({ id, status: "PASS" })),
      };
    case "legal-privacy-retention":
      return {
        legalSignoff: "APPROVED",
        signedAt: fixture.checkedAt,
        retentionMonths: 12,
        deletionProcessConfirmed: true,
        privacySha256: fixture.legalDocuments.privacy.sha256,
        termsSha256: fixture.legalDocuments.terms.sha256,
      };
    case "browser-zoom-200":
      return {
        zoomPercent: 200,
        result: "PASS",
        routeChecklist: publicRoutes.map((route) => ({ route, status: "PASS" })),
        templateChecklist: REQUIRED_ZOOM_TEMPLATES.map((template) => ({
          template,
          status: "PASS",
        })),
      };
    case "schema-rich-results":
      return {
        schemaValidationResult: "PASS",
        richResultsResult: "PASS",
        blockingErrorCount: 0,
        checks: publicRoutes.map((route) => ({
            url: new URL(route, fixture.previewUrl).href,
            schemaStatus: "PASS",
            richResultsStatus: "PASS",
            blockingErrorCount: 0,
          })),
      };
    case "operational-privacy":
      return {
        processors: REQUIRED_PRIVACY_PROCESSORS.map((name) => ({
          name,
          status: "PASS",
        })),
        dataFlows: REQUIRED_PRIVACY_FLOWS.map((id) => ({ id, status: "PASS" })),
        retentionMonths: 12,
        deletionProcessConfirmed: true,
      };
    default:
      fail(`self-test has no details fixture for ${gateId}.`);
  }
};

const selfTestObservations = (gateId, details, fixture) => {
  switch (gateId) {
    case "formspree-contact-delivery":
    case "formspree-inquiry-delivery":
      return {
        endpointSha256: details.endpointSha256,
        tagSha256: details.tagSha256,
        submissionSha256: details.submissionSha256,
      };
    case "formspree-spam-retention":
      return {
        accountEvidenceSha256: details.accountEvidenceSha256,
        contactEndpointSha256: details.contactEndpointSha256,
        inquiryEndpointSha256: details.inquiryEndpointSha256,
      };
    case "dns-mx-spf-dkim-dmarc":
      return {
        domain: details.domain,
        senderDomain: details.senderDomain,
        dkimSelectors: details.dkimSelectors,
      };
    case "legal-privacy-retention":
      return {
        privacySha256: details.privacySha256,
        termsSha256: details.termsSha256,
      };
    case "schema-rich-results":
      return {
        previewOrigin: new URL(fixture.previewUrl).origin,
        checkedRouteCount: details.checks.length,
      };
    default:
      return { result: "PASS" };
  }
};

const createSelfTestWorkspace = (repoRoot) => {
  const now = Date.now();
  const createdAt = new Date(now - 90_000).toISOString();
  const checkedAt = new Date(now - 45_000).toISOString();
  const previewUrl = "https://a1b2c3d4.jq33.pages.dev/";
  const calendlyUrl = "https://calendly.com/jq33/consultation";
  const socialProfiles = [
    { platform: "behance", url: "https://www.behance.net/jq33design" },
    { platform: "instagram", url: "https://www.instagram.com/jq33design/" },
  ];
  const integrations = {
    formspree: {
      contactEndpointSha256: sha256("https://formspree.io/f/contact123"),
      inquiryEndpointSha256: sha256("https://formspree.io/f/inquiry456"),
    },
    calendly: { eventUrlSha256: sha256(calendlyUrl) },
    social: {
      publishedProfileCount: socialProfiles.length,
      profiles: socialProfiles.map(({ platform, url }) => ({
        platform,
        urlSha256: sha256(new URL(url).href),
      })),
    },
    cloudflareWebAnalytics: {
      tokenSha256: sha256("0123456789abcdef0123456789abcdef"),
      documentCount: publicRoutes.length + 1,
    },
  };
  const fixture = {
    previewUrl,
    calendlyUrl,
    socialProfiles,
    integrations,
    legalDocuments: {
      privacy: {
        route: "/privacy/",
        artifactPath: "privacy/index.html",
        sha256: sha256("privacy-document"),
      },
      terms: {
        route: "/terms/",
        artifactPath: "terms/index.html",
        sha256: sha256("terms-document"),
      },
    },
    checkedAt,
  };
  const hashes = {
    candidateVerification: sha256("candidate-verification"),
    deployment: sha256("deployment"),
    status: sha256("status"),
    lighthouseMetadata: sha256("lighthouse-metadata"),
    lighthouseSummary: sha256("lighthouse-summary"),
    lighthouseReports: sha256("lighthouse-reports"),
    analytics: sha256("analytics"),
  };
  const candidate = {
    schemaVersion: 1,
    kind: "jq33-preview-candidate",
    createdAt,
    result: "PASS",
    candidateRunId: "123456789",
    source: {
      commit: "1".repeat(40),
      ref: MAIN_REF,
      lockfileSha256: "2".repeat(64),
      sourceTreeSha256: "3".repeat(64),
      sourceInputCount: 89,
      sourceDirty: false,
      sourceChangeCount: 0,
    },
    artifact: {
      sha256: "4".repeat(64),
      manifestSha256: "5".repeat(64),
      fileCount: 89,
    },
    integrations,
    legalDocuments: fixture.legalDocuments,
    preview: {
      url: previewUrl,
      deploymentId: "deployment-a1b2c3d4",
      branch: "candidate-111111111111",
      mode: "deployed-preview",
      productionMode: false,
      statusMatrix: {
        baseUrl: previewUrl,
        result: "PASS",
        checkedAt: new Date(now - 120_000).toISOString(),
        recordCount: 117,
        publicRouteCount: publicRoutes.length,
        negativeRouteCount: 1,
        redirectRecordCount: 1,
        crawlFileCount: 2,
        artifactFileCount: 89,
        sha256: hashes.status,
      },
      lighthouse: {
        baseUrl: previewUrl,
        runsPerRoute: 3,
        rawReportCount: publicRoutes.length * 3,
        rawReportsSha256: hashes.lighthouseReports,
        metadataSha256: hashes.lighthouseMetadata,
        summarySha256: hashes.lighthouseSummary,
        statusMatrixSha256: hashes.status,
      },
      analytics: {
        mode: "source-managed-manual-snippet",
        automaticHtmlInjection: "disabled",
        documentCount: publicRoutes.length + 1,
        proofSha256: hashes.analytics,
      },
    },
    htmlMutationPolicy: "exact-byte-parity-reject",
    proof: {
      candidateVerificationSha256: hashes.candidateVerification,
      cloudflareDeploymentSha256: hashes.deployment,
      statusMatrixSha256: hashes.status,
      lighthouseMetadataSha256: hashes.lighthouseMetadata,
      lighthouseSummarySha256: hashes.lighthouseSummary,
      lighthouseRawReportsSha256: hashes.lighthouseReports,
      manualCloudflareAnalyticsSha256: hashes.analytics,
    },
  };
  const candidatePath = writeJson(repoRoot, CANDIDATE_REFERENCE_PATH, candidate);
  const verdict = {
    task_id: TASK_ID,
    overall_verdict: "PRE_PROMOTION_PASS",
    verified_at: checkedAt,
    candidate_run_id: candidate.candidateRunId,
    source_commit: candidate.source.commit,
    source_tree_sha256: candidate.source.sourceTreeSha256,
    artifact_sha256: candidate.artifact.sha256,
    criteria: Array.from({ length: 13 }, (_, index) => {
      const id = `AC${index + 1}`;
      return { id, status: expectedCriterionStatus(id), reason: "self-test" };
    }),
  };
  const verdictPath = writeJson(repoRoot, DEFAULT_VERDICT_PATH, verdict);

  for (const gateId of EXTERNAL_GATE_IDS) {
    const details = selfTestDetails(gateId, fixture);
    const capturePath = `${externalGateDirectory(gateId)}/raw-capture.json`;
    const captureFile = writeJson(repoRoot, capturePath, {
      schemaVersion: 1,
      gateId,
      capturedAt: checkedAt,
      redacted: true,
      candidateRunId: candidate.candidateRunId,
      sourceCommit: candidate.source.commit,
      artifactSha256: candidate.artifact.sha256,
      previewUrl,
      detailsSha256: externalGateDetailsSha256(details),
      observations: selfTestObservations(gateId, details, fixture),
    });
    const proof = {
      schemaVersion: 1,
      gateId,
      checkedAt,
      result: "PASS",
      redacted: true,
      candidateRunId: candidate.candidateRunId,
      sourceCommit: candidate.source.commit,
      artifactSha256: candidate.artifact.sha256,
      previewUrl,
      artifacts: [
        {
          path: capturePath,
          sha256: sha256(fs.readFileSync(captureFile)),
          checkedAt,
        },
      ],
      details,
    };
    writeJson(repoRoot, `${externalGateDirectory(gateId)}/evidence.json`, proof);
  }
  return {
    candidatePath,
    verdictPath,
    outputPath: path.resolve(repoRoot, ...DEFAULT_OUTPUT_PATH.split("/")),
  };
};

const runSelfTest = () => {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "jq33-prepromotion-assembler-"),
  );
  try {
    const workspace = createSelfTestWorkspace(temporaryRoot);
    const assembled = assemblePrepromotionEvidence({
      repoRoot: temporaryRoot,
      ...workspace,
    });
    assert.equal(assembled.evidence.scope, "pre-promotion");
    assert.equal(assembled.evidence.criteria.length, 13);
    assert.equal(assembled.evidence.externalGates.length, EXTERNAL_GATE_IDS.length);
    assert.equal(assembled.evidence.criteria[1].status, "PRE_PROMOTION_PASS");
    assert.equal(assembled.evidence.criteria[0].status, "PASS");
    assert.equal(
      sha256(fs.readFileSync(workspace.outputPath)),
      assembled.evidenceSha256,
    );
    assert.throws(
      () =>
        assemblePrepromotionEvidence({
          repoRoot: temporaryRoot,
          ...workspace,
        }),
      /refusing to overwrite/,
    );

    fs.rmSync(workspace.outputPath, { force: true });
    const blockerText = "# Problems\n\nStatus: BLOCKED\n\nSelf-test blocker.\n";
    const problemsPath = path.resolve(
      temporaryRoot,
      ...PROBLEMS_PATH.split("/"),
    );
    fs.writeFileSync(problemsPath, blockerText, "utf8");
    const candidateBytes = fs.readFileSync(workspace.candidatePath);
    const wrongBranchCandidate = JSON.parse(candidateBytes.toString("utf8"));
    wrongBranchCandidate.preview.branch = "main";
    fs.writeFileSync(
      workspace.candidatePath,
      jsonBytes(wrongBranchCandidate),
      "utf8",
    );
    assert.throws(
      () =>
        assemblePrepromotionEvidence({
          repoRoot: temporaryRoot,
          ...workspace,
        }),
      /candidate-111111111111/,
    );
    assert.equal(fs.existsSync(workspace.outputPath), false);
    assert.equal(fs.readFileSync(problemsPath, "utf8"), blockerText);
    fs.writeFileSync(workspace.candidatePath, candidateBytes);

    const blockedGate = EXTERNAL_GATE_IDS[0];
    const completedProof = path.resolve(
      temporaryRoot,
      ...`${externalGateDirectory(blockedGate)}/evidence.json`.split("/"),
    );
    const templateProof = path.resolve(
      temporaryRoot,
      ...`${externalGateDirectory(blockedGate)}/evidence.template.json`.split("/"),
    );
    const template = JSON.parse(fs.readFileSync(completedProof, "utf8"));
    template.result = "UNKNOWN";
    fs.rmSync(completedProof);
    fs.writeFileSync(templateProof, jsonBytes(template), "utf8");
    assert.throws(
      () =>
        assemblePrepromotionEvidence({
          repoRoot: temporaryRoot,
          ...workspace,
        }),
      /remains an UNKNOWN template/,
    );
    assert.equal(fs.existsSync(workspace.outputPath), false);
    assert.equal(fs.readFileSync(problemsPath, "utf8"), blockerText);

    console.log(
      `Pre-promotion evidence assembler self-test passed: strict candidate branch, verdict, ${EXTERNAL_GATE_IDS.length} distinct gates, validator round-trip, atomic blocker preservation, overwrite guard, wrong-branch rejection, and UNKNOWN-template rejection.`,
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
};

const parseArguments = () => {
  const options = {
    candidateAttestation: "",
    verdict: DEFAULT_VERDICT_PATH,
    output: DEFAULT_OUTPUT_PATH,
    force: false,
    selfTest: false,
  };
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--force") options.force = true;
    else if (argument === "--candidate-attestation") {
      options.candidateAttestation = process.argv[++index] || "";
    } else if (argument === "--verdict") {
      options.verdict = process.argv[++index] || "";
    } else if (argument === "--output") {
      options.output = process.argv[++index] || "";
    } else {
      fail(`unknown argument: ${argument}`);
    }
  }
  return options;
};

const main = () => {
  const options = parseArguments();
  if (options.selfTest) {
    if (
      options.candidateAttestation ||
      options.verdict !== DEFAULT_VERDICT_PATH ||
      options.output !== DEFAULT_OUTPUT_PATH ||
      options.force
    ) {
      fail("--self-test cannot be combined with candidate, verdict, output, or force options.");
    }
    runSelfTest();
    return;
  }
  if (!options.candidateAttestation) {
    fail(`--candidate-attestation ${CANDIDATE_REFERENCE_PATH} is required.`);
  }
  const repoRoot = process.cwd();
  const result = assemblePrepromotionEvidence({
    repoRoot,
    candidatePath: path.resolve(repoRoot, options.candidateAttestation),
    verdictPath: path.resolve(repoRoot, options.verdict),
    outputPath: path.resolve(repoRoot, options.output),
    force: options.force,
  });
  console.log(
    `Strict pre-promotion evidence assembled for candidate run ${result.identity.candidateRunId}.`,
  );
  console.log(`Output: ${DEFAULT_OUTPUT_PATH}`);
  console.log(`SHA-256: ${result.evidenceSha256}`);
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Pre-promotion evidence assembly failed: ${message}`);
  process.exitCode = 1;
}
