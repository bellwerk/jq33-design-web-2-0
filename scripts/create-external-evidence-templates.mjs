import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  EXTERNAL_GATE_IDS,
  EXTERNAL_GATE_PROOF_ROOT,
  REQUIRED_NVDA_CHECKS,
  REQUIRED_PRIVACY_FLOWS,
  REQUIRED_PRIVACY_PROCESSORS,
  REQUIRED_ZOOM_TEMPLATES,
  validateCandidateIntegrations,
  validateCandidateLegalDocuments,
} from "./ci-external-gate-evidence.mjs";
import { publicRoutes } from "../tests/helpers/site.mjs";
import { assertExternalEvidenceRedacted } from "./ci-check-evidence-redaction.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const NUMERIC_RUN_ID_PATTERN = /^[1-9]\d*$/;
const COMPLETED_PROOF_NAME = "evidence.json";
const TEMPLATE_NAME = "evidence.template.json";
const RAW_CAPTURE_NAME = "raw-capture.json";
const RAW_CAPTURE_TEMPLATE_NAME = "raw-capture.template.json";

const fail = (message) => {
  throw new Error(message);
};

const normalized = (value) => value.split(path.sep).join("/");
const isSha256 = (value) => typeof value === "string" && SHA256_PATTERN.test(value);
const isCommit = (value) => typeof value === "string" && COMMIT_PATTERN.test(value);
const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isIsoUtcTimestamp = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
};

