import fs from "node:fs";
import path from "node:path";
import {
  MAX_CLOCK_SKEW_MS,
  MAX_EVIDENCE_AGE_MS,
  TASK_ROOT,
  assertExactKeys,
  isCommit,
  isIsoTimestamp,
  isSha256,
  sha256,
  validateProofRef,
} from "./ci-proof-utils.mjs";
import { assertExternalEvidenceRedacted } from "./ci-check-evidence-redaction.mjs";

export const EXTERNAL_GATE_IDS = Object.freeze([
  "formspree-contact-delivery",
  "formspree-inquiry-delivery",
  "formspree-spam-retention",
  "calendly-booking-cancel",
  "social-profile-ownership",
  "cloudflare-pages-web-analytics",
  "dns-mx-spf-dkim-dmarc",
  "google-search-console",
  "nvda-windows",
  "legal-privacy-retention",
  "browser-zoom-200",
  "schema-rich-results",
  "operational-privacy",
]);

export const EXTERNAL_GATE_PROOF_ROOT = `${TASK_ROOT}/raw/external`;

export const REQUIRED_NVDA_CHECKS = Object.freeze([
  "navigation",
  "headings-landmarks",
  "project-disclosure",
  "faq-expanded-collapsed",
  "visible-focus-order",
  "contact-errors-status-success",
  "inquiry-errors-status-success",
  "social-links",
  "calendly-action",
]);

export const REQUIRED_ZOOM_TEMPLATES = Object.freeze([
  "home",
  "commercial-service",
  "projects-index",
  "project-detail",
  "journal-index",
  "journal-article",
  "contact-form",
  "inquiry-form",
  "legal",
]);

export const REQUIRED_PRIVACY_PROCESSORS = Object.freeze([
  "cloudflare",
  "formspree",
  "calendly",
]);

export const REQUIRED_PRIVACY_FLOWS = Object.freeze([
  "analytics-page-view",
  "contact-submission",
  "inquiry-submission",
  "calendly-booking",
]);

export const externalGateDirectory = (gateId) =>
  `${EXTERNAL_GATE_PROOF_ROOT}/${gateId}`;

const SOCIAL_PLATFORM_HOSTS = Object.freeze({
  instagram: new Set(["instagram.com", "www.instagram.com"]),
  facebook: new Set(["facebook.com", "www.facebook.com"]),
  youtube: new Set(["youtube.com", "www.youtube.com"]),
  behance: new Set(["behance.net", "www.behance.net"]),
});

export const validateCandidateIntegrations = (integrations, fail) => {
  assertExactKeys(
    integrations,
    ["formspree", "calendly", "social", "cloudflareWebAnalytics"],
    "candidate integrations",
    fail,
  );
  assertExactKeys(
    integrations.formspree,
    ["contactEndpointSha256", "inquiryEndpointSha256"],
    "candidate integrations.formspree",
    fail,
  );
  if (
    !isSha256(integrations.formspree.contactEndpointSha256) ||
    !isSha256(integrations.formspree.inquiryEndpointSha256) ||
    integrations.formspree.contactEndpointSha256 ===
      integrations.formspree.inquiryEndpointSha256
  ) {
    fail("candidate Formspree endpoint identities must be distinct lowercase SHA-256 values.");
  }
  assertExactKeys(
    integrations.calendly,
    ["eventUrlSha256"],
    "candidate integrations.calendly",
    fail,
  );
  if (!isSha256(integrations.calendly.eventUrlSha256)) {
    fail("candidate Calendly event identity must be a lowercase SHA-256.");
  }
  assertExactKeys(
    integrations.social,
    ["publishedProfileCount", "profiles"],
    "candidate integrations.social",
    fail,
  );
  if (
    !Number.isSafeInteger(integrations.social.publishedProfileCount) ||
    integrations.social.publishedProfileCount < 0 ||
    !Array.isArray(integrations.social.profiles) ||
    integrations.social.profiles.length !== integrations.social.publishedProfileCount
  ) {
    fail("candidate social profile count must exactly match its redacted profile identities.");
  }
  const platforms = new Set();
  let priorSortKey = "";
  for (const [index, profile] of integrations.social.profiles.entries()) {
    const label = `candidate integrations.social.profiles[${index}]`;
    assertExactKeys(profile, ["platform", "urlSha256"], label, fail);
    if (!Object.hasOwn(SOCIAL_PLATFORM_HOSTS, profile.platform)) {
      fail(`${label}.platform is not a supported published social platform.`);
    }
    if (platforms.has(profile.platform)) {
      fail(`candidate social identity repeats platform ${profile.platform}.`);
    }
    platforms.add(profile.platform);
    if (!isSha256(profile.urlSha256)) {
      fail(`${label}.urlSha256 must be a lowercase SHA-256.`);
    }
    const sortKey = `${profile.platform}\0${profile.urlSha256}`;
    if (priorSortKey && priorSortKey.localeCompare(sortKey) >= 0) {
      fail("candidate social identities must be uniquely sorted by platform and URL hash.");
    }
    priorSortKey = sortKey;
  }
  assertExactKeys(
    integrations.cloudflareWebAnalytics,
    ["tokenSha256", "documentCount"],
    "candidate integrations.cloudflareWebAnalytics",
    fail,
  );
  if (
    !isSha256(integrations.cloudflareWebAnalytics.tokenSha256) ||
    !Number.isSafeInteger(integrations.cloudflareWebAnalytics.documentCount) ||
    integrations.cloudflareWebAnalytics.documentCount < 1
  ) {
    fail("candidate Cloudflare Analytics identity must bind one token hash and public documents.");
  }
  return integrations;
};

