import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  canonicalOrigin,
  negativeRoutes,
  publicRoutes,
  redirectRoutes,
  routeToRelativeHtml,
  sourceLeakRoutes,
} from "../tests/helpers/site.mjs";
import { TASK_ID, TASK_ROOT, WORKFLOW_PATH } from "./ci-proof-utils.mjs";
import { RESOLVED_PROBLEMS_TEXT } from "./render-task-evidence.mjs";
import {
  EXTERNAL_GATE_IDS,
  REQUIRED_NVDA_CHECKS,
  REQUIRED_PRIVACY_FLOWS,
  REQUIRED_PRIVACY_PROCESSORS,
  REQUIRED_ZOOM_TEMPLATES,
  externalGateDetailsSha256,
  externalGateDirectory,
} from "./ci-external-gate-evidence.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jq33-ci-promotion-"));
const commit = "0123456789abcdef0123456789abcdef01234567";
const lockfileSha256 = "1".repeat(64);
const artifactSha256 = "2".repeat(64);
const sourceTreeSha256 = "8".repeat(64);
const sourceIdentity = {
  commit,
  ref: "refs/heads/main",
  lockfileSha256,
  sourceTreeSha256,
  sourceInputCount: 64,
  sourceDirty: false,
  sourceChangeCount: 0,
};
const previewUrl = "https://abcdef12.jq33.pages.dev";
const previewDeploymentId = "11111111-2222-3333-4444-555555555555";
const productionDeploymentId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const candidateRunId = "123456789";
const productionRunId = "123456999";
const workflowId = 987654;
const now = Date.now();
const iso = (offsetMs = 0) => new Date(now + offsetMs).toISOString();

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const formspreeContactUrl = "https://formspree.io/f/jq33-contact-fixture";
const formspreeInquiryUrl = "https://formspree.io/f/jq33-inquiry-fixture";
const calendlyEventUrl = "https://calendly.com/jq33-design/qa-consultation";
const cloudflareAnalyticsToken = "0123456789abcdef0123456789abcdef";
const publishedSocialProfiles = [
  { platform: "facebook", url: "https://www.facebook.com/jq33design/" },
  { platform: "instagram", url: "https://www.instagram.com/jq33design/" },
];
const socialIntegrationIdentity = publishedSocialProfiles
  .map(({ platform, url }) => ({
    platform,
    urlSha256: sha256(new URL(url).href),
  }))
  .sort(
    (left, right) =>
      left.platform.localeCompare(right.platform) ||
      left.urlSha256.localeCompare(right.urlSha256),
  );
