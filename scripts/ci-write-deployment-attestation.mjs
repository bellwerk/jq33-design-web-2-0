import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  canonicalOrigin,
  negativeRoutes,
  publicRoutes,
  redirectRoutes,
  sourceLeakRoutes,
} from "../tests/helpers/site.mjs";
import { isSha256 } from "./ci-proof-utils.mjs";
import { validateCandidateIntegrations } from "./ci-external-gate-evidence.mjs";

const argumentValue = (name, fallback = "") => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const fail = (message) => {
  console.error(`Deployment attestation failed: ${message}`);
  process.exit(1);
};
const readJson = (filePath, label) => {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    fail(`${label} does not exist: ${resolved}`);
  }
  try {
    return {
      value: JSON.parse(fs.readFileSync(resolved, "utf8")),
      sha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(resolved))
        .digest("hex"),
    };
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
};
const requirePass = (document, label) => {
  if (document.value.result !== "PASS") {
    fail(`${label} is not PASS.`);
  }
};
const validateLegalDocuments = (value, label = "legal documents") => {
  const expected = {
    privacy: { route: "/privacy/", artifactPath: "privacy/index.html" },
    terms: { route: "/terms/", artifactPath: "terms/index.html" },
  };
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(Object.keys(expected).sort())
  ) {
    fail(`${label} must contain exactly privacy and terms.`);
  }
  for (const [name, identity] of Object.entries(expected)) {
    const document = value[name];
    if (
      !document ||
      typeof document !== "object" ||
      Array.isArray(document) ||
      JSON.stringify(Object.keys(document).sort()) !==
        JSON.stringify(["artifactPath", "route", "sha256"]) ||
      document.route !== identity.route ||
      document.artifactPath !== identity.artifactPath ||
      !isSha256(document.sha256)
    ) {
      fail(`${label}.${name} does not bind the exact deployed legal document bytes.`);
    }
  }
  if (value.privacy.sha256 === value.terms.sha256) {
    fail(`${label} privacy and terms hashes must be distinct.`);
  }
};
const hashDirectoryFiles = (directory, predicate) => {
  const files = fs
    .readdirSync(directory)
    .filter(predicate)
    .sort()
    .map((name) => {
      const buffer = fs.readFileSync(path.join(directory, name));
      return {
        name,
        bytes: buffer.length,
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
      };
    });
  return {
    files,
    sha256: crypto
      .createHash("sha256")
      .update(
        files
          .map((file) => `${file.name}\0${file.bytes}\0${file.sha256}\n`)
          .join(""),
      )
      .digest("hex"),
  };
};

const phase = argumentValue("--phase", "");
const outputPath = path.resolve(argumentValue("--output", ""));
if (!["preview", "production"].includes(phase)) {
  fail("--phase must be preview or production.");
}
if (!argumentValue("--output", "")) fail("--output is required.");

