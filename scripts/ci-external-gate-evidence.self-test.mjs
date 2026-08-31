import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  REQUIRED_NVDA_CHECKS,
  externalGateDetailsSha256,
  externalGateDirectory,
  validateExternalGateDetails,
  validateExternalGateProof,
} from "./ci-external-gate-evidence.mjs";
import { TASK_ROOT, sha256 } from "./ci-proof-utils.mjs";

const fail = (message) => {
  throw new Error(message);
};

const integrations = {
  formspree: {
    contactEndpointSha256: "1".repeat(64),
    inquiryEndpointSha256: "2".repeat(64),
  },
  calendly: { eventUrlSha256: "3".repeat(64) },
  social: { publishedProfileCount: 0, profiles: [] },
  cloudflareWebAnalytics: { tokenSha256: "4".repeat(64), documentCount: 15 },
};
const legalDocuments = {
  privacy: {
    route: "/privacy/",
    artifactPath: "privacy/index.html",
    sha256: "5".repeat(64),
  },
  terms: {
    route: "/terms/",
    artifactPath: "terms/index.html",
    sha256: "6".repeat(64),
  },
};
const checkedAt = new Date(Date.now() - 30_000).toISOString();
const previewUrl = "https://a1b2c3d4.jq33.pages.dev/";
const routes = ["/", "/privacy/", "/terms/"];
const common = {
  checkedAt,
  previewUrl,
  requiredZoomRoutes: routes,
  candidateIntegrations: integrations,
  candidateLegalDocuments: legalDocuments,
  fail,
};

const expectFailure = (callback, pattern) => {
  assert.throws(callback, pattern);
};

const spamDetails = {
  accountEvidenceSha256: "7".repeat(64),
  contactEndpointSha256: integrations.formspree.contactEndpointSha256,
  inquiryEndpointSha256: integrations.formspree.inquiryEndpointSha256,
  spamProtectionEnabled: true,
  retentionMonths: 0,
  deletionConfirmed: true,
};
validateExternalGateDetails("formspree-spam-retention", spamDetails, common);
expectFailure(
  () =>
    validateExternalGateDetails(
      "formspree-spam-retention",
      { ...spamDetails, contactEndpointSha256: "8".repeat(64) },
      common,
    ),
  /both Formspree endpoint identities/,
);
expectFailure(
  () =>
    validateExternalGateDetails(
      "formspree-spam-retention",
      { ...spamDetails, retentionMonths: 13 },
      common,
    ),
  /between 0 and 12 months/,
);

const dnsDetails = {
  domain: "jq33.design",
  senderDomain: "mail.jq33.design",
  mxValid: true,
  mxRecordCount: 2,
  spfRecordCount: 1,
  dkimRecordCount: 2,
  dkimSelectors: ["selector1", "selector2"],
  dmarcRecordCount: 1,
  alignmentResult: "PASS",
  resolvers: [
    { name: "1.1.1.1", result: "PASS" },
    { name: "8.8.8.8", result: "PASS" },
  ],
};
validateExternalGateDetails("dns-mx-spf-dkim-dmarc", dnsDetails, common);
expectFailure(
  () =>
    validateExternalGateDetails(
      "dns-mx-spf-dkim-dmarc",
      { ...dnsDetails, senderDomain: "example.com" },
      common,
    ),
  /aligned subdomain/,
);
expectFailure(
  () =>
    validateExternalGateDetails(
      "dns-mx-spf-dkim-dmarc",
      { ...dnsDetails, dkimRecordCount: 1, dkimSelectors: [] },
      common,
    ),
  /identify every valid DKIM record/,
);

validateExternalGateDetails(
  "nvda-windows",
  {
    platform: "Windows",
    screenReader: "NVDA",
    result: "PASS",
    checklist: REQUIRED_NVDA_CHECKS.map((id) => ({ id, status: "PASS" })),
  },
  common,
);

const schemaDetails = {
  schemaValidationResult: "PASS",
  richResultsResult: "PASS",
  blockingErrorCount: 0,
  checks: routes.map((route) => ({
    url: new URL(route, previewUrl).href,
    schemaStatus: "PASS",
    richResultsStatus: "PASS",
    blockingErrorCount: 0,
  })),
};
validateExternalGateDetails("schema-rich-results", schemaDetails, common);
expectFailure(
  () =>
    validateExternalGateDetails(
      "schema-rich-results",
      { ...schemaDetails, checks: schemaDetails.checks.slice(0, -1) },
      common,
    ),
  /exact intended route set/,
);
expectFailure(
  () =>
    validateExternalGateDetails(
      "schema-rich-results",
      {
        ...schemaDetails,
        checks: schemaDetails.checks.map((entry, index) =>
          index === 0 ? { ...entry, url: "https://example.com/" } : entry,
        ),
      },
      common,
    ),
  /not an intended route on the bound preview/,
);