const failIf = (condition, message, fail) => {
  if (condition) fail(message);
};

const requireExactCount = (value, expected, label, fail) => {
  if (!Number.isSafeInteger(value) || value !== expected) {
    fail(`${label} must be exactly ${expected}.`);
  }
};

const requireRetention = (value, label, fail) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 12) {
    fail(`${label} must be an integer between 0 and 12 months.`);
  }
};

const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const externalGateDetailsSha256 = (details) => sha256(stableJson(details));

export const validateCandidateLegalDocuments = (legalDocuments, fail) => {
  assertExactKeys(
    legalDocuments,
    ["privacy", "terms"],
    "candidate legalDocuments",
    fail,
  );
  const expected = {
    privacy: { route: "/privacy/", artifactPath: "privacy/index.html" },
    terms: { route: "/terms/", artifactPath: "terms/index.html" },
  };
  for (const [name, identity] of Object.entries(expected)) {
    const label = `candidate legalDocuments.${name}`;
    const document = legalDocuments[name];
    assertExactKeys(document, ["route", "artifactPath", "sha256"], label, fail);
    if (
      document.route !== identity.route ||
      document.artifactPath !== identity.artifactPath ||
      !isSha256(document.sha256)
    ) {
      fail(`${label} must bind ${identity.route}, ${identity.artifactPath}, and its exact byte SHA-256.`);
    }
  }
  if (legalDocuments.privacy.sha256 === legalDocuments.terms.sha256) {
    fail("candidate Privacy and Terms documents must have distinct byte identities.");
  }
  return legalDocuments;
};

