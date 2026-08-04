import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  argumentValue,
  getAttribute,
  hasAttribute,
  htmlDocuments,
  requireDirectory,
  resolveDistRoot,
  tags,
} from "../tests/helpers/site.mjs";

const fail = (message) => {
  console.error(`Manual Cloudflare Web Analytics validation failed: ${message}`);
  process.exit(1);
};
const distRoot = resolveDistRoot();
const outputPath = path.resolve(
  argumentValue(
    "--output",
    ".agent/tasks/jq33-production-readiness-2026-07-29/raw/ci-build/manual-cloudflare-analytics.json",
  ),
);
const beaconSource = "https://static.cloudflareinsights.com/beacon.min.js";
const tokenPattern = /^[A-Za-z0-9_-]{16,128}$/;
const placeholderPattern = /(?:your[_ -]?token|replace|placeholder|example|changeme)/i;

requireDirectory(distRoot, "Built artifact");
const documents = htmlDocuments(distRoot, true);
const records = [];

for (const document of documents) {
  const scriptTags = tags(document.html, "script");
  const cloudflareTags = scriptTags.filter((tag) => {
    const src = getAttribute(tag, "src");
    try {
      return new URL(src).hostname === "static.cloudflareinsights.com";
    } catch {
      return false;
    }
  });
  const beaconTags = cloudflareTags.filter(
    (tag) => getAttribute(tag, "src") === beaconSource,
  );
  if (cloudflareTags.length !== 1 || beaconTags.length !== 1) {
    fail(
      `${document.relativePath} must contain exactly one source-managed ${beaconSource} script and no other Cloudflare Insights script.`,
    );
  }
  const tag = beaconTags[0];
  if (!hasAttribute(tag, "defer")) {
    fail(`${document.relativePath} Cloudflare beacon must use defer.`);
  }
  const encodedConfiguration = getAttribute(tag, "data-cf-beacon");
  let configuration;
  try {
    configuration = JSON.parse(encodedConfiguration);
  } catch (error) {
    fail(`${document.relativePath} data-cf-beacon is not valid JSON: ${error.message}`);
  }
  const token = String(configuration?.token || "").trim();
  if (!tokenPattern.test(token) || placeholderPattern.test(token)) {
    fail(`${document.relativePath} data-cf-beacon lacks a non-placeholder public site token.`);
  }
  records.push({
    route: document.route,
    relativePath: document.relativePath,
    source: beaconSource,
    defer: true,
    tokenSha256: crypto.createHash("sha256").update(token).digest("hex"),
  });
}
if (new Set(records.map((record) => record.tokenSha256)).size !== 1) {
  fail("all built documents must use the same Cloudflare Web Analytics site token.");
}

const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  result: "PASS",
  scope: "source-managed-cloudflare-web-analytics",
  automaticHtmlInjectionRequiredState: "disabled",
  distRoot,
  documentCount: records.length,
  records,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  `Source-managed Cloudflare Web Analytics is present on ${records.length} built documents; automatic edge injection must remain disabled.`,
);