if (phase === "preview") {
  const candidate = readJson(
    argumentValue("--candidate-verification", ""),
    "candidate verification",
  );
  const deployment = readJson(
    argumentValue("--deployment", ""),
    "Cloudflare preview deployment",
  );
  const status = readJson(
    argumentValue("--status-matrix", ""),
    "preview status matrix",
  );
  const lighthouseSummary = readJson(
    argumentValue("--lighthouse-summary", ""),
    "preview Lighthouse summary",
  );
  const lighthouseMetadata = readJson(
    argumentValue("--lighthouse-metadata", ""),
    "preview Lighthouse metadata",
  );
  const manualAnalytics = readJson(
    argumentValue("--manual-analytics", ""),
    "source-managed Cloudflare Web Analytics proof",
  );
  requirePass(candidate, "candidate verification");
  requirePass(deployment, "Cloudflare preview deployment");
  requirePass(status, "preview status matrix");
  requirePass(lighthouseSummary, "preview Lighthouse summary");
  requirePass(manualAnalytics, "source-managed Cloudflare Web Analytics proof");
  validateCandidateIntegrations(candidate.value.integrations, fail);
  validateLegalDocuments(candidate.value.legalDocuments, "candidate legalDocuments");
  if (deployment.value.environment !== "preview") {
    fail("Cloudflare deployment is not a preview deployment.");
  }
  if (candidate.value.source.commit !== deployment.value.source.commit) {
    fail("candidate and preview commits differ.");
  }
  const expectedPreviewBranch = `candidate-${candidate.value.source.commit.slice(0, 12)}`;
  if (deployment.value.source.branch !== expectedPreviewBranch) {
    fail(
      `Cloudflare preview branch must be ${expectedPreviewBranch}, derived from the candidate commit.`,
    );
  }
  if (
    !isSha256(candidate.value.source.sourceTreeSha256) ||
    !Number.isSafeInteger(candidate.value.source.sourceInputCount) ||
    candidate.value.source.sourceInputCount < 1 ||
    candidate.value.source.sourceDirty !== false ||
    candidate.value.source.sourceChangeCount !== 0
  ) {
    fail("candidate verification does not bind a clean declared production input tree.");
  }
  const expectedNegativeRoutes = new Set([
    ...negativeRoutes,
    ...sourceLeakRoutes,
    "/_headers",
    "/_redirects",
  ]);
  const statusRecords = Array.isArray(status.value.records)
    ? status.value.records
    : [];
  const recordsOfKind = (kind) =>
    statusRecords.filter((record) => record.kind === kind);
  const publicRecords = recordsOfKind("public-route");
  const negativeRecords = statusRecords.filter((record) =>
    ["source-negative", "unknown-negative"].includes(record.kind),
  );
  const crawlRecords = recordsOfKind("crawl-file");
  const redirectRecords = recordsOfKind("redirect");
  const artifactRecords = recordsOfKind("artifact-file");
  const previewRedirectFinalUrl = new URL("/", deployment.value.url).href;
  const previewRedirectsComplete =
    redirectRecords.filter((record) => record.status === 301).length ===
      redirectRoutes.length &&
    redirectRecords.filter((record) => record.status === 200).length ===
      redirectRoutes.length &&
    redirectRoutes.every((route) =>
      redirectRecords.some((record) => {
        if (
          record.url !== new URL(route, deployment.value.url).href ||
          record.status !== 301 ||
          typeof record.location !== "string"
        ) {
          return false;
        }
        try {
          return new URL(record.location, record.url).href === previewRedirectFinalUrl;
        } catch {
          return false;
        }
      }),
    ) &&
    redirectRecords.filter(
      (record) => record.url === previewRedirectFinalUrl && record.status === 200,
    ).length === redirectRoutes.length;
  if (
    status.value.baseUrl !== deployment.value.url ||
    status.value.productionMode !== false ||
    status.value.productionHostRedirectsChecked !== false ||
    !Array.isArray(status.value.failures) ||
    status.value.failures.length !== 0 ||
    publicRecords.length !== publicRoutes.length ||
    !publicRoutes.every((route) =>
      publicRecords.some(
        (record) =>
          record.route === route &&
          record.status === 200 &&
          isSha256(record.sha256) &&
          record.sha256 === record.expectedSha256,
      ),
    ) ||
    negativeRecords.length !== expectedNegativeRoutes.size ||
    ![...expectedNegativeRoutes].every((route) =>
      negativeRecords.some(
        (record) =>
          record.route === route &&
          record.status === 404 &&
          isSha256(record.sha256) &&
          record.sha256 === record.expectedSha256,
      ),
    ) ||
    crawlRecords.length !== 2 ||
    !["/robots.txt", "/sitemap.xml"].every((route) =>
      crawlRecords.some(
        (record) =>
          record.route === route &&
          record.status === 200 &&
          isSha256(record.sha256) &&
          record.sha256 === record.expectedSha256,
      ),
    ) ||
    redirectRecords.length !== redirectRoutes.length * 2 ||
    !previewRedirectsComplete ||
    artifactRecords.length < 1 ||
    artifactRecords.some(
      (record) =>
        record.status !== 200 ||
        !isSha256(record.sha256) ||
        record.sha256 !== record.expectedSha256,
    )
  ) {
    fail(
      "preview status matrix is not bound to the immutable preview URL, non-production mode, and complete raw route/negative/redirect/crawl/artifact proof.",
    );
  }
  if (
    lighthouseMetadata.value.schemaVersion !== 2 ||
    lighthouseMetadata.value.baseUrl !== deployment.value.url ||
    lighthouseMetadata.value.sourceCommit !== candidate.value.source.commit ||
    lighthouseMetadata.value.artifactSha256 !== candidate.value.artifact.sha256 ||
    lighthouseMetadata.value.artifactManifestSha256 !==
      candidate.value.artifact.manifestSha256 ||
    lighthouseMetadata.value.statusMatrixSha256 !== status.sha256 ||
    lighthouseSummary.value.schemaVersion !== 1 ||
    lighthouseSummary.value.sourceCommit !== candidate.value.source.commit ||
    lighthouseSummary.value.artifactSha256 !== candidate.value.artifact.sha256 ||
    lighthouseSummary.value.artifactManifestSha256 !==
      candidate.value.artifact.manifestSha256
  ) {
    fail(
      "Lighthouse metadata is not bound to the preview deployment, source commit, and artifact.",
    );
  }
  if (
    !Array.isArray(lighthouseMetadata.value.runs) ||
    lighthouseMetadata.value.runs.length !== publicRoutes.length * 3 ||
    lighthouseMetadata.value.runs.some((run) => run.result !== "CAPTURED")
  ) {
    fail("Lighthouse metadata must record exactly three captured runs per route.");
  }
  if (
    !Array.isArray(lighthouseSummary.value.routes) ||
    lighthouseSummary.value.routes.length !== publicRoutes.length ||
    lighthouseSummary.value.routes.some(
      (route) =>
        route.result !== "PASS" || !publicRoutes.includes(route.route),
    ) ||
    !publicRoutes.every((route) =>
      lighthouseSummary.value.routes.some((entry) => entry.route === route),
    )
  ) {
    fail("Lighthouse summary must PASS every public route exactly once.");
  }
  if (
    manualAnalytics.value.scope !== "source-managed-cloudflare-web-analytics" ||
    manualAnalytics.value.automaticHtmlInjectionRequiredState !== "disabled" ||
    manualAnalytics.value.documentCount !== publicRoutes.length + 1 ||
    !Array.isArray(manualAnalytics.value.records) ||
    manualAnalytics.value.records.length !== publicRoutes.length + 1 ||
    manualAnalytics.value.records.some(
      (record) =>
        record.source !== "https://static.cloudflareinsights.com/beacon.min.js" ||
        record.defer !== true ||
        !isSha256(record.tokenSha256),
    ) ||
    new Set(manualAnalytics.value.records.map((record) => record.tokenSha256))
      .size !== 1 ||
    manualAnalytics.value.records[0]?.tokenSha256 !==
      candidate.value.integrations.cloudflareWebAnalytics.tokenSha256 ||
    manualAnalytics.value.documentCount !==
      candidate.value.integrations.cloudflareWebAnalytics.documentCount
  ) {
    fail(
      "manual Cloudflare Web Analytics proof is incomplete, permits edge injection, or does not match the token sealed in dist.",
    );
  }
  const lighthouseDirectory = path.dirname(
    path.resolve(argumentValue("--lighthouse-summary", "")),
  );
  const lighthouseReports = hashDirectoryFiles(
    lighthouseDirectory,
    (name) => name.endsWith(".lhr.json"),
  );
  if (lighthouseReports.files.length !== publicRoutes.length * 3) {
    fail(
      `Lighthouse evidence must contain ${publicRoutes.length * 3} raw LHR files.`,
    );
  }
  const runId = String(argumentValue("--candidate-run-id", ""));
  if (!/^[1-9]\d*$/.test(runId)) fail("--candidate-run-id is required.");
  const attestation = {
    schemaVersion: 1,
    kind: "jq33-preview-candidate",
    createdAt: new Date().toISOString(),
    result: "PASS",
    candidateRunId: runId,
    source: candidate.value.source,
    artifact: candidate.value.artifact,
    integrations: candidate.value.integrations,
    legalDocuments: candidate.value.legalDocuments,
    preview: {
      url: deployment.value.url,
      deploymentId: deployment.value.deploymentId,
      branch: deployment.value.source.branch,
      mode: "deployed-preview",
      productionMode: false,
      statusMatrix: {
        baseUrl: status.value.baseUrl,
        result: status.value.result,
        checkedAt: status.value.checkedAt,
        recordCount: statusRecords.length,
        publicRouteCount: publicRecords.length,
        negativeRouteCount: negativeRecords.length,
        redirectRecordCount: redirectRecords.length,
        crawlFileCount: crawlRecords.length,
        artifactFileCount: artifactRecords.length,
        sha256: status.sha256,
      },
      lighthouse: {
        baseUrl: lighthouseMetadata.value.baseUrl,
        runsPerRoute: 3,
        rawReportCount: lighthouseReports.files.length,
        rawReportsSha256: lighthouseReports.sha256,
        metadataSha256: lighthouseMetadata.sha256,
        summarySha256: lighthouseSummary.sha256,
        statusMatrixSha256: lighthouseMetadata.value.statusMatrixSha256,
      },
      analytics: {
        mode: "source-managed-manual-snippet",
        automaticHtmlInjection: "disabled",
        documentCount: manualAnalytics.value.documentCount,
        proofSha256: manualAnalytics.sha256,
      },
    },
    htmlMutationPolicy: "exact-byte-parity-reject",
    proof: {
      candidateVerificationSha256: candidate.sha256,
      cloudflareDeploymentSha256: deployment.sha256,
      statusMatrixSha256: status.sha256,
      lighthouseMetadataSha256: lighthouseMetadata.sha256,
      lighthouseSummarySha256: lighthouseSummary.sha256,
      lighthouseRawReportsSha256: lighthouseReports.sha256,
      manualCloudflareAnalyticsSha256: manualAnalytics.sha256,
    },
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(attestation, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `Preview candidate attested: ${attestation.artifact.sha256}, deployment ${attestation.preview.deploymentId}.`,
  );
} else {
  const productionRunId = String(argumentValue("--production-run-id", ""));
  if (!/^[1-9]\d*$/.test(productionRunId)) {
    fail("--production-run-id is required for production parity.");
  }
  const candidate = readJson(
    argumentValue("--candidate-attestation", ""),
    "candidate attestation",
  );
  const evidence = readJson(
    argumentValue("--evidence-validation", ""),
    "promotion evidence validation",
  );
  const deployment = readJson(
    argumentValue("--deployment", ""),
    "Cloudflare production deployment",
  );
  const status = readJson(
    argumentValue("--status-matrix", ""),
    "production status matrix",
  );
  const canonical = readJson(
    argumentValue("--canonical-matrix", ""),
    "canonical host matrix",
  );
  const performance = readJson(
    argumentValue("--performance-smoke", ""),
    "production response-latency smoke",
  );
  const browser = readJson(
    argumentValue("--browser-parity", ""),
    "production browser parity",
  );
  requirePass(candidate, "candidate attestation");
  requirePass(evidence, "promotion evidence validation");
  requirePass(deployment, "Cloudflare production deployment");
  requirePass(status, "production status matrix");
  requirePass(canonical, "canonical host matrix");
  requirePass(performance, "production response-latency smoke");
  requirePass(browser, "production browser parity");
  validateCandidateIntegrations(candidate.value.integrations, fail);
  validateCandidateIntegrations(evidence.value.integrations, fail);
  validateLegalDocuments(candidate.value.legalDocuments, "candidate legalDocuments");
  validateLegalDocuments(evidence.value.legalDocuments, "promotion legalDocuments");
  if (candidate.value.kind !== "jq33-preview-candidate") {
    fail("input is not a preview candidate attestation.");
  }
  if (deployment.value.environment !== "production") {
    fail("Cloudflare deployment is not production.");
  }
  if (
    deployment.value.source.commit !== candidate.value.source.commit ||
    evidence.value.source.commit !== candidate.value.source.commit ||
    evidence.value.source.sourceTreeSha256 !==
      candidate.value.source.sourceTreeSha256 ||
    evidence.value.source.sourceDirty !== false ||
    evidence.value.source.sourceChangeCount !== 0 ||
    evidence.value.artifact.sha256 !== candidate.value.artifact.sha256 ||
    JSON.stringify(evidence.value.integrations) !==
      JSON.stringify(candidate.value.integrations) ||
    JSON.stringify(evidence.value.legalDocuments) !==
      JSON.stringify(candidate.value.legalDocuments)
  ) {
    fail("production proof source/artifact binding is inconsistent.");
  }
  const expectedDeferredCriteria = {
    AC2:
      "preview-route-integrity-complete; production-canonical-host-matrix-deferred",
    AC9:
      "preview-seo-and-crawl-complete; production-source-deploy-parity-deferred",
    AC10:
      "preview-lighthouse-budget-complete; production-browser-cwv-input-parity-deferred",
    AC11:
      "preview-security-and-privacy-complete; production-browser-and-effective-header-proof-deferred",
    AC13:
      "candidate-reproducibility-complete; production-promotion-parity-and-final-verifier-deferred",
  };
  if (
    JSON.stringify(evidence.value.deferredProductionCriteria) !==
    JSON.stringify(expectedDeferredCriteria)
  ) {
    fail("promotion evidence does not name the exact production-deferred criteria.");
  }
  if (
    status.value.productionMode !== true ||
    status.value.baseUrl !== canonicalOrigin ||
    status.value.productionHostRedirectsChecked !== true ||
    !Array.isArray(status.value.records) ||
    status.value.records.length === 0
  ) {
    fail(
      "production status matrix does not prove effective canonical production responses.",
    );
  }
  const expectedCanonicalRecords =
    (publicRoutes.length + 2) * 3 + redirectRoutes.length * 3;
  if (
    canonical.value.canonicalOrigin !== canonicalOrigin ||
    !Array.isArray(canonical.value.records) ||
    canonical.value.records.length !== expectedCanonicalRecords
  ) {
    fail("canonical host matrix is incomplete.");
  }
  if (
    performance.value.scope !== "production-performance-parity-smoke" ||
    performance.value.baseUrl !== canonicalOrigin ||
    performance.value.attemptsPerRoute < 3 ||
    !Array.isArray(performance.value.routes) ||
    performance.value.routes.length !== publicRoutes.length ||
    !publicRoutes.every((route) =>
      performance.value.routes.some(
        (entry) =>
          entry.route === route &&
          Number.isFinite(entry.medianResponseMs) &&
          entry.medianResponseMs <= performance.value.maxMedianResponseMs,
      ),
    )
  ) {
    fail("production performance parity smoke is incomplete.");
  }
  if (
    browser.value.scope !== "production-browser-parity" ||
    browser.value.baseUrl !== canonicalOrigin ||
    browser.value.productionMode !== true ||
    browser.value.browserEngine !== "playwright-chromium" ||
    browser.value.runsPerRoute < 3 ||
    !Array.isArray(browser.value.failures) ||
    browser.value.failures.length !== 0 ||
    !Array.isArray(browser.value.routes) ||
    browser.value.routes.length !== publicRoutes.length ||
    !publicRoutes.every((route) =>
      browser.value.routes.some(
        (entry) =>
          entry.route === route &&
          entry.medians &&
          entry.medians.lcpMs > 0 &&
          entry.medians.lcpMs <= browser.value.thresholds?.maxLcpMs &&
          entry.medians.cls <= browser.value.thresholds?.maxCls &&
          entry.medians.longTaskBlockingInputMs <=
            browser.value.thresholds?.maxBlockingInputMs &&
          Array.isArray(entry.runs) &&
          entry.runs.length === browser.value.runsPerRoute &&
          entry.runs.every(
            (run) =>
              !run.navigationError &&
              Array.isArray(run.consoleMessages) &&
              !run.consoleMessages.some((message) =>
                ["error", "assert"].includes(message.type),
              ) &&
              Array.isArray(run.pageErrors) &&
              run.pageErrors.length === 0 &&
              Array.isArray(run.failedRequests) &&
              run.failedRequests.length === 0 &&
              Array.isArray(run.badResponses) &&
              run.badResponses.length === 0 &&
              Array.isArray(run.disallowedThirdPartyRequests) &&
              run.disallowedThirdPartyRequests.length === 0 &&
              Array.isArray(run.preActionProcessorRequests) &&
              run.preActionProcessorRequests.length === 0 &&
              Array.isArray(run.remoteImageOrFontRequests) &&
              run.remoteImageOrFontRequests.length === 0 &&
              Array.isArray(run.supabaseRequests) &&
              run.supabaseRequests.length === 0 &&
              Array.isArray(run.cloudflareAnalyticsScriptRequests) &&
              run.cloudflareAnalyticsScriptRequests.length > 0 &&
              Array.isArray(run.cloudflareRumRequests) &&
              run.cloudflareRumRequests.length > 0,
          ),
      ),
    )
  ) {
    fail(
      "production browser parity is incomplete for console/runtime/network/third-party/privacy, source-managed Cloudflare Web Analytics, and CWV inputs.",
    );
  }
  if (
    candidate.value.preview?.lighthouse?.rawReportCount !==
      publicRoutes.length * 3 ||
    candidate.value.preview?.lighthouse?.runsPerRoute !== 3 ||
    candidate.value.preview?.analytics?.mode !==
      "source-managed-manual-snippet" ||
    candidate.value.preview?.analytics?.automaticHtmlInjection !== "disabled" ||
    candidate.value.preview?.analytics?.documentCount !== publicRoutes.length + 1 ||
    !isSha256(candidate.value.preview?.analytics?.proofSha256)
  ) {
    fail("candidate attestation lacks deployed-preview Lighthouse or manual analytics proof.");
  }
  const deferredCriteriaClosure = {
    AC2: {
      status: "PASS",
      scope: "production-canonical-host-matrix",
      evidenceSha256: canonical.sha256,
    },
    AC9: {
      status: "PASS",
      scope: "production-source-deploy-parity",
      evidenceSha256: status.sha256,
    },
    AC10: {
      status: "PASS",
      scope: "production-browser-cwv-input-parity",
      evidenceSha256: browser.sha256,
      previewLighthouseSummarySha256:
        candidate.value.preview.lighthouse.summarySha256,
      previewLighthouseRawReportsSha256:
        candidate.value.preview.lighthouse.rawReportsSha256,
    },
    AC11: {
      status: "PASS",
      scope: "effective-production-headers-browser-network-and-privacy",
      evidenceSha256: browser.sha256,
      effectiveHeadersSha256: status.sha256,
    },
    AC13: {
      status: "PENDING_FINAL_VERIFIER",
      scope: "production-promotion-and-immutable-parity-complete; fresh-final-verifier-deferred",
      evidenceSha256: status.sha256,
      deploymentEvidenceSha256: deployment.sha256,
    },
  };
  const attestation = {
    schemaVersion: 1,
    kind: "jq33-production-parity",
    createdAt: new Date().toISOString(),
    result: "PRODUCTION_PARITY_PASS_FINALIZATION_REQUIRED",
    candidateRunId: candidate.value.candidateRunId,
    productionRunId,
    source: candidate.value.source,
    artifact: candidate.value.artifact,
    integrations: candidate.value.integrations,
    legalDocuments: candidate.value.legalDocuments,
    preview: candidate.value.preview,
    production: {
      url: "https://jq33.design",
      immutableDeploymentUrl: deployment.value.url,
      deploymentId: deployment.value.deploymentId,
      statusMatrixSha256: status.sha256,
      canonicalHostMatrixSha256: canonical.sha256,
      browserParitySha256: browser.sha256,
      performanceSmokeSha256: performance.sha256,
    },
    htmlMutationPolicy: candidate.value.htmlMutationPolicy,
    deferredCriteriaClosure,
    finalVerifierRequired: true,
    proof: {
      candidateAttestationSha256: candidate.sha256,
      promotionEvidenceValidationSha256: evidence.sha256,
      cloudflareDeploymentSha256: deployment.sha256,
      statusMatrixSha256: status.sha256,
      canonicalHostMatrixSha256: canonical.sha256,
      browserParitySha256: browser.sha256,
      performanceSmokeSha256: performance.sha256,
    },
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(attestation, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `Production byte parity attested for deployment ${attestation.production.deploymentId}; a fresh final verifier is still required.`,
  );
}