const requireHttpsUrl = (value, label, fail) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a valid HTTPS URL.`);
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password
  ) {
    fail(`${label} must be a credential-free HTTPS URL.`);
  }
  return parsed;
};

const requireTimestampNotAfter = (value, referenceTime, label, fail, maxAgeMs = Infinity) => {
  if (!isIsoTimestamp(value)) {
    fail(`${label} must be a UTC ISO-8601 timestamp.`);
    return;
  }
  const timestamp = Date.parse(value);
  const reference = Date.parse(referenceTime);
  if (!Number.isFinite(reference)) {
    fail(`${label} cannot be checked against an invalid reference timestamp.`);
    return;
  }
  if (timestamp > reference + MAX_CLOCK_SKEW_MS) {
    fail(`${label} is dated in the future.`);
  }
  if (reference - timestamp > maxAgeMs) {
    fail(`${label} is stale.`);
  }
};

const requireUniquePassingChecklist = (
  values,
  key,
  expectedValues,
  label,
  fail,
) => {
  if (!Array.isArray(values) || values.length !== expectedValues.length) {
    fail(`${label} must cover exactly: ${expectedValues.join(", ")}.`);
    return;
  }
  const seen = new Set();
  for (const [index, entry] of values.entries()) {
    assertExactKeys(entry, [key, "status"], `${label}[${index}]`, fail);
    if (typeof entry[key] !== "string" || !expectedValues.includes(entry[key])) {
      fail(`${label}[${index}].${key} is not required by this gate.`);
    }
    if (seen.has(entry[key])) fail(`${label} repeats ${entry[key]}.`);
    seen.add(entry[key]);
    if (entry.status !== "PASS") fail(`${label}[${index}].status must be PASS.`);
  }
  for (const expected of expectedValues) {
    if (!seen.has(expected)) fail(`${label} is missing ${expected}.`);
  }
};

const validateFormDelivery = (gateId, details, candidateIntegrations, fail) => {
  assertExactKeys(
    details,
    [
      "form",
      "requestCount",
      "providerAcceptanceCount",
      "inboxReceiptCount",
      "duplicateCount",
      "endpointSha256",
      "tagSha256",
      "submissionSha256",
    ],
    `${gateId}.details`,
    fail,
  );
  const expectedForm = gateId === "formspree-contact-delivery" ? "contact" : "inquiry";
  if (details.form !== expectedForm) {
    fail(`${gateId}.details.form must be ${expectedForm}.`);
  }
  requireExactCount(details.requestCount, 1, `${gateId}.details.requestCount`, fail);
  requireExactCount(
    details.providerAcceptanceCount,
    1,
    `${gateId}.details.providerAcceptanceCount`,
    fail,
  );
  requireExactCount(
    details.inboxReceiptCount,
    1,
    `${gateId}.details.inboxReceiptCount`,
    fail,
  );
  requireExactCount(details.duplicateCount, 0, `${gateId}.details.duplicateCount`, fail);
  const hashes = [
    details.endpointSha256,
    details.tagSha256,
    details.submissionSha256,
  ];
  if (hashes.some((value) => !isSha256(value))) {
    fail(`${gateId} endpoint, tag, and submission hashes must be lowercase SHA-256 values.`);
  }
  if (new Set(hashes).size !== hashes.length) {
    fail(`${gateId} endpoint, tag, and submission hashes must be distinct.`);
  }
  const expectedEndpoint =
    expectedForm === "contact"
      ? candidateIntegrations.formspree.contactEndpointSha256
      : candidateIntegrations.formspree.inquiryEndpointSha256;
  if (details.endpointSha256 !== expectedEndpoint) {
    fail(`${gateId}.details.endpointSha256 does not match the endpoint sealed in dist.`);
  }
};

const validateSpamRetention = (details, candidateIntegrations, fail) => {
  assertExactKeys(
    details,
    [
      "accountEvidenceSha256",
      "contactEndpointSha256",
      "inquiryEndpointSha256",
      "spamProtectionEnabled",
      "retentionMonths",
      "deletionConfirmed",
    ],
    "formspree-spam-retention.details",
    fail,
  );
  if (
    details.contactEndpointSha256 !==
      candidateIntegrations.formspree.contactEndpointSha256 ||
    details.inquiryEndpointSha256 !==
      candidateIntegrations.formspree.inquiryEndpointSha256
  ) {
    fail(
      "formspree-spam-retention must bind both Formspree endpoint identities sealed in dist.",
    );
  }
  if (
    !isSha256(details.accountEvidenceSha256) ||
    [details.contactEndpointSha256, details.inquiryEndpointSha256].includes(
      details.accountEvidenceSha256,
    )
  ) {
    fail(
      "formspree-spam-retention accountEvidenceSha256 must be a distinct redacted provider-account evidence identity.",
    );
  }
  if (details.spamProtectionEnabled !== true) {
    fail("formspree-spam-retention must prove enabled spam protection.");
  }
  requireRetention(
    details.retentionMonths,
    "formspree-spam-retention.details.retentionMonths",
    fail,
  );
  if (details.deletionConfirmed !== true) {
    fail("formspree-spam-retention must confirm deletion capability.");
  }
};

const validateCalendly = (details, candidateIntegrations, fail) => {
  const label = "calendly-booking-cancel.details";
  assertExactKeys(
    details,
    [
      "eventUrl",
      "eventUrlSha256",
      "published",
      "bookingCount",
      "inviteCount",
      "cancellationCount",
      "extraCount",
    ],
    label,
    fail,
  );
  const eventUrl = requireHttpsUrl(details.eventUrl, `${label}.eventUrl`, fail);
  const eventSegments = eventUrl?.pathname.split("/").filter(Boolean) || [];
  if (
    !eventUrl ||
    !["calendly.com", "www.calendly.com"].includes(eventUrl.hostname.toLowerCase()) ||
    eventSegments.length < 2 ||
    eventUrl.search ||
    eventUrl.hash
  ) {
    fail(`${label}.eventUrl must be a direct published Calendly event URL.`);
  }
  if (details.published !== true) fail(`${label}.published must be true.`);
  if (
    !isSha256(details.eventUrlSha256) ||
    !eventUrl ||
    details.eventUrlSha256 !== sha256(eventUrl.href) ||
    details.eventUrlSha256 !== candidateIntegrations.calendly.eventUrlSha256
  ) {
    fail(`${label} must hash the exact Calendly event URL sealed in dist.`);
  }
  requireExactCount(details.bookingCount, 1, `${label}.bookingCount`, fail);
  requireExactCount(details.inviteCount, 1, `${label}.inviteCount`, fail);
  requireExactCount(details.cancellationCount, 1, `${label}.cancellationCount`, fail);
  requireExactCount(details.extraCount, 0, `${label}.extraCount`, fail);
};

const validateSocialProfiles = (details, candidateIntegrations, fail) => {
  const label = "social-profile-ownership.details";
  assertExactKeys(
    details,
    ["userConfirmed", "publishedProfileCount", "profiles"],
    label,
    fail,
  );
  if (details.userConfirmed !== true) fail(`${label}.userConfirmed must be true.`);
  if (
    !Number.isSafeInteger(details.publishedProfileCount) ||
    details.publishedProfileCount < 0 ||
    !Array.isArray(details.profiles) ||
    details.profiles.length !== details.publishedProfileCount
  ) {
    fail(`${label}.publishedProfileCount must exactly match profiles.`);
    return;
  }
  const platforms = new Set();
  const urls = new Set();
  for (const [index, profile] of details.profiles.entries()) {
    const profileLabel = `${label}.profiles[${index}]`;
    assertExactKeys(profile, ["platform", "url", "confirmed"], profileLabel, fail);
    if (typeof profile.platform !== "string") {
      fail(`${profileLabel}.platform must be a supported platform.`);
    }
    const normalizedPlatform = profile.platform.trim().toLowerCase();
    if (!Object.hasOwn(SOCIAL_PLATFORM_HOSTS, normalizedPlatform)) {
      fail(`${profileLabel}.platform must be a supported published platform.`);
    }
    if (platforms.has(normalizedPlatform)) fail(`${label}.profiles repeats ${profile.platform}.`);
    platforms.add(normalizedPlatform);
    const parsed = requireHttpsUrl(profile.url, `${profileLabel}.url`, fail);
    if (
      !parsed ||
      !SOCIAL_PLATFORM_HOSTS[normalizedPlatform]?.has(
        parsed.hostname.toLowerCase(),
      ) ||
      parsed.pathname.split("/").filter(Boolean).length === 0 ||
      parsed.search ||
      parsed.hash
    ) {
      fail(`${profileLabel}.url must identify a profile, not a site root.`);
    }
    const normalizedUrl = parsed?.href || profile.url;
    if (urls.has(normalizedUrl)) fail(`${label}.profiles repeats ${profile.url}.`);
    urls.add(normalizedUrl);
    if (profile.confirmed !== true) fail(`${profileLabel}.confirmed must be true.`);
  }
  if (
    details.publishedProfileCount !==
    candidateIntegrations.social.publishedProfileCount
  ) {
    fail(`${label} must explicitly cover the number of profiles sealed in dist.`);
  }
  const actualIdentities = details.profiles
    .map((profile) => ({
      platform: profile.platform.trim().toLowerCase(),
      urlSha256: sha256(new URL(profile.url).href),
    }))
    .sort(
      (left, right) =>
        left.platform.localeCompare(right.platform) ||
        left.urlSha256.localeCompare(right.urlSha256),
    );
  if (
    JSON.stringify(actualIdentities) !==
    JSON.stringify(candidateIntegrations.social.profiles)
  ) {
    fail(`${label} must exactly cover the social profiles actually published in dist.`);
  }
};

const validateCloudflareAnalytics = (
  details,
  checkedAt,
  previewUrl,
  candidateIntegrations,
  fail,
) => {
  const label = "cloudflare-pages-web-analytics.details";
  assertExactKeys(
    details,
    ["sourceMode", "automaticInjection", "tokenSha256", "dashboardPageView"],
    label,
    fail,
  );
  if (details.sourceMode !== "source-manual") {
    fail(`${label}.sourceMode must be source-manual.`);
  }
  if (details.automaticInjection !== "disabled") {
    fail(`${label}.automaticInjection must be disabled.`);
  }
  if (
    !isSha256(details.tokenSha256) ||
    details.tokenSha256 !==
      candidateIntegrations.cloudflareWebAnalytics.tokenSha256
  ) {
    fail(`${label}.tokenSha256 must match the Cloudflare token sealed in dist.`);
  }
  assertExactKeys(
    details.dashboardPageView,
    ["url", "observedAt", "count"],
    `${label}.dashboardPageView`,
    fail,
  );
  requireExactCount(
    details.dashboardPageView.count,
    1,
    `${label}.dashboardPageView.count`,
    fail,
  );
  const observedUrl = requireHttpsUrl(
    details.dashboardPageView.url,
    `${label}.dashboardPageView.url`,
    fail,
  );
  const expectedOrigin = requireHttpsUrl(previewUrl, "previewUrl", fail)?.origin;
  if (!observedUrl || observedUrl.origin !== expectedOrigin) {
    fail(`${label}.dashboardPageView.url must be on the bound preview origin.`);
  }
  requireTimestampNotAfter(
    details.dashboardPageView.observedAt,
    checkedAt,
    `${label}.dashboardPageView.observedAt`,
    fail,
    MAX_EVIDENCE_AGE_MS,
  );
};

const validateDns = (details, fail) => {
  const label = "dns-mx-spf-dkim-dmarc.details";
  assertExactKeys(
    details,
    [
      "domain",
      "senderDomain",
      "mxValid",
      "mxRecordCount",
      "spfRecordCount",
      "dkimRecordCount",
      "dkimSelectors",
      "dmarcRecordCount",
      "alignmentResult",
      "resolvers",
    ],
    label,
    fail,
  );
  if (details.domain !== "jq33.design") {
    fail(`${label}.domain must be jq33.design.`);
  }
  if (
    typeof details.senderDomain !== "string" ||
    !/^[a-z0-9.-]+$/.test(details.senderDomain) ||
    (details.senderDomain !== "jq33.design" &&
      !details.senderDomain.endsWith(".jq33.design"))
  ) {
    fail(`${label}.senderDomain must be jq33.design or an aligned subdomain.`);
  }
  if (details.mxValid !== true) fail(`${label}.mxValid must be true.`);
  if (!Number.isSafeInteger(details.mxRecordCount) || details.mxRecordCount < 1) {
    fail(`${label}.mxRecordCount must be at least 1.`);
  }
  requireExactCount(details.spfRecordCount, 1, `${label}.spfRecordCount`, fail);
  if (
    !Number.isSafeInteger(details.dkimRecordCount) ||
    details.dkimRecordCount < 1
  ) {
    fail(`${label}.dkimRecordCount must be at least 1.`);
  }
  if (
    !Array.isArray(details.dkimSelectors) ||
    details.dkimSelectors.length !== details.dkimRecordCount ||
    details.dkimSelectors.length < 1
  ) {
    fail(`${label}.dkimSelectors must identify every valid DKIM record.`);
  } else {
    const selectors = new Set();
    for (const [index, selector] of details.dkimSelectors.entries()) {
      if (
        typeof selector !== "string" ||
        !/^[a-z0-9][a-z0-9._-]{0,62}$/i.test(selector)
      ) {
        fail(`${label}.dkimSelectors[${index}] must be a valid selector label.`);
      }
      const normalized = selector.toLowerCase();
      if (selectors.has(normalized)) {
        fail(`${label}.dkimSelectors repeats ${selector}.`);
      }
      selectors.add(normalized);
    }
  }
  requireExactCount(details.dmarcRecordCount, 1, `${label}.dmarcRecordCount`, fail);
  if (details.alignmentResult !== "PASS") {
    fail(`${label}.alignmentResult must be PASS.`);
  }
  if (!Array.isArray(details.resolvers) || details.resolvers.length < 2) {
    fail(`${label}.resolvers must contain at least two independent resolver results.`);
    return;
  }
  const seen = new Set();
  for (const [index, resolver] of details.resolvers.entries()) {
    const resolverLabel = `${label}.resolvers[${index}]`;
    assertExactKeys(resolver, ["name", "result"], resolverLabel, fail);
    if (typeof resolver.name !== "string" || !resolver.name.trim()) {
      fail(`${resolverLabel}.name must be non-empty.`);
    }
    const normalized = resolver.name.trim().toLowerCase();
    if (seen.has(normalized)) fail(`${label}.resolvers repeats ${resolver.name}.`);
    seen.add(normalized);
    if (resolver.result !== "PASS") fail(`${resolverLabel}.result must be PASS.`);
  }
};

const validateSearchConsole = (details, fail) => {
  const label = "google-search-console.details";
  assertExactKeys(
    details,
    ["property", "propertyType", "ownershipVerified", "sitemap"],
    label,
    fail,
  );
  if (details.property !== "jq33.design" || details.propertyType !== "DOMAIN") {
    fail(`${label} must bind the jq33.design DOMAIN property.`);
  }
  if (details.ownershipVerified !== true) {
    fail(`${label}.ownershipVerified must be true.`);
  }
  assertExactKeys(details.sitemap, ["url", "status", "fetchable"], `${label}.sitemap`, fail);
  if (
    details.sitemap.url !== "https://jq33.design/sitemap.xml" ||
    details.sitemap.status !== "ACCEPTED" ||
    details.sitemap.fetchable !== true
  ) {
    fail(`${label}.sitemap must be the accepted, fetchable canonical sitemap.`);
  }
};

const validateNvda = (details, fail) => {
  const label = "nvda-windows.details";
  assertExactKeys(details, ["platform", "screenReader", "result", "checklist"], label, fail);
  if (details.platform !== "Windows" || details.screenReader !== "NVDA") {
    fail(`${label} must bind NVDA on Windows.`);
  }
  if (details.result !== "PASS") fail(`${label}.result must be PASS.`);
  requireUniquePassingChecklist(
    details.checklist,
    "id",
    REQUIRED_NVDA_CHECKS,
    `${label}.checklist`,
    fail,
  );
};

const validateZoom = (details, requiredZoomRoutes, fail) => {
  const label = "browser-zoom-200.details";
  assertExactKeys(
    details,
    ["zoomPercent", "result", "routeChecklist", "templateChecklist"],
    label,
    fail,
  );
  if (details.zoomPercent !== 200) fail(`${label}.zoomPercent must be 200.`);
  if (details.result !== "PASS") fail(`${label}.result must be PASS.`);
  if (!Array.isArray(requiredZoomRoutes) || requiredZoomRoutes.length === 0) {
    fail("browser-zoom-200 requires a non-empty requiredZoomRoutes contract.");
    return;
  }
  requireUniquePassingChecklist(
    details.routeChecklist,
    "route",
    requiredZoomRoutes,
    `${label}.routeChecklist`,
    fail,
  );
  requireUniquePassingChecklist(
    details.templateChecklist,
    "template",
    REQUIRED_ZOOM_TEMPLATES,
    `${label}.templateChecklist`,
    fail,
  );
};

const validateSchemaRichResults = (
  details,
  previewUrl,
  requiredRoutes,
  fail,
) => {
  const label = "schema-rich-results.details";
  assertExactKeys(
    details,
    ["schemaValidationResult", "richResultsResult", "blockingErrorCount", "checks"],
    label,
    fail,
  );
  if (
    details.schemaValidationResult !== "PASS" ||
    details.richResultsResult !== "PASS"
  ) {
    fail(`${label} schema and rich-results validators must both PASS.`);
  }
  requireExactCount(details.blockingErrorCount, 0, `${label}.blockingErrorCount`, fail);
  if (!Array.isArray(requiredRoutes) || requiredRoutes.length === 0) {
    fail(`${label} requires a non-empty intended route set.`);
    return;
  }
  if (!Array.isArray(details.checks) || details.checks.length !== requiredRoutes.length) {
    fail(`${label}.checks must cover the exact intended route set.`);
    return;
  }
  const expectedUrls = new Set(
    requiredRoutes.map((route) => new URL(route, previewUrl).href),
  );
  const seen = new Set();
  for (const [index, check] of details.checks.entries()) {
    const checkLabel = `${label}.checks[${index}]`;
    assertExactKeys(
      check,
      ["url", "schemaStatus", "richResultsStatus", "blockingErrorCount"],
      checkLabel,
      fail,
    );
    const parsed = requireHttpsUrl(check.url, `${checkLabel}.url`, fail);
    if (parsed && !expectedUrls.has(parsed.href)) {
      fail(`${checkLabel}.url is not an intended route on the bound preview.`);
    }
    if (parsed && seen.has(parsed.href)) fail(`${label}.checks repeats ${parsed.href}.`);
    if (parsed) seen.add(parsed.href);
    if (check.schemaStatus !== "PASS" || check.richResultsStatus !== "PASS") {
      fail(`${checkLabel} must PASS schema and rich-results validation.`);
    }
    requireExactCount(check.blockingErrorCount, 0, `${checkLabel}.blockingErrorCount`, fail);
  }
  for (const expectedUrl of expectedUrls) {
    if (!seen.has(expectedUrl)) fail(`${label}.checks is missing ${expectedUrl}.`);
  }
};

const validateLegalRetention = (
  details,
  checkedAt,
  candidateLegalDocuments,
  fail,
) => {
  const label = "legal-privacy-retention.details";
  assertExactKeys(
    details,
    [
      "legalSignoff",
      "signedAt",
      "retentionMonths",
      "deletionProcessConfirmed",
      "privacySha256",
      "termsSha256",
    ],
    label,
    fail,
  );
  if (details.legalSignoff !== "APPROVED") {
    fail(`${label}.legalSignoff must be APPROVED.`);
  }
  requireTimestampNotAfter(details.signedAt, checkedAt, `${label}.signedAt`, fail);
  requireRetention(details.retentionMonths, `${label}.retentionMonths`, fail);
  if (details.deletionProcessConfirmed !== true) {
    fail(`${label}.deletionProcessConfirmed must be true.`);
  }
  if (
    details.privacySha256 !== candidateLegalDocuments.privacy.sha256 ||
    details.termsSha256 !== candidateLegalDocuments.terms.sha256
  ) {
    fail(`${label} must bind the exact Privacy and Terms bytes sealed in the candidate.`);
  }
};

const validateOperationalPrivacy = (details, fail) => {
  const label = "operational-privacy.details";
  assertExactKeys(
    details,
    ["processors", "dataFlows", "retentionMonths", "deletionProcessConfirmed"],
    label,
    fail,
  );
  requireUniquePassingChecklist(
    details.processors,
    "name",
    REQUIRED_PRIVACY_PROCESSORS,
    `${label}.processors`,
    fail,
  );
  requireUniquePassingChecklist(
    details.dataFlows,
    "id",
    REQUIRED_PRIVACY_FLOWS,
    `${label}.dataFlows`,
    fail,
  );
  requireRetention(details.retentionMonths, `${label}.retentionMonths`, fail);
  if (details.deletionProcessConfirmed !== true) {
    fail(`${label}.deletionProcessConfirmed must be true.`);
  }
};

export const validateExternalGateDetails = (
  gateId,
  details,
  {
    checkedAt,
    previewUrl,
    requiredZoomRoutes,
    candidateIntegrations,
    candidateLegalDocuments,
    fail,
  },
) => {
  switch (gateId) {
    case "formspree-contact-delivery":
    case "formspree-inquiry-delivery":
      validateFormDelivery(gateId, details, candidateIntegrations, fail);
      break;
    case "formspree-spam-retention":
      validateSpamRetention(details, candidateIntegrations, fail);
      break;
    case "calendly-booking-cancel":
      validateCalendly(details, candidateIntegrations, fail);
      break;
    case "social-profile-ownership":
      validateSocialProfiles(details, candidateIntegrations, fail);
      break;
    case "cloudflare-pages-web-analytics":
      validateCloudflareAnalytics(
        details,
        checkedAt,
        previewUrl,
        candidateIntegrations,
        fail,
      );
      break;
    case "dns-mx-spf-dkim-dmarc":
      validateDns(details, fail);
      break;
    case "google-search-console":
      validateSearchConsole(details, fail);
      break;
    case "nvda-windows":
      validateNvda(details, fail);
      break;
    case "browser-zoom-200":
      validateZoom(details, requiredZoomRoutes, fail);
      break;
    case "schema-rich-results":
      validateSchemaRichResults(details, previewUrl, requiredZoomRoutes, fail);
      break;
    case "legal-privacy-retention":
      validateLegalRetention(details, checkedAt, candidateLegalDocuments, fail);
      break;
    case "operational-privacy":
      validateOperationalPrivacy(details, fail);
      break;
    default:
      fail(`unexpected external gate: ${gateId}`);
  }
};

const requireGateReferencePath = (referencePath, gateId, label, fail, jsonOnly = false) => {
  const prefix = `${externalGateDirectory(gateId)}/`;
  if (typeof referencePath !== "string" || !referencePath.startsWith(prefix)) {
    fail(`${label}.path must be inside ${externalGateDirectory(gateId)}/.`);
    return;
  }
  if (jsonOnly && !referencePath.endsWith(".json")) {
    fail(`${label}.path must cite one gate-specific JSON file.`);
  }
};

const resolvedRealPath = (repoRoot, referencePath) =>
  fs.realpathSync(path.resolve(repoRoot, ...referencePath.split("/")));

const validateRawCapture = ({
  gateId,
  raw,
  artifactReference,
  proof,
  fail,
}) => {
  const label = `${gateId} raw capture`;
  assertExactKeys(
    raw,
    [
      "schemaVersion",
      "gateId",
      "capturedAt",
      "redacted",
      "candidateRunId",
      "sourceCommit",
      "artifactSha256",
      "previewUrl",
      "detailsSha256",
      "observations",
    ],
    label,
    fail,
  );
  if (raw.schemaVersion !== 1) fail(`${label}.schemaVersion must be 1.`);
  if (raw.gateId !== gateId) fail(`${label}.gateId must match its gate.`);
  if (
    raw.capturedAt !== proof.checkedAt ||
    artifactReference.checkedAt !== proof.checkedAt
  ) {
    fail(`${label} timestamps must equal the proof checkedAt timestamp.`);
  }
  if (raw.redacted !== true) fail(`${label}.redacted must be true.`);
  for (const key of [
    "candidateRunId",
    "sourceCommit",
    "artifactSha256",
    "previewUrl",
  ]) {
    if (raw[key] !== proof[key]) fail(`${label}.${key} must match its proof.`);
  }
  if (
    !isSha256(raw.detailsSha256) ||
    raw.detailsSha256 !== externalGateDetailsSha256(proof.details)
  ) {
    fail(`${label}.detailsSha256 must bind the exact declared gate details.`);
  }
  if (
    (!Array.isArray(raw.observations) &&
      (!raw.observations || typeof raw.observations !== "object")) ||
    Object.keys(raw.observations).length === 0
  ) {
    fail(`${label}.observations must contain non-empty redacted structured observations.`);
  }
  const expectedObservationBindings = (() => {
    switch (gateId) {
      case "formspree-contact-delivery":
      case "formspree-inquiry-delivery":
        return {
          endpointSha256: proof.details.endpointSha256,
          tagSha256: proof.details.tagSha256,
          submissionSha256: proof.details.submissionSha256,
        };
      case "formspree-spam-retention":
        return {
          accountEvidenceSha256: proof.details.accountEvidenceSha256,
          contactEndpointSha256: proof.details.contactEndpointSha256,
          inquiryEndpointSha256: proof.details.inquiryEndpointSha256,
        };
      case "dns-mx-spf-dkim-dmarc":
        return {
          domain: proof.details.domain,
          senderDomain: proof.details.senderDomain,
          dkimSelectors: proof.details.dkimSelectors,
        };
      case "legal-privacy-retention":
        return {
          privacySha256: proof.details.privacySha256,
          termsSha256: proof.details.termsSha256,
        };
      case "schema-rich-results":
        return {
          previewOrigin: new URL(proof.previewUrl).origin,
          checkedRouteCount: proof.details.checks.length,
        };
      default:
        return {};
    }
  })();
  for (const [key, expected] of Object.entries(expectedObservationBindings)) {
    if (stableJson(raw.observations[key]) !== stableJson(expected)) {
      fail(`${label}.observations.${key} must correlate to the declared gate details.`);
    }
  }
};

export const validateExternalGateProof = ({
  entry,
  repoRoot,
  referenceTime,
  candidateRunId,
  sourceCommit,
  artifactSha256,
  previewUrl,
  requiredZoomRoutes,
  candidateIntegrations,
  candidateLegalDocuments,
  fail,
  registerReference = () => {},
}) => {
  const gateId = entry.id;
  const label = `${gateId}.evidence`;
  if (!Array.isArray(entry.evidence) || entry.evidence.length !== 1) {
    fail(`${label} must cite exactly one gate-specific JSON proof.`);
  }
  const reference = entry.evidence[0];
  requireGateReferencePath(reference?.path, gateId, `${label}[0]`, fail, true);
  if (reference?.path !== `${externalGateDirectory(gateId)}/evidence.json`) {
    fail(`${label}[0].path must be the canonical gate evidence.json file.`);
  }
  const validatedProof = validateProofRef(reference, {
    repoRoot,
    referenceTime,
    label: `${label}[0]`,
    fail,
    parseJson: true,
  });
  registerReference(validatedProof);
  const proof = validatedProof.json;
  assertExactKeys(
    proof,
    [
      "schemaVersion",
      "gateId",
      "checkedAt",
      "result",
      "redacted",
      "candidateRunId",
      "sourceCommit",
      "artifactSha256",
      "previewUrl",
      "artifacts",
      "details",
    ],
    `${gateId} proof`,
    fail,
  );
  if (proof.schemaVersion !== 1) fail(`${gateId} proof schemaVersion must be 1.`);
  if (proof.gateId !== gateId) fail(`${gateId} proof gateId does not match its gate.`);
  if (proof.result !== "PASS") fail(`${gateId} proof result must be PASS.`);
  if (proof.redacted !== true) fail(`${gateId} proof redacted must be true.`);
  if (!isIsoTimestamp(proof.checkedAt) || proof.checkedAt !== reference.checkedAt) {
    fail(`${gateId} proof checkedAt must be fresh and equal its outer reference checkedAt.`);
  }
  if (typeof proof.candidateRunId !== "string" || proof.candidateRunId !== candidateRunId) {
    fail(`${gateId} proof candidateRunId does not match the selected candidate.`);
  }
  if (!isCommit(proof.sourceCommit) || proof.sourceCommit !== sourceCommit) {
    fail(`${gateId} proof sourceCommit does not match the selected candidate.`);
  }
  if (!isSha256(proof.artifactSha256) || proof.artifactSha256 !== artifactSha256) {
    fail(`${gateId} proof artifactSha256 does not match the selected candidate.`);
  }
  if (proof.previewUrl !== previewUrl) {
    fail(`${gateId} proof previewUrl does not match the selected candidate.`);
  }
  requireHttpsUrl(proof.previewUrl, `${gateId} proof previewUrl`, fail);
  if (!Array.isArray(proof.artifacts) || proof.artifacts.length === 0) {
    fail(`${gateId} proof artifacts must contain at least one nested hashed reference.`);
  }
  const artifactPaths = new Set();
  const validatedArtifacts = [];
  for (const [index, artifactReference] of proof.artifacts.entries()) {
    const artifactLabel = `${gateId} proof artifacts[${index}]`;
    requireGateReferencePath(
      artifactReference?.path,
      gateId,
      artifactLabel,
      fail,
      true,
    );
    const artifactName = path.posix.basename(artifactReference?.path || "");
    if (
      !/^raw-capture(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?\.json$/.test(
        artifactName,
      )
    ) {
      fail(`${artifactLabel}.path must cite a completed structured raw-capture JSON file.`);
    }
    if (artifactReference?.path === reference.path) {
      fail(`${artifactLabel} cannot cite the gate proof itself.`);
    }
    if (artifactPaths.has(artifactReference?.path)) {
      fail(`${gateId} proof artifacts repeats ${artifactReference.path}.`);
    }
    artifactPaths.add(artifactReference?.path);
    const validatedArtifact = validateProofRef(artifactReference, {
      repoRoot,
      referenceTime: proof.checkedAt,
      label: artifactLabel,
      fail,
      parseJson: true,
    });
    validateRawCapture({
      gateId,
      raw: validatedArtifact.json,
      artifactReference,
      proof,
      fail,
    });
    registerReference(validatedArtifact);
    validatedArtifacts.push(validatedArtifact);
  }
  validateExternalGateDetails(gateId, proof.details, {
    checkedAt: proof.checkedAt,
    previewUrl: proof.previewUrl,
    requiredZoomRoutes,
    candidateIntegrations,
    candidateLegalDocuments,
    fail,
  });
  return {
    id: gateId,
    status: entry.status,
    proofPath: validatedProof.path,
    proofSha256: validatedProof.sha256,
    proofRealPath: resolvedRealPath(repoRoot, validatedProof.path),
    checkedAt: proof.checkedAt,
    artifactCount: validatedArtifacts.length,
    artifactPaths: [...artifactPaths],
    details: proof.details,
  };
};

export const validateExternalGateEvidence = ({
  externalGates,
  repoRoot,
  referenceTime,
  candidateRunId,
  sourceCommit,
  artifactSha256,
  previewUrl,
  requiredZoomRoutes,
  candidateIntegrations,
  candidateLegalDocuments,
  fail,
  registerReference = () => {},
}) => {
  const redaction = assertExternalEvidenceRedacted({
    repoRoot,
    relativeRoot: EXTERNAL_GATE_PROOF_ROOT,
    fail,
  });
  validateCandidateIntegrations(candidateIntegrations, fail);
  validateCandidateLegalDocuments(candidateLegalDocuments, fail);
  if (!Array.isArray(externalGates) || externalGates.length !== EXTERNAL_GATE_IDS.length) {
    fail(`externalGates must contain exactly ${EXTERNAL_GATE_IDS.length} required gates.`);
  }
  const ids = new Set();
  const realProofPaths = new Set();
  const validated = [];
  for (const entry of externalGates) {
    assertExactKeys(entry, ["id", "status", "evidence"], "external gate", fail);
    if (!EXTERNAL_GATE_IDS.includes(entry.id)) fail(`unexpected external gate: ${entry.id}`);
    if (ids.has(entry.id)) fail(`duplicate external gate: ${entry.id}`);
    ids.add(entry.id);
    if (entry.status !== "PASS") fail(`${entry.id} must be PASS.`);
    const result = validateExternalGateProof({
      entry,
      repoRoot,
      referenceTime,
      candidateRunId,
      sourceCommit,
      artifactSha256,
      previewUrl,
      requiredZoomRoutes,
      candidateIntegrations,
      candidateLegalDocuments,
      fail,
      registerReference,
    });
    if (realProofPaths.has(result.proofRealPath)) {
      fail(`${entry.id} reuses a proof file already cited by another external gate.`);
    }
    realProofPaths.add(result.proofRealPath);
    validated.push(result);
  }
  for (const id of EXTERNAL_GATE_IDS) {
    if (!ids.has(id)) fail(`externalGates is missing ${id}.`);
  }

  const citedExternalFiles = new Set(
    validated.flatMap((entry) => [entry.proofPath, ...entry.artifactPaths]),
  );
  for (const relativeFile of redaction.files) {
    if (
      relativeFile === "README.md" ||
      relativeFile === "index.json" ||
      relativeFile.endsWith("/evidence.template.json") ||
      relativeFile.endsWith("/raw-capture.template.json")
    ) {
      continue;
    }
    const taskRelativePath = `${EXTERNAL_GATE_PROOF_ROOT}/${relativeFile}`;
    if (!citedExternalFiles.has(taskRelativePath)) {
      fail(`external evidence contains uncited completed file ${taskRelativePath}.`);
    }
  }

  const contact = validated.find((entry) => entry.id === "formspree-contact-delivery");
  const inquiry = validated.find((entry) => entry.id === "formspree-inquiry-delivery");
  const formHashes = [
    contact?.details.endpointSha256,
    contact?.details.tagSha256,
    contact?.details.submissionSha256,
    inquiry?.details.endpointSha256,
    inquiry?.details.tagSha256,
    inquiry?.details.submissionSha256,
  ];
  failIf(
    new Set(formHashes).size !== formHashes.length,
    "contact and inquiry endpoint, tag, and submission hashes must all be distinct.",
    fail,
  );

  return validated;
};