const sealedIntegrations = {
  formspree: {
    contactEndpointSha256: sha256(new URL(formspreeContactUrl).href),
    inquiryEndpointSha256: sha256(new URL(formspreeInquiryUrl).href),
  },
  calendly: {
    eventUrlSha256: sha256(new URL(calendlyEventUrl).href),
  },
  social: {
    publishedProfileCount: socialIntegrationIdentity.length,
    profiles: socialIntegrationIdentity,
  },
  cloudflareWebAnalytics: {
    tokenSha256: sha256(cloudflareAnalyticsToken),
    documentCount: publicRoutes.length + 1,
  },
};
const sealedLegalDocuments = {
  privacy: {
    route: "/privacy/",
    artifactPath: "privacy/index.html",
    sha256: sha256("sealed privacy document bytes"),
  },
  terms: {
    route: "/terms/",
    artifactPath: "terms/index.html",
    sha256: sha256("sealed terms document bytes"),
  },
};
const writeBytes = (relativePath, value) => {
  const target = path.join(temporaryRoot, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
  return target;
};
const writeJson = (relativePath, value) =>
  writeBytes(relativePath, `${JSON.stringify(value, null, 2)}\n`);
const proof = (relativeName, value, checkedAt = iso(-60_000)) => {
  const relativePath = `${TASK_ROOT}/raw/fixture/${relativeName}`;
  const target = writeJson(relativePath, value);
  return {
    path: relativePath,
    sha256: sha256(fs.readFileSync(target)),
    checkedAt,
  };
};
const run = (script, args, { shouldFail = false, env = {} } = {}) => {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (shouldFail ? result.status === 0 : result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(
      `${script} ${shouldFail ? "unexpectedly passed" : "failed"} (exit ${result.status}).`,
    );
  }
  return result;
};
const mutateAndWrite = (relativePath, source, mutate) => {
  const clone = structuredClone(source);
  mutate(clone);
  return writeJson(relativePath, clone);
};

try {
  fs.mkdirSync(path.join(temporaryRoot, ...TASK_ROOT.split("/")), { recursive: true });
  writeBytes(`${TASK_ROOT}/problems.md`, RESOLVED_PROBLEMS_TEXT);

  // Keep the production-only HTTP contracts covered even when the full remote
  // checks cannot run in candidate CI. Their fixtures exercise the exact
  // threshold boundaries and redirect-query preservation semantics.
  run("ci-check-production-browser-parity.mjs", ["--self-test"]);
  run("ci-check-canonical-hosts.mjs", ["--self-test"]);

  const analyticsDist = path.join(temporaryRoot, "analytics-dist");
  const analyticsTag =
    `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${cloudflareAnalyticsToken}"}'></script>`;
  for (const route of publicRoutes) {
    writeBytes(
      `analytics-dist/${routeToRelativeHtml(route)}`,
      `<!doctype html><html><head>${analyticsTag}</head><body></body></html>`,
    );
  }
  writeBytes(
    "analytics-dist/404.html",
    `<!doctype html><html><head>${analyticsTag}</head><body></body></html>`,
  );
  run("ci-check-manual-cloudflare-analytics.mjs", [
    "--root", analyticsDist,
    "--output", path.join(temporaryRoot, "manual-cloudflare-analytics.json"),
  ]);
  writeBytes(
    `analytics-dist/${routeToRelativeHtml(publicRoutes[0])}`,
    "<!doctype html><html><head></head><body></body></html>",
  );
  run(
    "ci-check-manual-cloudflare-analytics.mjs",
    [
      "--root", analyticsDist,
      "--output", path.join(temporaryRoot, "must-not-exist-manual-analytics.json"),
    ],
    { shouldFail: true },
  );

  const miniPrivacyHtml = `<!doctype html><html><head>${analyticsTag}</head><body>Privacy</body></html>`;
  const miniTermsHtml = `<!doctype html><html><head>${analyticsTag}</head><body>Terms</body></html>`;
  const miniDistFiles = [
    [
      "index.html",
      `<!doctype html><html><head>${analyticsTag}</head><body><a data-calendly-cta href="${calendlyEventUrl}">Book</a></body></html>`,
    ],
    [
      "contact/index.html",
      `<!doctype html><html><head>${analyticsTag}</head><body><form data-lead-form="contact" method="post" action="${formspreeContactUrl}"></form></body></html>`,
    ],
    [
      "inquiry/index.html",
      `<!doctype html><html><head>${analyticsTag}</head><body><form data-lead-form="inquiry" method="post" action="${formspreeInquiryUrl}"></form></body></html>`,
    ],
    ["privacy/index.html", miniPrivacyHtml],
    ["terms/index.html", miniTermsHtml],
    [
      "assets/js/components/footer.js",
      `const profiles = ${JSON.stringify(
        publishedSocialProfiles.map(({ platform, url }) => ({
          network: platform,
          url,
        })),
      )};\n`,
    ],
  ].map(([relativePath, bytes]) => {
    const file = writeBytes(`mini-candidate/dist/${relativePath}`, bytes);
    const buffer = fs.readFileSync(file);
    return {
      path: relativePath,
      bytes: buffer.length,
      sha256: sha256(buffer),
    };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const miniArtifactSha256 = sha256(
    miniDistFiles
      .map((record) => `${record.path}\0${record.bytes}\0${record.sha256}\n`)
      .join(""),
  );
  const miniLockfile = writeBytes("mini-candidate/pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  const miniManifestValue = {
    schemaVersion: 2,
    generatedAt: iso(-1000),
    sourceRevision: commit,
    sourceTreeSha256,
    sourceInputCount: 64,
    sourceDirty: false,
    sourceChangeCount: 0,
    root: "dist",
    artifactSha256: miniArtifactSha256,
    files: miniDistFiles,
  };
  const miniManifest = writeJson("mini-candidate/dist-manifest.json", miniManifestValue);
  const miniCandidateArguments = [
    "--dist", path.join(temporaryRoot, "mini-candidate/dist"),
    "--manifest", miniManifest,
    "--lockfile", miniLockfile,
    "--expected-artifact", miniArtifactSha256,
    "--expected-commit", commit,
    "--expected-ref", "refs/heads/main",
    "--require-main",
    "--expected-lockfile", sha256(fs.readFileSync(miniLockfile)),
    "--output", path.join(temporaryRoot, "mini-candidate-verification.json"),
  ];
  run("ci-verify-candidate.mjs", miniCandidateArguments);
  const miniVerification = JSON.parse(
    fs.readFileSync(path.join(temporaryRoot, "mini-candidate-verification.json"), "utf8"),
  );
  const expectedMiniIntegrations = structuredClone(sealedIntegrations);
  expectedMiniIntegrations.cloudflareWebAnalytics.documentCount = 5;
  if (
    JSON.stringify(miniVerification.integrations) !==
    JSON.stringify(expectedMiniIntegrations)
  ) {
    throw new Error("candidate verifier did not derive the expected sealed integration identity.");
  }
  const expectedMiniLegalDocuments = {
    privacy: {
      route: "/privacy/",
      artifactPath: "privacy/index.html",
      sha256: sha256(miniPrivacyHtml),
    },
    terms: {
      route: "/terms/",
      artifactPath: "terms/index.html",
      sha256: sha256(miniTermsHtml),
    },
  };
  if (
    JSON.stringify(miniVerification.legalDocuments) !==
    JSON.stringify(expectedMiniLegalDocuments)
  ) {
    throw new Error("candidate verifier did not derive the exact legal document identities.");
  }
  const dirtyMiniManifest = mutateAndWrite(
    "mini-candidate/dirty-dist-manifest.json",
    miniManifestValue,
    (value) => {
      value.sourceDirty = true;
      value.sourceChangeCount = 1;
    },
  );
  run(
    "ci-verify-candidate.mjs",
    miniCandidateArguments.map((value, index, values) =>
      values[index - 1] === "--manifest"
        ? dirtyMiniManifest
        : values[index - 1] === "--output"
          ? path.join(temporaryRoot, "must-not-exist-dirty-candidate.json")
          : value,
    ),
    { shouldFail: true },
  );

  const workflowFixture = writeJson("workflow.json", {
    id: workflowId,
    name: "Production readiness",
    path: WORKFLOW_PATH,
    state: "active",
  });
  const runFixtureValue = {
    id: Number(candidateRunId),
    status: "completed",
    conclusion: "success",
    head_sha: commit,
    head_branch: "main",
    event: "push",
    name: "Production readiness",
    workflow_id: workflowId,
    path: WORKFLOW_PATH,
    html_url: `https://github.com/example/jq33/actions/runs/${candidateRunId}`,
    repository: { full_name: "example/jq33" },
  };
  const runFixture = writeJson("candidate-run.json", runFixtureValue);
  run("ci-validate-candidate-run.mjs", [
    "--fixture", runFixture,
    "--workflow-fixture", workflowFixture,
    "--run-id", candidateRunId,
    "--commit", commit,
    "--repository", "example/jq33",
    "--workflow-path", WORKFLOW_PATH,
    "--output", path.join(temporaryRoot, "candidate-run-validation.json"),
  ]);
  const wrongWorkflowRun = mutateAndWrite("wrong-workflow-run.json", runFixtureValue, (value) => {
    value.workflow_id += 1;
  });
  run(
    "ci-validate-candidate-run.mjs",
    [
      "--fixture", wrongWorkflowRun,
      "--workflow-fixture", workflowFixture,
      "--run-id", candidateRunId,
      "--commit", commit,
      "--repository", "example/jq33",
      "--output", path.join(temporaryRoot, "must-not-exist-run.json"),
    ],
    { shouldFail: true },
  );

  const cloudflareFixtureValue = {
    success: true,
    result: [
      {
        id: previewDeploymentId,
        url: previewUrl,
        environment: "preview",
        project_name: "jq33",
        created_on: iso(-600_000),
        latest_stage: { name: "deploy", status: "success", ended_on: iso(-590_000) },
        deployment_trigger: {
          metadata: { branch: `candidate-${commit.slice(0, 12)}`, commit_hash: commit },
        },
      },
    ],
  };
  const cloudflareFixture = writeJson("cloudflare.json", cloudflareFixtureValue);
  const deploymentPath = path.join(temporaryRoot, "deployment.json");
  run(
    "ci-resolve-cloudflare-deployment.mjs",
    [
      "--fixture", cloudflareFixture,
      "--commit", commit,
      "--branch", `candidate-${commit.slice(0, 12)}`,
      "--environment", "preview",
      "--expected-url", previewUrl,
      "--output", deploymentPath,
    ],
    { env: { GITHUB_OUTPUT: path.join(temporaryRoot, "cloudflare-output.txt") } },
  );
  const pendingCloudflare = mutateAndWrite("cloudflare-pending.json", cloudflareFixtureValue, (value) => {
    value.result[0].latest_stage = { name: "deploy", status: "active", ended_on: null };
  });
  run(
    "ci-resolve-cloudflare-deployment.mjs",
    [
      "--fixture", pendingCloudflare,
      "--commit", commit,
      "--branch", `candidate-${commit.slice(0, 12)}`,
      "--environment", "preview",
      "--expected-url", previewUrl,
      "--output", path.join(temporaryRoot, "must-not-exist-deployment.json"),
    ],
    { shouldFail: true },
  );

  const candidateVerification = writeJson("candidate-verification.json", {
    schemaVersion: 1,
    checkedAt: iso(-500_000),
    result: "PASS",
    source: sourceIdentity,
    artifact: { sha256: artifactSha256, manifestSha256: "3".repeat(64), fileCount: 89 },
    integrations: sealedIntegrations,
    legalDocuments: sealedLegalDocuments,
  });
  const statusRecords = [
    ...publicRoutes.map((route) => ({
      kind: "public-route", route, status: 200, expectedSha256: "4".repeat(64), sha256: "4".repeat(64),
    })),
    ...[...negativeRoutes, ...sourceLeakRoutes, "/_headers", "/_redirects"].map((route) => ({
      kind: sourceLeakRoutes.includes(route) ? "source-negative" : "unknown-negative",
      route, status: 404, expectedSha256: "5".repeat(64), sha256: "5".repeat(64),
    })),
    ...redirectRoutes.flatMap((route) => [
      {
        kind: "redirect",
        url: new URL(route, previewUrl).href,
        status: 301,
        location: new URL("/", previewUrl).href,
      },
      {
        kind: "redirect",
        url: new URL("/", previewUrl).href,
        status: 200,
        location: "",
      },
    ]),
    ...["/robots.txt", "/sitemap.xml"].map((route) => ({
      kind: "crawl-file", route, status: 200, expectedSha256: "6".repeat(64), sha256: "6".repeat(64),
    })),
    { kind: "artifact-file", route: "/assets/site.css", status: 200, expectedSha256: "7".repeat(64), sha256: "7".repeat(64) },
  ];
  const previewStatus = writeJson("preview-status.json", {
    schemaVersion: 1,
    checkedAt: iso(-400_000),
    result: "PASS",
    baseUrl: previewUrl,
    productionMode: false,
    productionHostRedirectsChecked: false,
    failures: [],
    records: statusRecords,
  });
  const lighthouseDirectory = path.join(temporaryRoot, "lighthouse");
  fs.mkdirSync(lighthouseDirectory, { recursive: true });
  const lighthouseRuns = [];
  for (const [routeIndex, route] of publicRoutes.entries()) {
    for (let runIndex = 1; runIndex <= 3; runIndex += 1) {
      const filename = `route-${routeIndex + 1}-run-${runIndex}.lhr.json`;
      writeJson(`lighthouse/${filename}`, {
        requestedUrl: new URL(route, previewUrl).href,
        finalUrl: new URL(route, previewUrl).href,
        categories: {},
        audits: {},
      });
      lighthouseRuns.push({ route, run: runIndex, filename, result: "CAPTURED" });
    }
  }
  const lighthouseMetadata = writeJson("lighthouse/run-metadata.json", {
    schemaVersion: 2,
    startedAt: iso(-360_000),
    finishedAt: iso(-300_000),
    baseUrl: previewUrl,
    sourceCommit: commit,
    artifactSha256,
    artifactManifestSha256: "3".repeat(64),
    statusMatrixSha256: sha256(fs.readFileSync(previewStatus)),
    runs: lighthouseRuns,
  });
  const lighthouseSummary = writeJson("lighthouse/summary.json", {
    schemaVersion: 1,
    summarizedAt: iso(-290_000),
    result: "PASS",
    baseUrl: previewUrl,
    sourceCommit: commit,
    artifactSha256,
    artifactManifestSha256: "3".repeat(64),
    routes: publicRoutes.map((route) => ({ route, result: "PASS" })),
  });
  const candidateAttestation = path.join(temporaryRoot, "candidate-attestation.json");
  const manualAnalyticsProof = path.join(temporaryRoot, "manual-cloudflare-analytics.json");
  run("ci-write-deployment-attestation.mjs", [
    "--phase", "preview",
    "--candidate-run-id", candidateRunId,
    "--candidate-verification", candidateVerification,
    "--deployment", deploymentPath,
    "--status-matrix", previewStatus,
    "--lighthouse-summary", lighthouseSummary,
    "--lighthouse-metadata", lighthouseMetadata,
    "--manual-analytics", manualAnalyticsProof,
    "--output", candidateAttestation,
  ]);
  const candidateAttestationValue = JSON.parse(
    fs.readFileSync(candidateAttestation, "utf8"),
  );
  const inRepoCandidateAttestationPath =
    `${TASK_ROOT}/raw/deployed-preview/candidate-attestation.json`;
  const inRepoCandidateAttestation = writeBytes(
    inRepoCandidateAttestationPath,
    fs.readFileSync(candidateAttestation),
  );
  const candidateAttestationReference = {
    path: inRepoCandidateAttestationPath,
    sha256: sha256(fs.readFileSync(inRepoCandidateAttestation)),
    checkedAt: candidateAttestationValue.createdAt,
  };
  const wrongBranchDeployment = mutateAndWrite(
    "wrong-branch-deployment.json",
    JSON.parse(fs.readFileSync(deploymentPath, "utf8")),
    (value) => {
      value.source.branch = "main";
    },
  );
  run(
    "ci-write-deployment-attestation.mjs",
    [
      "--phase", "preview",
      "--candidate-run-id", candidateRunId,
      "--candidate-verification", candidateVerification,
      "--deployment", wrongBranchDeployment,
      "--status-matrix", previewStatus,
      "--lighthouse-summary", lighthouseSummary,
      "--lighthouse-metadata", lighthouseMetadata,
      "--manual-analytics", manualAnalyticsProof,
      "--output", path.join(temporaryRoot, "must-not-exist-wrong-branch-attestation.json"),
    ],
    { shouldFail: true },
  );
  const wrongLighthouseManifest = mutateAndWrite(
    "lighthouse/wrong-manifest-metadata.json",
    JSON.parse(fs.readFileSync(lighthouseMetadata, "utf8")),
    (value) => {
      value.artifactManifestSha256 = "f".repeat(64);
    },
  );
  run(
    "ci-write-deployment-attestation.mjs",
    [
      "--phase", "preview",
      "--candidate-run-id", candidateRunId,
      "--candidate-verification", candidateVerification,
      "--deployment", deploymentPath,
      "--status-matrix", previewStatus,
      "--lighthouse-summary", lighthouseSummary,
      "--lighthouse-metadata", wrongLighthouseManifest,
      "--manual-analytics", manualAnalyticsProof,
      "--output", path.join(temporaryRoot, "must-not-exist-lighthouse-binding.json"),
    ],
    { shouldFail: true },
  );
  const wrongLighthouseStatusMatrix = mutateAndWrite(
    "lighthouse/wrong-status-matrix-metadata.json",
    JSON.parse(fs.readFileSync(lighthouseMetadata, "utf8")),
    (value) => {
      value.statusMatrixSha256 = "e".repeat(64);
    },
  );
  run(
    "ci-write-deployment-attestation.mjs",
    [
      "--phase", "preview",
      "--candidate-run-id", candidateRunId,
      "--candidate-verification", candidateVerification,
      "--deployment", deploymentPath,
      "--status-matrix", previewStatus,
      "--lighthouse-summary", lighthouseSummary,
      "--lighthouse-metadata", wrongLighthouseStatusMatrix,
      "--manual-analytics", manualAnalyticsProof,
      "--output", path.join(temporaryRoot, "must-not-exist-lighthouse-status-binding.json"),
    ],
    { shouldFail: true },
  );

  const expectedStatuses = Object.fromEntries(
    Array.from({ length: 13 }, (_, index) => {
      const id = `AC${index + 1}`;
      return [id, ["AC2", "AC9", "AC10", "AC11", "AC13"].includes(id) ? "PRE_PROMOTION_PASS" : "PASS"];
    }),
  );
  const verdictReference = proof("verdict.json", {
    task_id: TASK_ID,
    overall_verdict: "PRE_PROMOTION_PASS",
    verified_at: iso(-60_000),
    candidate_run_id: candidateRunId,
    source_commit: commit,
    source_tree_sha256: sourceTreeSha256,
    artifact_sha256: artifactSha256,
    criteria: Object.entries(expectedStatuses).map(([id, status]) => ({ id, status, reason: "fixture" })),
  });
  const sharedProof = proof("redacted-proof.json", {
    schemaVersion: 1,
    checkedAt: iso(-60_000),
    result: "PASS",
    note: "real hashed fixture file",
  });
  const externalGateDetails = {
    "formspree-contact-delivery": {
      form: "contact",
      requestCount: 1,
      providerAcceptanceCount: 1,
      inboxReceiptCount: 1,
      duplicateCount: 0,
      endpointSha256: sealedIntegrations.formspree.contactEndpointSha256,
      tagSha256: "b".repeat(64),
      submissionSha256: "c".repeat(64),
    },
    "formspree-inquiry-delivery": {
      form: "inquiry",
      requestCount: 1,
      providerAcceptanceCount: 1,
      inboxReceiptCount: 1,
      duplicateCount: 0,
      endpointSha256: sealedIntegrations.formspree.inquiryEndpointSha256,
      tagSha256: "e".repeat(64),
      submissionSha256: "f".repeat(64),
    },
    "formspree-spam-retention": {
      accountEvidenceSha256: sha256("redacted Formspree account settings"),
      contactEndpointSha256: sealedIntegrations.formspree.contactEndpointSha256,
      inquiryEndpointSha256: sealedIntegrations.formspree.inquiryEndpointSha256,
      spamProtectionEnabled: true,
      retentionMonths: 12,
      deletionConfirmed: true,
    },
    "calendly-booking-cancel": {
      eventUrl: calendlyEventUrl,
      eventUrlSha256: sealedIntegrations.calendly.eventUrlSha256,
      published: true,
      bookingCount: 1,
      inviteCount: 1,
      cancellationCount: 1,
      extraCount: 0,
    },
    "social-profile-ownership": {
      userConfirmed: true,
      publishedProfileCount: publishedSocialProfiles.length,
      profiles: publishedSocialProfiles.map(({ platform, url }) => ({
        platform,
        url,
        confirmed: true,
      })),
    },
    "cloudflare-pages-web-analytics": {
      sourceMode: "source-manual",
      automaticInjection: "disabled",
      tokenSha256: sealedIntegrations.cloudflareWebAnalytics.tokenSha256,
      dashboardPageView: {
        url: `${previewUrl}/contact/`,
        observedAt: iso(-120_000),
        count: 1,
      },
    },
    "dns-mx-spf-dkim-dmarc": {
      domain: "jq33.design",
      senderDomain: "jq33.design",
      mxValid: true,
      mxRecordCount: 2,
      spfRecordCount: 1,
      dkimRecordCount: 1,
      dkimSelectors: ["selector1"],
      dmarcRecordCount: 1,
      alignmentResult: "PASS",
      resolvers: [
        { name: "1.1.1.1", result: "PASS" },
        { name: "8.8.8.8", result: "PASS" },
      ],
    },
    "google-search-console": {
      property: "jq33.design",
      propertyType: "DOMAIN",
      ownershipVerified: true,
      sitemap: {
        url: "https://jq33.design/sitemap.xml",
        status: "ACCEPTED",
        fetchable: true,
      },
    },
    "nvda-windows": {
      platform: "Windows",
      screenReader: "NVDA",
      result: "PASS",
      checklist: REQUIRED_NVDA_CHECKS.map((id) => ({ id, status: "PASS" })),
    },
    "legal-privacy-retention": {
      legalSignoff: "APPROVED",
      signedAt: iso(-24 * 60 * 60 * 1000),
      retentionMonths: 12,
      deletionProcessConfirmed: true,
      privacySha256: sealedLegalDocuments.privacy.sha256,
      termsSha256: sealedLegalDocuments.terms.sha256,
    },
    "browser-zoom-200": {
      zoomPercent: 200,
      result: "PASS",
      routeChecklist: publicRoutes.map((route) => ({ route, status: "PASS" })),
      templateChecklist: REQUIRED_ZOOM_TEMPLATES.map((template) => ({
        template,
        status: "PASS",
      })),
    },
    "schema-rich-results": {
      schemaValidationResult: "PASS",
      richResultsResult: "PASS",
      blockingErrorCount: 0,
      checks: publicRoutes.map((route) => ({
        url: new URL(route, `${previewUrl}/`).href,
        schemaStatus: "PASS",
        richResultsStatus: "PASS",
        blockingErrorCount: 0,
      })),
    },
    "operational-privacy": {
      processors: REQUIRED_PRIVACY_PROCESSORS.map((name) => ({ name, status: "PASS" })),
      dataFlows: REQUIRED_PRIVACY_FLOWS.map((id) => ({ id, status: "PASS" })),
      retentionMonths: 12,
      deletionProcessConfirmed: true,
    },
  };
  const externalGateProofs = new Map();
  const createExternalGateProof = (gateId) => {
    const checkedAt = iso(-60_000);
    const directory = externalGateDirectory(gateId);
    const details = externalGateDetails[gateId];
    const observations = (() => {
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
            previewOrigin: new URL(previewUrl).origin,
            checkedRouteCount: details.checks.length,
          };
        default:
          return { verificationStatus: "PASS" };
      }
    })();
    const artifactPath = `${directory}/raw-capture.json`;
    const artifactFile = writeJson(artifactPath, {
      schemaVersion: 1,
      gateId,
      capturedAt: checkedAt,
      redacted: true,
      candidateRunId,
      sourceCommit: commit,
      artifactSha256,
      previewUrl,
      detailsSha256: externalGateDetailsSha256(details),
      observations,
    });
    const value = {
      schemaVersion: 1,
      gateId,
      checkedAt,
      result: "PASS",
      redacted: true,
      candidateRunId,
      sourceCommit: commit,
      artifactSha256,
      previewUrl,
      artifacts: [
        {
          path: artifactPath,
          sha256: sha256(fs.readFileSync(artifactFile)),
          checkedAt,
        },
      ],
      details,
    };
    const proofPath = `${directory}/evidence.json`;
    const proofFile = writeJson(proofPath, value);
    const reference = {
      path: proofPath,
      sha256: sha256(fs.readFileSync(proofFile)),
      checkedAt,
    };
    externalGateProofs.set(gateId, { value, reference });
    return { id: gateId, status: "PASS", evidence: [reference] };
  };
  const replaceExternalGateProof = (evidenceValue, gateId, filename, mutate) => {
    const fixture = externalGateProofs.get(gateId);
    const value = structuredClone(fixture.value);
    mutate(value);
    const proofPath = `${externalGateDirectory(gateId)}/${filename}`;
    const proofFile = writeJson(proofPath, value);
    const gate = evidenceValue.externalGates.find((entry) => entry.id === gateId);
    gate.evidence = [
      {
        path: proofPath,
        sha256: sha256(fs.readFileSync(proofFile)),
        checkedAt: value.checkedAt,
      },
    ];
  };
  const deferredScopes = {
    AC2: "preview-route-integrity-complete; production-canonical-host-matrix-deferred",
    AC9: "preview-seo-and-crawl-complete; production-source-deploy-parity-deferred",
    AC10: "preview-lighthouse-budget-complete; production-browser-cwv-input-parity-deferred",
    AC11: "preview-security-and-privacy-complete; production-browser-and-effective-header-proof-deferred",
    AC13: "candidate-reproducibility-complete; production-promotion-parity-and-final-verifier-deferred",
  };
  const evidence = {
    schemaVersion: 1,
    taskId: TASK_ID,
    scope: "pre-promotion",
    generatedAt: iso(),
    candidateRunId,
    source: sourceIdentity,
    artifact: { sha256: artifactSha256 },
    preview: {
      url: previewUrl,
      deploymentId: previewDeploymentId,
      status: "PASS",
      evidence: [candidateAttestationReference],
    },
    verifier: { verdict: "PRE_PROMOTION_PASS", verifiedAt: verdictReference.checkedAt, evidence: [verdictReference] },
    criteria: Array.from({ length: 13 }, (_, index) => {
      const id = `AC${index + 1}`;
      return { id, status: expectedStatuses[id], scope: deferredScopes[id] || "complete", evidence: [sharedProof] };
    }),
    externalGates: EXTERNAL_GATE_IDS.map(createExternalGateProof),
  };
  const evidencePath = writeJson(`${TASK_ROOT}/evidence.json`, evidence);
  const evidenceSha = sha256(fs.readFileSync(evidencePath));
  const validationPath = path.join(temporaryRoot, "promotion-evidence-validation.json");
  const promotionArgs = [
    "--repo-root", temporaryRoot,
    "--evidence", evidencePath,
    "--candidate-attestation", candidateAttestation,
    "--expected-evidence-sha256", evidenceSha,
    "--expected-candidate-run-id", candidateRunId,
    "--output", validationPath,
  ];
  run("ci-validate-promotion-evidence.mjs", promotionArgs);
  const unresolvedProblemsPath = writeBytes(
    `${TASK_ROOT}/problems.md`,
    "# Unresolved blocker\n\nThis must prevent promotion.\n",
  );
  run(
    "ci-validate-promotion-evidence.mjs",
    promotionArgs.map((value, index, values) =>
      values[index - 1] === "--output"
        ? path.join(temporaryRoot, "must-not-exist-problems-validation.json")
        : value,
    ),
    { shouldFail: true },
  );
  fs.writeFileSync(unresolvedProblemsPath, RESOLVED_PROBLEMS_TEXT, "utf8");

  const runPromotionFailure = (fixtureName, evidenceValue) => {
    const fixturePath = writeJson(`${TASK_ROOT}/${fixtureName}-evidence.json`, evidenceValue);
    run(
      "ci-validate-promotion-evidence.mjs",
      [
        "--repo-root", temporaryRoot,
        "--evidence", fixturePath,
        "--candidate-attestation", candidateAttestation,
        "--expected-evidence-sha256", sha256(fs.readFileSync(fixturePath)),
        "--expected-candidate-run-id", candidateRunId,
        "--output", path.join(temporaryRoot, `must-not-exist-${fixtureName}.json`),
      ],
      { shouldFail: true },
    );
  };

  const genericSharedEvidence = structuredClone(evidence);
  genericSharedEvidence.externalGates[0].evidence = [sharedProof];
  runPromotionFailure("generic-shared-external-proof", genericSharedEvidence);

  const missingGateEvidence = structuredClone(evidence);
  missingGateEvidence.externalGates = missingGateEvidence.externalGates.filter(
    (entry) => entry.id !== "operational-privacy",
  );
  runPromotionFailure("missing-external-gate", missingGateEvidence);

  const mismatchedCandidateEvidence = structuredClone(evidence);
  replaceExternalGateProof(
    mismatchedCandidateEvidence,
    "social-profile-ownership",
    "mismatched-candidate.json",
    (value) => {
      value.candidateRunId = "987654321";
    },
  );
  runPromotionFailure("mismatched-external-candidate", mismatchedCandidateEvidence);

  const unredactedExternalEvidence = structuredClone(evidence);
  replaceExternalGateProof(
    unredactedExternalEvidence,
    "google-search-console",
    "unredacted.json",
    (value) => {
      value.redacted = false;
    },
  );
  runPromotionFailure("unredacted-external-proof", unredactedExternalEvidence);

  const malformedGateEvidence = structuredClone(evidence);
  replaceExternalGateProof(
    malformedGateEvidence,
    "calendly-booking-cancel",
    "malformed-details.json",
    (value) => {
      value.details.bookingCount = 2;
    },
  );
  runPromotionFailure("malformed-external-details", malformedGateEvidence);

  const mismatchedFormspreeEvidence = structuredClone(evidence);
  replaceExternalGateProof(
    mismatchedFormspreeEvidence,
    "formspree-contact-delivery",
    "mismatched-sealed-endpoint.json",
    (value) => {
      value.details.endpointSha256 = sha256(
        "https://formspree.io/f/another-valid-contact-endpoint",
      );
    },
  );
  runPromotionFailure("mismatched-sealed-formspree", mismatchedFormspreeEvidence);

  const mismatchedCalendlyEvidence = structuredClone(evidence);
  replaceExternalGateProof(
    mismatchedCalendlyEvidence,
    "calendly-booking-cancel",
    "mismatched-sealed-calendly.json",
    (value) => {
      value.details.eventUrl = "https://calendly.com/jq33-design/another-event";
      value.details.eventUrlSha256 = sha256(
        new URL(value.details.eventUrl).href,
      );
    },
  );
  runPromotionFailure("mismatched-sealed-calendly", mismatchedCalendlyEvidence);

  const mismatchedSocialEvidence = structuredClone(evidence);
  replaceExternalGateProof(
    mismatchedSocialEvidence,
    "social-profile-ownership",
    "mismatched-sealed-social.json",
    (value) => {
      value.details.profiles[0].url =
        "https://www.facebook.com/a-different-jq33-profile/";
    },
  );
  runPromotionFailure("mismatched-sealed-social", mismatchedSocialEvidence);

  const mismatchedCloudflareEvidence = structuredClone(evidence);
  replaceExternalGateProof(
    mismatchedCloudflareEvidence,
    "cloudflare-pages-web-analytics",
    "mismatched-sealed-cloudflare.json",
    (value) => {
      value.details.tokenSha256 = sha256("fedcba9876543210fedcba9876543210");
    },
  );
  runPromotionFailure("mismatched-sealed-cloudflare", mismatchedCloudflareEvidence);

  const mismatchedPreviewCandidateEvidence = structuredClone(evidence);
  mismatchedPreviewCandidateEvidence.preview.evidence[0].sha256 = "f".repeat(64);
  runPromotionFailure(
    "mismatched-preview-candidate-attestation",
    mismatchedPreviewCandidateEvidence,
  );

  const wrongPreviewCandidatePathEvidence = structuredClone(evidence);
  wrongPreviewCandidatePathEvidence.preview.evidence = [sharedProof];
  runPromotionFailure(
    "wrong-preview-candidate-attestation-path",
    wrongPreviewCandidatePathEvidence,
  );

  const wrongBranchCandidate = structuredClone(candidateAttestationValue);
  wrongBranchCandidate.preview.branch = "main";
  const wrongBranchCandidatePath = writeJson(
    "wrong-branch-candidate-attestation.json",
    wrongBranchCandidate,
  );
  const originalInRepoCandidateBytes = fs.readFileSync(inRepoCandidateAttestation);
  try {
    fs.copyFileSync(wrongBranchCandidatePath, inRepoCandidateAttestation);
    const wrongBranchEvidence = structuredClone(evidence);
    wrongBranchEvidence.preview.evidence[0].sha256 = sha256(
      fs.readFileSync(wrongBranchCandidatePath),
    );
    const wrongBranchEvidencePath = writeJson(
      `${TASK_ROOT}/wrong-branch-candidate-evidence.json`,
      wrongBranchEvidence,
    );
    run(
      "ci-validate-promotion-evidence.mjs",
      [
        "--repo-root", temporaryRoot,
        "--evidence", wrongBranchEvidencePath,
        "--candidate-attestation", wrongBranchCandidatePath,
        "--expected-evidence-sha256", sha256(fs.readFileSync(wrongBranchEvidencePath)),
        "--expected-candidate-run-id", candidateRunId,
        "--output", path.join(temporaryRoot, "must-not-exist-wrong-branch-validation.json"),
      ],
      { shouldFail: true },
    );
  } finally {
    fs.writeFileSync(inRepoCandidateAttestation, originalInRepoCandidateBytes);
  }

  const missingRefEvidence = structuredClone(evidence);
  missingRefEvidence.criteria[0].evidence[0].path = `${TASK_ROOT}/raw/fixture/missing.json`;
  const missingPath = writeJson(`${TASK_ROOT}/missing-ref-evidence.json`, missingRefEvidence);
  run(
    "ci-validate-promotion-evidence.mjs",
    ["--repo-root", temporaryRoot, "--evidence", missingPath, "--candidate-attestation", candidateAttestation,
      "--expected-evidence-sha256", sha256(fs.readFileSync(missingPath)), "--expected-candidate-run-id", candidateRunId,
      "--output", path.join(temporaryRoot, "must-not-exist-missing.json")],
    { shouldFail: true },
  );
  const badHashEvidence = structuredClone(evidence);
  badHashEvidence.externalGates[0].evidence[0].sha256 = "f".repeat(64);
  const badHashPath = writeJson(`${TASK_ROOT}/bad-hash-evidence.json`, badHashEvidence);
  run(
    "ci-validate-promotion-evidence.mjs",
    ["--repo-root", temporaryRoot, "--evidence", badHashPath, "--candidate-attestation", candidateAttestation,
      "--expected-evidence-sha256", sha256(fs.readFileSync(badHashPath)), "--expected-candidate-run-id", candidateRunId,
      "--output", path.join(temporaryRoot, "must-not-exist-hash.json")],
    { shouldFail: true },
  );
  const staleEvidence = structuredClone(evidence);
  staleEvidence.preview.evidence[0].checkedAt = iso(-15 * 24 * 60 * 60 * 1000);
  const stalePath = writeJson(`${TASK_ROOT}/stale-evidence.json`, staleEvidence);
  run(
    "ci-validate-promotion-evidence.mjs",
    ["--repo-root", temporaryRoot, "--evidence", stalePath, "--candidate-attestation", candidateAttestation,
      "--expected-evidence-sha256", sha256(fs.readFileSync(stalePath)), "--expected-candidate-run-id", candidateRunId,
      "--output", path.join(temporaryRoot, "must-not-exist-stale.json")],
    { shouldFail: true },
  );
  const blockedEvidence = structuredClone(evidence);
  blockedEvidence.externalGates[0].status = "UNKNOWN";
  const blockedPath = writeJson(`${TASK_ROOT}/blocked-evidence.json`, blockedEvidence);
  run(
    "ci-validate-promotion-evidence.mjs",
    ["--repo-root", temporaryRoot, "--evidence", blockedPath, "--candidate-attestation", candidateAttestation,
      "--expected-evidence-sha256", sha256(fs.readFileSync(blockedPath)), "--expected-candidate-run-id", candidateRunId,
      "--output", path.join(temporaryRoot, "must-not-exist-blocked.json")],
    { shouldFail: true },
  );
  const dirtySourceEvidence = structuredClone(evidence);
  dirtySourceEvidence.source.sourceDirty = true;
  dirtySourceEvidence.source.sourceChangeCount = 1;
  const dirtySourcePath = writeJson(
    `${TASK_ROOT}/dirty-source-evidence.json`,
    dirtySourceEvidence,
  );
  run(
    "ci-validate-promotion-evidence.mjs",
    [
      "--repo-root", temporaryRoot,
      "--evidence", dirtySourcePath,
      "--candidate-attestation", candidateAttestation,
      "--expected-evidence-sha256", sha256(fs.readFileSync(dirtySourcePath)),
      "--expected-candidate-run-id", candidateRunId,
      "--output", path.join(temporaryRoot, "must-not-exist-dirty-source.json"),
    ],
    { shouldFail: true },
  );
  const verdictMismatch = structuredClone(evidence);
  verdictMismatch.verifier.verdict = "PASS";
  const verdictMismatchPath = writeJson(`${TASK_ROOT}/verdict-mismatch-evidence.json`, verdictMismatch);
  run(
    "ci-validate-promotion-evidence.mjs",
    ["--repo-root", temporaryRoot, "--evidence", verdictMismatchPath, "--candidate-attestation", candidateAttestation,
      "--expected-evidence-sha256", sha256(fs.readFileSync(verdictMismatchPath)), "--expected-candidate-run-id", candidateRunId,
      "--output", path.join(temporaryRoot, "must-not-exist-verdict.json")],
    { shouldFail: true },
  );

  const productionDeployment = writeJson("production-deployment.json", {
    schemaVersion: 1, resolvedAt: iso(1000), result: "PASS",
    deploymentId: productionDeploymentId, url: "https://fedcba98.jq33.pages.dev",
    environment: "production", projectName: "jq33", source: { commit, branch: "main" },
    latestStage: { name: "deploy", status: "success", endedOn: iso(500) },
  });
  const productionStatus = writeJson("production-status.json", {
    schemaVersion: 1, checkedAt: iso(2000), result: "PASS", failures: [],
    baseUrl: canonicalOrigin, productionMode: true, productionHostRedirectsChecked: true,
    records: [{ kind: "fixture-production-parity" }],
  });
  const canonicalStatus = writeJson("canonical-status.json", {
    schemaVersion: 1, checkedAt: iso(2000), result: "PASS", canonicalOrigin,
    records: Array.from({ length: (publicRoutes.length + 2) * 3 + redirectRoutes.length * 3 }, (_, index) => ({ index })),
  });
  const responseSmoke = writeJson("response-smoke.json", {
    schemaVersion: 1, checkedAt: iso(2500), result: "PASS",
    scope: "production-performance-parity-smoke", baseUrl: canonicalOrigin,
    attemptsPerRoute: 3, maxMedianResponseMs: 2500,
    routes: publicRoutes.map((route) => ({ route, medianResponseMs: 100, attempts: [{}, {}, {}] })),
  });
  const emptyRuntimeRun = (route, runNumber) => ({
    run: runNumber, url: new URL(route, canonicalOrigin).href, navigationError: "",
    metrics: { lcpMs: 1000, cls: 0, longTaskBlockingInputMs: 0 },
    consoleMessages: [], pageErrors: [], failedRequests: [], badResponses: [],
    disallowedThirdPartyRequests: [], preActionProcessorRequests: [], remoteImageOrFontRequests: [], supabaseRequests: [],
    cloudflareAnalyticsScriptRequests: [{ method: "GET", resourceType: "script", url: "https://static.cloudflareinsights.com/beacon.min.js" }],
    cloudflareRumRequests: [{ method: "POST", resourceType: "fetch", url: `${canonicalOrigin}/cdn-cgi/rum` }],
  });
  const browserParityValue = {
    schemaVersion: 1, checkedAt: iso(3000), result: "PASS",
    scope: "production-browser-parity", baseUrl: canonicalOrigin, productionMode: true,
    browserEngine: "playwright-chromium", runsPerRoute: 3,
    thresholds: { maxLcpMs: 2500, maxCls: 0.1, maxBlockingInputMs: 200 },
    failures: [],
    routes: publicRoutes.map((route) => ({
      route, medians: { lcpMs: 1000, cls: 0, longTaskBlockingInputMs: 0 },
      runs: [1, 2, 3].map((runNumber) => emptyRuntimeRun(route, runNumber)),
    })),
  };
  const browserParity = writeJson("browser-parity.json", browserParityValue);
  const productionAttestation = path.join(temporaryRoot, "production-parity-attestation.json");
  const productionAttestationArgs = [
    "--phase", "production", "--production-run-id", productionRunId,
    "--candidate-attestation", candidateAttestation,
    "--evidence-validation", validationPath, "--deployment", productionDeployment,
    "--status-matrix", productionStatus, "--canonical-matrix", canonicalStatus,
    "--performance-smoke", responseSmoke, "--browser-parity", browserParity,
    "--output", productionAttestation,
  ];
  run("ci-write-deployment-attestation.mjs", productionAttestationArgs);
  const badBrowserValue = structuredClone(browserParityValue);
  badBrowserValue.routes[0].runs[0].cloudflareAnalyticsScriptRequests = [];
  const badBrowser = writeJson("bad-browser-parity.json", badBrowserValue);
  run(
    "ci-write-deployment-attestation.mjs",
    productionAttestationArgs.map((value, index, values) =>
      values[index - 1] === "--browser-parity" ? badBrowser : value,
    ).map((value, index, values) =>
      values[index - 1] === "--output" ? path.join(temporaryRoot, "must-not-exist-production.json") : value,
    ),
    { shouldFail: true },
  );

  const productionAttestationSha = sha256(fs.readFileSync(productionAttestation));
  const finalVerdictReference = proof("final/verdict.json", {
    task_id: TASK_ID,
    overall_verdict: "PASS",
    verified_at: iso(5000),
    candidate_run_id: candidateRunId,
    production_run_id: productionRunId,
    source_commit: commit,
    source_tree_sha256: sourceTreeSha256,
    artifact_sha256: artifactSha256,
    production_deployment_id: productionDeploymentId,
    production_parity_sha256: productionAttestationSha,
    criteria: Array.from({ length: 13 }, (_, index) => ({ id: `AC${index + 1}`, status: "PASS", reason: "fresh final fixture" })),
  }, iso(5000));
  const finalProof = proof("final/production-proof.json", {
    schemaVersion: 1, checkedAt: iso(5000), result: "PASS",
  }, iso(5000));
  const finalEvidence = {
    schemaVersion: 1, taskId: TASK_ID, scope: "post-production-finalization", generatedAt: iso(6000),
    candidateRunId, productionRunId,
    source: sourceIdentity,
    artifact: { sha256: artifactSha256 },
    production: { url: canonicalOrigin, deploymentId: productionDeploymentId, parityAttestationSha256: productionAttestationSha },
    verifier: { verdict: "PASS", verifiedAt: finalVerdictReference.checkedAt, evidence: [finalVerdictReference] },
    criteria: Array.from({ length: 13 }, (_, index) => ({ id: `AC${index + 1}`, status: "PASS", scope: "complete", evidence: [finalProof] })),
  };
  const finalEvidencePath = writeJson(`${TASK_ROOT}/final-evidence.json`, finalEvidence);
  const finalizationArgs = [
    "--repo-root", temporaryRoot, "--final-evidence", finalEvidencePath,
    "--production-attestation", productionAttestation,
    "--expected-final-evidence-sha256", sha256(fs.readFileSync(finalEvidencePath)),
    "--expected-production-attestation-sha256", productionAttestationSha,
    "--expected-candidate-run-id", candidateRunId,
    "--expected-production-run-id", productionRunId,
    "--output", path.join(temporaryRoot, "production-finalization-attestation.json"),
  ];
  run("ci-finalize-production.mjs", finalizationArgs);
  const finalProblemsPath = writeBytes(
    `${TASK_ROOT}/problems.md`,
    "# Unresolved final blocker\n\nThis must prevent final PASS.\n",
  );
  run(
    "ci-finalize-production.mjs",
    finalizationArgs.map((value, index, values) =>
      values[index - 1] === "--output"
        ? path.join(temporaryRoot, "must-not-exist-final-problems.json")
        : value,
    ),
    { shouldFail: true },
  );
  fs.writeFileSync(finalProblemsPath, RESOLVED_PROBLEMS_TEXT, "utf8");
  const failedFinalEvidence = structuredClone(finalEvidence);
  failedFinalEvidence.criteria[12].status = "UNKNOWN";
  const failedFinalPath = writeJson(`${TASK_ROOT}/failed-final-evidence.json`, failedFinalEvidence);
  run(
    "ci-finalize-production.mjs",
    finalizationArgs.map((value, index, values) =>
      values[index - 1] === "--final-evidence" ? failedFinalPath :
      values[index - 1] === "--expected-final-evidence-sha256" ? sha256(fs.readFileSync(failedFinalPath)) :
      values[index - 1] === "--output" ? path.join(temporaryRoot, "must-not-exist-final.json") : value,
    ),
    { shouldFail: true },
  );

  const workflow = fs.readFileSync(path.join(root, WORKFLOW_PATH), "utf8");
  const workflowFailures = [];
  if (/ubuntu-latest/.test(workflow)) workflowFailures.push("runner uses ubuntu-latest");
  if (/uses:\s*[^\s]+@v\d+/m.test(workflow)) workflowFailures.push("action uses a mutable major tag");
  if (/pnpm\s+(?:exec|dlx)\b/.test(workflow)) workflowFailures.push("workflow uses pnpm exec/dlx");
  if (!/pnpm wrangler\b/.test(workflow)) workflowFailures.push("workflow does not use pinned pnpm wrangler script");
  if (!/pnpm playwright install --with-deps chromium/.test(workflow)) workflowFailures.push("workflow does not use pinned pnpm playwright script");
  if (!/node scripts\/check-ci-promotion\.mjs/.test(workflow)) workflowFailures.push("build CI omits the CI contract fixture test");
  if (!/finalize-production:/.test(workflow) || !/ci-finalize-production\.mjs/.test(workflow)) {
    workflowFailures.push("separate post-production finalization is missing");
  }
  if (!/ci-check-production-browser-parity\.mjs/.test(workflow)) {
    workflowFailures.push("production browser parity closure is missing");
  }
  if (!/pnpm check:evidence-contracts/.test(workflow)) {
    workflowFailures.push("clean candidate CI omits deterministic evidence-contract self-tests");
  }
  if ((workflow.match(/ci-check-evidence-redaction\.mjs/g) || []).length < 2) {
    workflowFailures.push("external evidence redaction is not revalidated at promotion and finalization");
  }
  if ((workflow.match(/render-task-evidence\.mjs/g) || []).length < 2) {
    workflowFailures.push("deterministic evidence rendering is not checked at promotion and finalization");
  }
  if (!/branch="candidate-\$\{GITHUB_SHA::12\}"/.test(workflow)) {
    workflowFailures.push("preview branch is not deterministically derived from the source commit");
  }
  if (!/ci-write-deployment-attestation\.mjs/.test(workflow) ||
      !/ci-validate-promotion-evidence\.mjs/.test(workflow)) {
    workflowFailures.push("candidate branch identity is not carried through writer and promotion validation");
  }
  if (!/create-final-evidence\.mjs[\s\S]*?--check/.test(workflow)) {
    workflowFailures.push("final evidence assembler is not rerun in check mode during finalization");
  }
  if (/raw\/finalization-production-run-validation\.json/.test(workflow)) {
    workflowFailures.push("legacy non-normalized finalization validation path remains in workflow");
  }
  if (!/raw\/finalization\/runtime-production-run-validation\.json/.test(workflow)) {
    workflowFailures.push("normalized runtime finalization validation path is missing");
  }
  const buildStart = workflow.indexOf("  build-and-verify:");
  const previewStart = workflow.indexOf("  deploy-preview:");
  const buildSection = workflow.slice(buildStart, previewStart > buildStart ? previewStart : undefined);
  if (buildStart < 0 || /^    environment:/m.test(buildSection)) {
    workflowFailures.push("candidate build must run before any protected deployment environment");
  }
  const publicBuildVariables = [
    "PUBLIC_FORMSPREE_CONTACT_URL",
    "PUBLIC_FORMSPREE_INQUIRY_URL",
    "PUBLIC_CALENDLY_URL",
    "PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN",
  ];
  for (const variable of publicBuildVariables) {
    const expected = `${variable}: \${{ vars.${variable} }}`;
    if (!buildSection.includes(expected)) {
      workflowFailures.push(`${variable} is not sourced from repository/organization Actions variables`);
    }
  }
  const promoteStart = workflow.indexOf("  promote-production:");
  const finalizeStart = workflow.indexOf("  finalize-production:");
  const promoteSection = workflow.slice(promoteStart, finalizeStart > promoteStart ? finalizeStart : undefined);
  const finalizeSection = workflow.slice(finalizeStart);
  if (!/^    environment: production$/m.test(promoteSection) ||
      !/^    environment: production-finalization$/m.test(finalizeSection)) {
    workflowFailures.push("production and production-finalization protected environments are both required");
  }
  if ((workflow.match(/RELEASE_REVIEW_POLICY:\s*\$\{\{ vars\.RELEASE_REVIEW_POLICY \}\}/g) || []).length !== 2 ||
      (workflow.match(/test "\$RELEASE_REVIEW_POLICY" = "independent-review-required"/g) || []).length !== 2) {
    workflowFailures.push("independent-review release policy is not enforced at both protected boundaries");
  }
  const requiredPromotionAllowlist = [
    '"$TASK_DIR/evidence.json"',
    '"$TASK_DIR/evidence.md"',
    '"$TASK_DIR/verdict.json"',
    '"$TASK_DIR/problems.md"',
    '"$TASK_DIR/raw/deployed-preview/candidate-attestation.json"',
    '"$TASK_DIR/raw/external/"*',
  ];
  if (!requiredPromotionAllowlist.every((entry) => promoteSection.includes(entry))) {
    workflowFailures.push("promotion evidence allowlist is incomplete");
  }
  const requiredFinalizationAllowlist = [
    '"$TASK_DIR/evidence.md"',
    '"$TASK_DIR/final-evidence.json"',
    '"$TASK_DIR/verdict.json"',
    '"$TASK_DIR/problems.md"',
    '"$TASK_DIR/raw/promotion/"*',
    '"$TASK_DIR/raw/cloudflare-production/"*',
    '"$TASK_DIR/raw/deployed-production/"*',
    '"$TASK_DIR/raw/finalization/"*',
  ];
  if (!requiredFinalizationAllowlist.every((entry) => finalizeSection.includes(entry)) ||
      !finalizeSection.includes('git diff --name-only "$CANDIDATE_COMMIT_SHA" "$PRODUCTION_RUN_COMMIT_SHA"') ||
      !finalizeSection.includes('git diff --name-only "$PRODUCTION_RUN_COMMIT_SHA" "$GITHUB_SHA"')) {
    workflowFailures.push("split promotion-to-finalization evidence allowlists are incomplete");
  }
  if (promoteSection.indexOf("Guard main ref") > promoteSection.indexOf("Install frozen deployment tooling")) {
    workflowFailures.push("promotion ancestry guard runs after install");
  }
  if (/^    env:[\s\S]*?secrets\./m.test(promoteSection.split("    steps:")[0] || "")) {
    workflowFailures.push("promotion job scope contains secrets");
  }
  const actionUses = [...workflow.matchAll(/uses:\s*([^\s#]+)/g)].map((match) => match[1]);
  const expectedActionPins = new Set([
    "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
    "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093",
    "pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1",
  ]);
  if (actionUses.some((value) => !expectedActionPins.has(value))) {
    workflowFailures.push("one or more actions do not use an approved official full-SHA pin");
  }
  for (const pin of expectedActionPins) {
    if (!actionUses.includes(pin)) workflowFailures.push(`required action pin is missing: ${pin}`);
  }
  const runners = [...workflow.matchAll(/runs-on:\s*([^\s#]+)/g)].map((match) => match[1]);
  if (runners.length !== 4 || runners.some((runner) => runner !== "ubuntu-24.04")) {
    workflowFailures.push("all four jobs must use the version-pinned ubuntu-24.04 runner");
  }
  if ((workflow.match(/ci-check-manual-cloudflare-analytics\.mjs/g) || []).length < 3) {
    workflowFailures.push("manual Cloudflare Web Analytics is not asserted at build, preview, and promotion");
  }
  const allowedCloudflareSecretSteps = new Set([
    "Deploy immutable preview artifact",
    "Resolve terminal immutable preview deployment",
    "Promote exact candidate bytes to production",
    "Resolve terminal immutable production deployment",
  ]);
  const allowedGitHubTokenSteps = new Set([
    "Validate exact successful candidate workflow run",
    "Download immutable candidate from selected run",
    "Download sealed preview attestation from selected run",
    "Validate exact terminal production-promotion workflow run",
    "Download immutable production parity from promotion run",
  ]);
  let currentStep = "";
  for (const line of workflow.split(/\r?\n/)) {
    const stepName = /^\s{6}- name:\s+(.+)$/.exec(line)?.[1];
    if (stepName) currentStep = stepName.trim();
    if (line.includes("secrets.") && !allowedCloudflareSecretSteps.has(currentStep)) {
      workflowFailures.push(`Cloudflare secret is exposed outside an API/deploy step (${currentStep})`);
    }
    if (line.includes("github.token") && !allowedGitHubTokenSteps.has(currentStep)) {
      workflowFailures.push(`GitHub token is exposed outside an API/artifact step (${currentStep})`);
    }
  }
  if (workflowFailures.length) {
    throw new Error(`Workflow contract failed: ${workflowFailures.join("; ")}.`);
  }

  console.log(
    "CI promotion contract passed: terminal workflow/deployment identity, fresh hashed in-repo evidence, parsed verifier binding, preview proof completeness, browser/CWV production parity, and separate finalization all have positive and negative fixture coverage.",
  );
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