const exactKeys = (value, expected, label) => {
  if (!isPlainObject(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.join("\0") !== wanted.join("\0")) {
    fail(`${label} must contain exactly: ${wanted.join(", ")}.`);
  }
};

const requireSha256 = (value, label) => {
  if (!isSha256(value)) fail(`${label} must be a lowercase SHA-256.`);
};

const requireHttpsPagesOrigin = (value, label) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a valid HTTPS pages.dev origin.`);
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

const validateIntegrations = (integrations) => {
  validateCandidateIntegrations(integrations, fail);
  exactKeys(
    integrations,
    ["formspree", "calendly", "social", "cloudflareWebAnalytics"],
    "candidate.integrations",
  );
  exactKeys(
    integrations.formspree,
    ["contactEndpointSha256", "inquiryEndpointSha256"],
    "candidate.integrations.formspree",
  );
  requireSha256(
    integrations.formspree.contactEndpointSha256,
    "candidate.integrations.formspree.contactEndpointSha256",
  );
  requireSha256(
    integrations.formspree.inquiryEndpointSha256,
    "candidate.integrations.formspree.inquiryEndpointSha256",
  );
  if (
    integrations.formspree.contactEndpointSha256 ===
    integrations.formspree.inquiryEndpointSha256
  ) {
    fail("candidate Formspree Contact and Inquiry endpoint hashes must be distinct.");
  }

  exactKeys(
    integrations.calendly,
    ["eventUrlSha256"],
    "candidate.integrations.calendly",
  );
  requireSha256(
    integrations.calendly.eventUrlSha256,
    "candidate.integrations.calendly.eventUrlSha256",
  );
  exactKeys(
    integrations.cloudflareWebAnalytics,
    ["tokenSha256", "documentCount"],
    "candidate.integrations.cloudflareWebAnalytics",
  );
  requireSha256(
    integrations.cloudflareWebAnalytics.tokenSha256,
    "candidate.integrations.cloudflareWebAnalytics.tokenSha256",
  );
  if (
    !Number.isSafeInteger(integrations.cloudflareWebAnalytics.documentCount) ||
    integrations.cloudflareWebAnalytics.documentCount < 1
  ) {
    fail("candidate.integrations.cloudflareWebAnalytics.documentCount must be positive.");
  }

  exactKeys(
    integrations.social,
    ["publishedProfileCount", "profiles"],
    "candidate.integrations.social",
  );
  if (
    !Number.isSafeInteger(integrations.social.publishedProfileCount) ||
    integrations.social.publishedProfileCount < 0
  ) {
    fail("candidate.integrations.social.publishedProfileCount must be a non-negative integer.");
  }
  if (!Array.isArray(integrations.social.profiles)) {
    fail("candidate.integrations.social.profiles must be an array.");
  }
  if (
    integrations.social.publishedProfileCount !==
    integrations.social.profiles.length
  ) {
    fail("candidate.integrations.social count must equal its sealed profile list length.");
  }
  const priorSortKeys = [];
  const platforms = new Set();
  const urlHashes = new Set();
  for (const [index, profile] of integrations.social.profiles.entries()) {
    const label = `candidate.integrations.social.profiles[${index}]`;
    exactKeys(profile, ["platform", "urlSha256"], label);
    if (
      typeof profile.platform !== "string" ||
      profile.platform !== profile.platform.trim().toLowerCase() ||
      !/^[a-z0-9][a-z0-9-]*$/.test(profile.platform)
    ) {
      fail(`${label}.platform must be a normalized lowercase platform ID.`);
    }
    requireSha256(profile.urlSha256, `${label}.urlSha256`);
    if (platforms.has(profile.platform)) {
      fail("candidate.integrations.social repeats a platform.");
    }
    if (urlHashes.has(profile.urlSha256)) {
      fail("candidate.integrations.social repeats a URL hash.");
    }
    platforms.add(profile.platform);
    urlHashes.add(profile.urlSha256);
    priorSortKeys.push(`${profile.platform}\0${profile.urlSha256}`);
  }
  if (
    priorSortKeys.join("\0") !==
    [...priorSortKeys].sort((a, b) => a.localeCompare(b)).join("\0")
  ) {
    fail("candidate.integrations.social.profiles must be deterministically sorted.");
  }
};

const validateCandidateAttestation = (candidate) => {
  if (!isPlainObject(candidate)) fail("candidate attestation must be a JSON object.");
  if (
    candidate.schemaVersion !== 1 ||
    candidate.kind !== "jq33-preview-candidate" ||
    candidate.result !== "PASS"
  ) {
    fail("candidate attestation must be a passing jq33-preview-candidate schema v1 document.");
  }
  if (!isIsoUtcTimestamp(candidate.createdAt)) {
    fail("candidate.createdAt must be a UTC ISO-8601 timestamp.");
  }
  const candidateRunId = String(candidate.candidateRunId ?? "");
  if (!NUMERIC_RUN_ID_PATTERN.test(candidateRunId)) {
    fail("candidate.candidateRunId must be a positive numeric run ID.");
  }
  if (!isCommit(candidate.source?.commit)) {
    fail("candidate.source.commit must be a full lowercase commit SHA.");
  }
  if (
    candidate.source?.ref !== "refs/heads/main" ||
    candidate.source?.sourceDirty !== false ||
    candidate.source?.sourceChangeCount !== 0
  ) {
    fail("candidate source must be a clean refs/heads/main production input tree.");
  }
  requireSha256(candidate.source?.lockfileSha256, "candidate.source.lockfileSha256");
  requireSha256(candidate.source?.sourceTreeSha256, "candidate.source.sourceTreeSha256");
  if (
    !Number.isSafeInteger(candidate.source?.sourceInputCount) ||
    candidate.source.sourceInputCount < 1
  ) {
    fail("candidate.source.sourceInputCount must be a positive integer.");
  }
  requireSha256(candidate.artifact?.sha256, "candidate.artifact.sha256");
  requireSha256(
    candidate.artifact?.manifestSha256,
    "candidate.artifact.manifestSha256",
  );
  if (
    !Number.isSafeInteger(candidate.artifact?.fileCount) ||
    candidate.artifact.fileCount < 1
  ) {
    fail("candidate.artifact.fileCount must be a positive integer.");
  }
  requireHttpsPagesOrigin(candidate.preview?.url, "candidate.preview.url");
  if (
    typeof candidate.preview?.deploymentId !== "string" ||
    candidate.preview.deploymentId.trim().length < 8 ||
    /(?:example|placeholder|replace|dummy|test)/i.test(candidate.preview.deploymentId)
  ) {
    fail("candidate.preview.deploymentId must be a non-placeholder deployment ID.");
  }
  const expectedPreviewBranch = `candidate-${candidate.source.commit.slice(0, 12)}`;
  if (
    candidate.preview?.branch !== expectedPreviewBranch ||
    candidate.preview?.mode !== "deployed-preview" ||
    candidate.preview?.productionMode !== false ||
    candidate.preview?.statusMatrix?.result !== "PASS" ||
    candidate.preview?.statusMatrix?.baseUrl !== candidate.preview.url ||
    !isIsoUtcTimestamp(candidate.preview?.statusMatrix?.checkedAt) ||
    !Number.isSafeInteger(candidate.preview?.statusMatrix?.recordCount) ||
    candidate.preview.statusMatrix.recordCount < 1 ||
    !Number.isSafeInteger(candidate.preview?.statusMatrix?.publicRouteCount) ||
    candidate.preview.statusMatrix.publicRouteCount !== publicRoutes.length ||
    !Number.isSafeInteger(candidate.preview?.statusMatrix?.negativeRouteCount) ||
    candidate.preview.statusMatrix.negativeRouteCount < 1 ||
    candidate.preview?.lighthouse?.baseUrl !== candidate.preview.url ||
    candidate.preview?.lighthouse?.runsPerRoute !== 3 ||
    candidate.preview?.lighthouse?.rawReportCount !== publicRoutes.length * 3 ||
    candidate.preview?.analytics?.mode !== "source-managed-manual-snippet" ||
    candidate.preview?.analytics?.automaticHtmlInjection !== "disabled" ||
    candidate.preview?.analytics?.documentCount !== publicRoutes.length + 1
  ) {
    fail(
      `candidate must seal the passing ${expectedPreviewBranch} preview, Lighthouse, and analytics contracts.`,
    );
  }
  requireSha256(
    candidate.preview?.statusMatrix?.sha256,
    "candidate.preview.statusMatrix.sha256",
  );
  requireSha256(
    candidate.preview?.lighthouse?.rawReportsSha256,
    "candidate.preview.lighthouse.rawReportsSha256",
  );
  requireSha256(
    candidate.preview?.lighthouse?.metadataSha256,
    "candidate.preview.lighthouse.metadataSha256",
  );
  requireSha256(
    candidate.preview?.lighthouse?.summarySha256,
    "candidate.preview.lighthouse.summarySha256",
  );
  if (
    candidate.preview?.lighthouse?.statusMatrixSha256 !==
    candidate.preview?.statusMatrix?.sha256
  ) {
    fail("candidate Lighthouse proof must bind the sealed preview status matrix.");
  }
  requireSha256(
    candidate.preview?.analytics?.proofSha256,
    "candidate.preview.analytics.proofSha256",
  );
  if (candidate.htmlMutationPolicy !== "exact-byte-parity-reject") {
    fail("candidate must seal exact-byte-parity-reject as its HTML mutation policy.");
  }
  validateIntegrations(candidate.integrations);
  validateCandidateLegalDocuments(candidate.legalDocuments, fail);
  if (
    candidate.integrations.cloudflareWebAnalytics.documentCount !==
    candidate.preview.analytics.documentCount
  ) {
    fail("candidate Cloudflare integration identity must bind every attested public document.");
  }
  return {
    candidateRunId,
    sourceCommit: candidate.source.commit,
    sourceTreeSha256: candidate.source.sourceTreeSha256,
    artifactSha256: candidate.artifact.sha256,
    previewUrl: candidate.preview.url,
    deploymentId: candidate.preview.deploymentId,
    integrations: candidate.integrations,
    legalDocuments: candidate.legalDocuments,
  };
};

const unknownChecklist = (key, values) =>
  values.map((value) => ({ [key]: value, status: "UNKNOWN" }));

const detailsTemplate = (gateId, identity) => {
  const integrations = identity.integrations;
  switch (gateId) {
    case "formspree-contact-delivery":
    case "formspree-inquiry-delivery": {
      const form = gateId === "formspree-contact-delivery" ? "contact" : "inquiry";
      return {
        form,
        requestCount: null,
        providerAcceptanceCount: null,
        inboxReceiptCount: null,
        duplicateCount: null,
        endpointSha256:
          integrations.formspree[
            form === "contact" ? "contactEndpointSha256" : "inquiryEndpointSha256"
          ],
        tagSha256: null,
        submissionSha256: null,
      };
    }
    case "formspree-spam-retention":
      return {
        accountEvidenceSha256: null,
        contactEndpointSha256:
          integrations.formspree.contactEndpointSha256,
        inquiryEndpointSha256:
          integrations.formspree.inquiryEndpointSha256,
        spamProtectionEnabled: null,
        retentionMonths: null,
        deletionConfirmed: null,
      };
    case "calendly-booking-cancel":
      return {
        eventUrl: null,
        eventUrlSha256: integrations.calendly.eventUrlSha256,
        published: null,
        bookingCount: null,
        inviteCount: null,
        cancellationCount: null,
        extraCount: null,
      };
    case "social-profile-ownership":
      return {
        userConfirmed: null,
        publishedProfileCount: integrations.social.publishedProfileCount,
        profiles: integrations.social.profiles.map((profile) => ({
          platform: profile.platform,
          url: null,
          confirmed: null,
        })),
      };
    case "cloudflare-pages-web-analytics":
      return {
        sourceMode: "source-manual",
        automaticInjection: "disabled",
        tokenSha256: integrations.cloudflareWebAnalytics.tokenSha256,
        dashboardPageView: {
          url: identity.previewUrl,
          observedAt: null,
          count: null,
        },
      };
    case "dns-mx-spf-dkim-dmarc":
      return {
        domain: "jq33.design",
        senderDomain: null,
        mxValid: null,
        mxRecordCount: null,
        spfRecordCount: null,
        dkimRecordCount: null,
        dkimSelectors: [],
        dmarcRecordCount: null,
        alignmentResult: "UNKNOWN",
        resolvers: [],
      };
    case "google-search-console":
      return {
        property: "jq33.design",
        propertyType: "DOMAIN",
        ownershipVerified: null,
        sitemap: {
          url: "https://jq33.design/sitemap.xml",
          status: "UNKNOWN",
          fetchable: null,
        },
      };
    case "nvda-windows":
      return {
        platform: "Windows",
        screenReader: "NVDA",
        result: "UNKNOWN",
        checklist: unknownChecklist("id", REQUIRED_NVDA_CHECKS),
      };
    case "legal-privacy-retention":
      return {
        legalSignoff: "UNKNOWN",
        signedAt: null,
        retentionMonths: null,
        deletionProcessConfirmed: null,
        privacySha256: identity.legalDocuments.privacy.sha256,
        termsSha256: identity.legalDocuments.terms.sha256,
      };
    case "browser-zoom-200":
      return {
        zoomPercent: 200,
        result: "UNKNOWN",
        routeChecklist: unknownChecklist("route", publicRoutes),
        templateChecklist: unknownChecklist("template", REQUIRED_ZOOM_TEMPLATES),
      };
    case "schema-rich-results":
      return {
        schemaValidationResult: "UNKNOWN",
        richResultsResult: "UNKNOWN",
        blockingErrorCount: null,
        checks: publicRoutes.map((route) => ({
          url: new URL(route, identity.previewUrl).href,
          schemaStatus: "UNKNOWN",
          richResultsStatus: "UNKNOWN",
          blockingErrorCount: null,
        })),
      };
    case "operational-privacy":
      return {
        processors: unknownChecklist("name", REQUIRED_PRIVACY_PROCESSORS),
        dataFlows: unknownChecklist("id", REQUIRED_PRIVACY_FLOWS),
        retentionMonths: null,
        deletionProcessConfirmed: null,
      };
    default:
      fail(`unsupported external gate: ${gateId}`);
  }
};

const relativeGatePath = (gateId, fileName) =>
  `${EXTERNAL_GATE_PROOF_ROOT}/${gateId}/${fileName}`;

const proofTemplate = (gateId, identity) => ({
  schemaVersion: 1,
  gateId,
  checkedAt: null,
  result: "UNKNOWN",
  redacted: null,
  candidateRunId: identity.candidateRunId,
  sourceCommit: identity.sourceCommit,
  artifactSha256: identity.artifactSha256,
  previewUrl: identity.previewUrl,
  artifacts: [
    {
      path: relativeGatePath(gateId, RAW_CAPTURE_NAME),
      checkedAt: null,
      sha256: null,
    },
  ],
  details: detailsTemplate(gateId, identity),
});

const rawCaptureTemplate = (gateId, identity) => {
  const details = detailsTemplate(gateId, identity);
  const observations = (() => {
    switch (gateId) {
      case "formspree-contact-delivery":
      case "formspree-inquiry-delivery":
        return {
          endpointSha256: details.endpointSha256,
          tagSha256: null,
          submissionSha256: null,
        };
      case "formspree-spam-retention":
        return {
          accountEvidenceSha256: null,
          contactEndpointSha256: details.contactEndpointSha256,
          inquiryEndpointSha256: details.inquiryEndpointSha256,
        };
      case "dns-mx-spf-dkim-dmarc":
        return {
          domain: details.domain,
          senderDomain: null,
          dkimSelectors: [],
        };
      case "legal-privacy-retention":
        return {
          privacySha256: details.privacySha256,
          termsSha256: details.termsSha256,
        };
      case "schema-rich-results":
        return {
          previewOrigin: new URL(identity.previewUrl).origin,
          checkedRouteCount: publicRoutes.length,
        };
      default:
        return { replaceWithRedactedStructuredFacts: null };
    }
  })();
  return {
    schemaVersion: 1,
    gateId,
    capturedAt: null,
    redacted: null,
    candidateRunId: identity.candidateRunId,
    sourceCommit: identity.sourceCommit,
    artifactSha256: identity.artifactSha256,
    previewUrl: identity.previewUrl,
    detailsSha256: null,
    observations,
  };
};

const readJson = (filePath, label) => {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
  return parsed;
};

const jsonBytes = (value) => `${JSON.stringify(value, null, 2)}\n`;

const readmeText = (identity) => `# External promotion evidence workspace

Candidate run: \`${identity.candidateRunId}\`  
Source commit: \`${identity.sourceCommit}\`  
Artifact SHA-256: \`${identity.artifactSha256}\`  
Preview: ${identity.previewUrl}  
Deployment: \`${identity.deploymentId}\`

Every \`evidence.template.json\` is deliberately non-passing. For each gate:

1. Add a redacted raw capture inside that gate directory. Never store lead PII,
   private QA addresses, provider tokens, or secrets.
2. Copy \`raw-capture.template.json\` to \`raw-capture.json\`. Bind it to the
   candidate and proof, set \`detailsSha256\` to the deterministic SHA-256 of
   the completed detail object, and replace the placeholder observation with
   non-empty redacted structured facts. Only UTF-8 JSON raw evidence is
   accepted; screenshots, PDFs, and other binary captures are rejected.
3. Compute the raw file's lowercase SHA-256 and set its \`path\`, \`checkedAt\`,
   and \`sha256\` in the template. Use one current UTC ISO-8601 timestamp
   consistently for the proof, its reference, and the strict root evidence.
4. Fill every gate-specific detail with the exact observed semantics. Confirm
   exposed URLs hash to the sealed integration identities in \`index.json\`.
5. Set \`redacted: true\`, \`result: "PASS"\`, and the common \`checkedAt\`, then
   save the completed proof as \`evidence.json\` in the same gate directory.
6. Run \`node scripts/ci-check-evidence-redaction.mjs\` before assembly.
7. Create the strict root pre-promotion \`evidence.json\` and fresh
   \`verdict.json\`, hash the root evidence, and dispatch
   \`operation=promote-production\` with the exact candidate run, commit, and
   root evidence hash.

The generator never overwrites a completed \`evidence.json\` or a raw capture.
Run it again without \`--force\` to detect any existing template workspace; use
\`--force\` only to refresh README, index, and unfinished template files.
`;

const createPlan = (outputRoot, identity) => {
  const index = {
    schemaVersion: 1,
    kind: "jq33-external-evidence-template-index",
    generatedAt: new Date().toISOString(),
    result: "UNKNOWN",
    candidate: {
      candidateRunId: identity.candidateRunId,
      sourceCommit: identity.sourceCommit,
      sourceTreeSha256: identity.sourceTreeSha256,
      artifactSha256: identity.artifactSha256,
      previewUrl: identity.previewUrl,
      deploymentId: identity.deploymentId,
      integrations: identity.integrations,
      legalDocuments: identity.legalDocuments,
    },
    gates: EXTERNAL_GATE_IDS.map((gateId) => ({
      id: gateId,
      result: "UNKNOWN",
      templatePath: relativeGatePath(gateId, TEMPLATE_NAME),
      proofPath: relativeGatePath(gateId, COMPLETED_PROOF_NAME),
      rawCapturePath: relativeGatePath(gateId, RAW_CAPTURE_NAME),
      rawCaptureTemplatePath: relativeGatePath(
        gateId,
        RAW_CAPTURE_TEMPLATE_NAME,
      ),
    })),
  };
  return [
    { path: path.join(outputRoot, "README.md"), bytes: readmeText(identity) },
    { path: path.join(outputRoot, "index.json"), bytes: jsonBytes(index) },
    ...EXTERNAL_GATE_IDS.map((gateId) => ({
      path: path.join(outputRoot, gateId, TEMPLATE_NAME),
      bytes: jsonBytes(proofTemplate(gateId, identity)),
    })),
    ...EXTERNAL_GATE_IDS.map((gateId) => ({
      path: path.join(outputRoot, gateId, RAW_CAPTURE_TEMPLATE_NAME),
      bytes: jsonBytes(rawCaptureTemplate(gateId, identity)),
    })),
  ];
};

const generateTemplates = ({ candidate, outputRoot, force = false }) => {
  const identity = validateCandidateAttestation(candidate);
  const plan = createPlan(outputRoot, identity);
  if (!force) {
    const existing = plan.filter((entry) => fs.existsSync(entry.path));
    if (existing.length > 0) {
      fail(
        `refusing to overwrite ${existing.length} existing template file(s); rerun with --force to refresh unfinished templates.`,
      );
    }
  }
  for (const entry of plan) {
    if (path.basename(entry.path).toLowerCase() === COMPLETED_PROOF_NAME) {
      fail("internal safety error: generator attempted to plan a completed evidence.json proof.");
    }
    fs.mkdirSync(path.dirname(entry.path), { recursive: true });
    fs.writeFileSync(entry.path, entry.bytes, "utf8");
  }
  return { identity, fileCount: plan.length, files: plan.map((entry) => entry.path) };
};

const fixtureCandidate = () => ({
  schemaVersion: 1,
  kind: "jq33-preview-candidate",
  createdAt: "2026-08-04T12:00:00.000Z",
  result: "PASS",
  candidateRunId: "123456789",
  source: {
    commit: "1".repeat(40),
    ref: "refs/heads/main",
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
  preview: {
    url: "https://abcdef12.jq33.pages.dev/",
    deploymentId: "preview-deployment-123",
    branch: "candidate-111111111111",
    mode: "deployed-preview",
    productionMode: false,
    statusMatrix: {
      baseUrl: "https://abcdef12.jq33.pages.dev/",
      result: "PASS",
      checkedAt: "2026-08-04T12:00:00.000Z",
      recordCount: 117,
      publicRouteCount: 14,
      negativeRouteCount: 1,
      redirectRecordCount: 1,
      crawlFileCount: 2,
      artifactFileCount: 89,
      sha256: "6".repeat(64),
    },
    lighthouse: {
      baseUrl: "https://abcdef12.jq33.pages.dev/",
      runsPerRoute: 3,
      rawReportCount: 42,
      rawReportsSha256: "7".repeat(64),
      metadataSha256: "8".repeat(64),
      summarySha256: "9".repeat(64),
      statusMatrixSha256: "6".repeat(64),
    },
    analytics: {
      mode: "source-managed-manual-snippet",
      automaticHtmlInjection: "disabled",
      documentCount: 15,
      proofSha256: "a".repeat(64),
    },
  },
  integrations: {
    formspree: {
      contactEndpointSha256: "b".repeat(64),
      inquiryEndpointSha256: "c".repeat(64),
    },
    calendly: { eventUrlSha256: "d".repeat(64) },
    social: {
      publishedProfileCount: 2,
      profiles: [
        { platform: "behance", urlSha256: "e".repeat(64) },
        { platform: "instagram", urlSha256: "f".repeat(64) },
      ],
    },
    cloudflareWebAnalytics: {
      tokenSha256: "0".repeat(64),
      documentCount: 15,
    },
  },
  legalDocuments: {
    privacy: {
      route: "/privacy/",
      artifactPath: "privacy/index.html",
      sha256: "1".repeat(64),
    },
    terms: {
      route: "/terms/",
      artifactPath: "terms/index.html",
      sha256: "2".repeat(64),
    },
  },
  htmlMutationPolicy: "exact-byte-parity-reject",
  proof: {},
});

const runSelfTest = () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jq33-external-templates-"));
  try {
    const outputRoot = path.join(temporaryRoot, ...EXTERNAL_GATE_PROOF_ROOT.split("/"));
    const candidate = fixtureCandidate();
    const first = generateTemplates({ candidate, outputRoot });
    assert.equal(first.fileCount, EXTERNAL_GATE_IDS.length * 2 + 2);
    const index = readJson(path.join(outputRoot, "index.json"), "generated index");
    assert.equal(index.result, "UNKNOWN");
    assert.equal(index.gates.length, EXTERNAL_GATE_IDS.length);
    for (const gateId of EXTERNAL_GATE_IDS) {
      const templatePath = path.join(outputRoot, gateId, TEMPLATE_NAME);
      const template = readJson(templatePath, `${gateId} template`);
      assert.equal(template.gateId, gateId);
      assert.equal(template.result, "UNKNOWN");
      assert.equal(template.checkedAt, null);
      assert.equal(template.redacted, null);
      assert.equal(template.candidateRunId, candidate.candidateRunId);
      assert.equal(template.sourceCommit, candidate.source.commit);
      assert.equal(template.artifactSha256, candidate.artifact.sha256);
      assert.equal(template.previewUrl, candidate.preview.url);
      assert.equal(template.artifacts.length, 1);
      assert.equal(template.artifacts[0].sha256, null);
      const rawTemplate = readJson(
        path.join(outputRoot, gateId, RAW_CAPTURE_TEMPLATE_NAME),
        `${gateId} raw capture template`,
      );
      assert.equal(rawTemplate.gateId, gateId);
      assert.equal(rawTemplate.redacted, null);
      assert.equal(rawTemplate.detailsSha256, null);
    }
    assert.equal(
      assertExternalEvidenceRedacted({
        repoRoot: temporaryRoot,
        relativeRoot: EXTERNAL_GATE_PROOF_ROOT,
      }).fileCount,
      first.fileCount,
    );

    assert.throws(
      () => generateTemplates({ candidate, outputRoot }),
      /refusing to overwrite/,
    );

    const protectedGate = EXTERNAL_GATE_IDS[0];
    const completedPath = path.join(outputRoot, protectedGate, COMPLETED_PROOF_NAME);
    const rawCapturePath = path.join(outputRoot, protectedGate, RAW_CAPTURE_NAME);
    const completedBytes = "{\"result\":\"PASS\"}\n";
    const rawBytes = "{\"redacted\":true}\n";
    fs.writeFileSync(completedPath, completedBytes, "utf8");
    fs.writeFileSync(rawCapturePath, rawBytes, "utf8");
    generateTemplates({ candidate, outputRoot, force: true });
    assert.equal(fs.readFileSync(completedPath, "utf8"), completedBytes);
    assert.equal(fs.readFileSync(rawCapturePath, "utf8"), rawBytes);

    const invalidCases = [
      (value) => {
        value.result = "UNKNOWN";
      },
      (value) => {
        value.candidateRunId = "run-123";
      },
      (value) => {
        value.preview.url = "http://localhost:4173/";
      },
      (value) => {
        value.preview.branch = "main";
      },
      (value) => {
        value.integrations.formspree.inquiryEndpointSha256 =
          value.integrations.formspree.contactEndpointSha256;
      },
      (value) => {
        value.integrations.social.profiles.reverse();
      },
      (value) => {
        value.legalDocuments.privacy.sha256 = value.legalDocuments.terms.sha256;
      },
      (value) => {
        value.legalDocuments.terms.route = "/legal/";
      },
    ];
    for (const mutate of invalidCases) {
      const invalid = structuredClone(candidate);
      mutate(invalid);
      assert.throws(() => validateCandidateAttestation(invalid));
    }

    const noSocialCandidate = structuredClone(candidate);
    noSocialCandidate.integrations.social = {
      publishedProfileCount: 0,
      profiles: [],
    };
    const noSocialRoot = path.join(temporaryRoot, "no-social", ...EXTERNAL_GATE_PROOF_ROOT.split("/"));
    generateTemplates({ candidate: noSocialCandidate, outputRoot: noSocialRoot });
    const socialTemplate = readJson(
      path.join(noSocialRoot, "social-profile-ownership", TEMPLATE_NAME),
      "zero-social template",
    );
    assert.deepEqual(socialTemplate.details.profiles, []);

    console.log(
      `External evidence template self-test passed: ${EXTERNAL_GATE_IDS.length} gate templates, overwrite guard, candidate validation, and zero-social handling.`,
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
};

const parseArguments = () => {
  const options = {
    candidateAttestation: "",
    outputRoot: EXTERNAL_GATE_PROOF_ROOT,
    force: false,
    selfTest: false,
  };
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--force") options.force = true;
    else if (argument === "--candidate-attestation") {
      options.candidateAttestation = process.argv[++index] || "";
    } else if (argument === "--output-root") {
      options.outputRoot = process.argv[++index] || "";
    } else {
      fail(`unknown argument: ${argument}`);
    }
  }
  return options;
};

const main = () => {
  const options = parseArguments();
  if (options.selfTest) {
    if (options.candidateAttestation || options.force) {
      fail("--self-test cannot be combined with candidate or write options.");
    }
    runSelfTest();
    return;
  }
  if (!options.candidateAttestation) {
    fail("--candidate-attestation <file> is required.");
  }
  const repoRoot = process.cwd();
  const outputRoot = path.resolve(repoRoot, options.outputRoot);
  const expectedOutputRoot = path.resolve(repoRoot, EXTERNAL_GATE_PROOF_ROOT);
  if (outputRoot !== expectedOutputRoot) {
    fail(`--output-root must resolve to ${EXTERNAL_GATE_PROOF_ROOT}.`);
  }
  const candidatePath = path.resolve(repoRoot, options.candidateAttestation);
  if (!fs.existsSync(candidatePath) || !fs.statSync(candidatePath).isFile()) {
    fail(`candidate attestation does not exist: ${candidatePath}`);
  }
  const candidate = readJson(candidatePath, "candidate attestation");
  const result = generateTemplates({
    candidate,
    outputRoot,
    force: options.force,
  });
  console.log(
    `Created ${EXTERNAL_GATE_IDS.length} non-passing external evidence templates (${result.fileCount} files) for candidate run ${result.identity.candidateRunId}.`,
  );
  console.log(`Workspace: ${normalized(path.relative(repoRoot, outputRoot))}`);
};

main();