const legalDetails = {
  legalSignoff: "APPROVED",
  signedAt: checkedAt,
  retentionMonths: 12,
  deletionProcessConfirmed: true,
  privacySha256: legalDocuments.privacy.sha256,
  termsSha256: legalDocuments.terms.sha256,
};
validateExternalGateDetails("legal-privacy-retention", legalDetails, common);
expectFailure(
  () =>
    validateExternalGateDetails(
      "legal-privacy-retention",
      { ...legalDetails, termsSha256: "9".repeat(64) },
      common,
    ),
  /exact Privacy and Terms bytes/,
);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jq33-external-gate-"));
try {
  const gateId = "formspree-spam-retention";
  const gateDirectory = externalGateDirectory(gateId);
  const writeJson = (relativePath, value) => {
    const filePath = path.resolve(temporaryRoot, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return { filePath, sha256: sha256(fs.readFileSync(filePath)) };
  };
  fs.mkdirSync(path.resolve(temporaryRoot, TASK_ROOT), { recursive: true });
  const sourceCommit = "a".repeat(40);
  const artifactSha256 = "b".repeat(64);
  const candidateRunId = "123456789";
  const rawValue = {
    schemaVersion: 1,
    gateId,
    capturedAt: checkedAt,
    redacted: true,
    candidateRunId,
    sourceCommit,
    artifactSha256,
    previewUrl,
    detailsSha256: externalGateDetailsSha256(spamDetails),
    observations: {
      accountEvidenceSha256: spamDetails.accountEvidenceSha256,
      contactEndpointSha256: spamDetails.contactEndpointSha256,
      inquiryEndpointSha256: spamDetails.inquiryEndpointSha256,
      providerAccountSettings: "PASS-redacted",
    },
  };
  const rawPath = `${gateDirectory}/raw-capture.json`;
  const raw = writeJson(rawPath, rawValue);
  const proofValue = {
    schemaVersion: 1,
    gateId,
    checkedAt,
    result: "PASS",
    redacted: true,
    candidateRunId,
    sourceCommit,
    artifactSha256,
    previewUrl,
    artifacts: [{ path: rawPath, sha256: raw.sha256, checkedAt }],
    details: spamDetails,
  };
  const proofPath = `${gateDirectory}/evidence.json`;
  const proof = writeJson(proofPath, proofValue);
  const entry = {
    id: gateId,
    status: "PASS",
    evidence: [{ path: proofPath, sha256: proof.sha256, checkedAt }],
  };
  validateExternalGateProof({
    entry,
    repoRoot: temporaryRoot,
    referenceTime: new Date().toISOString(),
    candidateRunId,
    sourceCommit,
    artifactSha256,
    previewUrl,
    requiredZoomRoutes: routes,
    candidateIntegrations: integrations,
    candidateLegalDocuments: legalDocuments,
    fail,
  });

  const mismatchRawPath = rawPath;
  const mismatchRaw = writeJson(mismatchRawPath, {
    ...rawValue,
    detailsSha256: "c".repeat(64),
  });
  const mismatchProofPath = proofPath;
  const mismatchProof = writeJson(mismatchProofPath, {
    ...proofValue,
    artifacts: [
      { path: mismatchRawPath, sha256: mismatchRaw.sha256, checkedAt },
    ],
  });
  expectFailure(
    () =>
      validateExternalGateProof({
        entry: {
          id: gateId,
          status: "PASS",
          evidence: [
            { path: mismatchProofPath, sha256: mismatchProof.sha256, checkedAt },
          ],
        },
        repoRoot: temporaryRoot,
        referenceTime: new Date().toISOString(),
        candidateRunId,
        sourceCommit,
        artifactSha256,
        previewUrl,
        requiredZoomRoutes: routes,
        candidateIntegrations: integrations,
        candidateLegalDocuments: legalDocuments,
        fail,
      }),
    /detailsSha256 must bind/,
  );
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log(
  "External gate evidence self-test passed: endpoint/account, retention, DNS/DKIM, NVDA, exact-route schema, legal-byte, and raw-capture bindings enforce positive and negative cases.",
);
