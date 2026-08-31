import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_EXTERNAL_ROOT =
  ".agent/tasks/jq33-production-readiness-2026-07-29/raw/external";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const EXTERNAL_GATE_IDS = new Set([
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
const REDACTED_VALUES = new Set([
  "",
  "***",
  "<redacted>",
  "[redacted]",
  "redacted",
]);
const SENSITIVE_JSON_KEYS = new Set([
  "apikey",
  "authorization",
  "address",
  "business",
  "businessname",
  "client",
  "company",
  "companyname",
  "contact",
  "contactemail",
  "contactname",
  "cookie",
  "customeremail",
  "customer",
  "customername",
  "email",
  "emailaddress",
  "firstname",
  "formdata",
  "formpayload",
  "fullname",
  "inboxaddress",
  "inbox",
  "lastname",
  "lead",
  "leaddata",
  "leademail",
  "leadname",
  "message",
  "password",
  "person",
  "phone",
  "phonenumber",
  "projectconstraints",
  "projectgoals",
  "qainbox",
  "qaemail",
  "recipient",
  "recipientemail",
  "secret",
  "streetaddress",
  "submissionbody",
  "token",
]);

const normalizeKey = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
const displayPath = (root, filePath) =>
  path.relative(root, filePath).split(path.sep).join("/") || ".";

const failDefault = (message) => {
  throw new Error(message);
};

const isRedactedValue = (value) =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && REDACTED_VALUES.has(value.trim().toLowerCase()));

const inspectJsonValue = (value, fileLabel, jsonPath, fail) => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      inspectJsonValue(entry, fileLabel, `${jsonPath}[${index}]`, fail),
    );
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && /\s/.test(value)) {
      fail(
        `${fileLabel} contains free-form text at ${jsonPath}; external JSON evidence must use redacted structured identifiers without whitespace.`,
      );
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    const childPath = `${jsonPath}.${key}`;
    const hashIdentity = normalizedKey.endsWith("sha256");
    const credentialKey =
      /(?:apikey|authorization|credential|password|secret|token)$/.test(
        normalizedKey,
      );
    if (
      !hashIdentity &&
      (SENSITIVE_JSON_KEYS.has(normalizedKey) || credentialKey) &&
      !isRedactedValue(child)
    ) {
      fail(
        `${fileLabel} contains prohibited PII/secret field ${childPath}; store only a SHA-256 identity or a redacted placeholder.`,
      );
    }
    inspectJsonValue(child, fileLabel, childPath, fail);
  }
};

const TEXT_LEAK_PATTERNS = Object.freeze([
  {
    label: "email address",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    label: "phone number",
    pattern: /(?:\+\s*\d[\d .()-]{6,}\d)|(?:\b\d{3}[-. ]\d{3}[-. ]\d{4}\b)/,
  },
  {
    label: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  },
  {
    label: "authorization credential",
    pattern: /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=-]{8,}/i,
  },
  {
    label: "JWT",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  {
    label: "provider/API token",
    pattern:
      /\b(?:gh[opsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_(?:live|test)_[A-Za-z0-9]{12,}|pk_live_[A-Za-z0-9]{12,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[A-Z0-9]{16})\b/,
  },
  {
    label: "raw Formspree endpoint",
    pattern: /https:\/\/(?:www\.)?formspree\.io\/f\/[A-Za-z0-9_-]+/i,
  },
  {
    label: "Cloudflare beacon token",
    pattern: /data-cf-beacon\s*=|cloudflare[^\r\n]{0,40}\btoken\s*[:=]/i,
  },
]);

const inspectText = (text, fileLabel, extension, fail) => {
  for (const { label, pattern } of TEXT_LEAK_PATTERNS) {
    if (pattern.test(text)) {
      fail(`${fileLabel} contains a prohibited ${label}; redact it and retain only a SHA-256 identity.`);
    }
  }
  if (extension !== ".json") {
    const credentialAssignment =
      /\b(api[_ -]?key|authorization|cookie|password|secret|token)\b\s*[:=]\s*["']?(?!redacted\b|<redacted>|\[redacted\]|\*\*\*)[^\s,"'}]{6,}/i;
    if (credentialAssignment.test(text)) {
      fail(`${fileLabel} contains a credential-like assignment.`);
    }
  }
};

const collectFiles = (root, current, files, fail) => {
  const entries = fs.readdirSync(current, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(current, entry.name);
    if (entry.isSymbolicLink()) {
      fail(`${displayPath(root, filePath)} is a symlink; external evidence must be regular in-repository files.`);
    }
    if (entry.isDirectory()) collectFiles(root, filePath, files, fail);
    else if (entry.isFile()) files.push(filePath);
    else fail(`${displayPath(root, filePath)} is not a regular file.`);
  }
};

const requireAllowedEvidencePath = (fileLabel, fail) => {
  if (fileLabel === "README.md" || fileLabel === "index.json") return;
  const parts = fileLabel.split("/");
  if (parts.length !== 2 || !EXTERNAL_GATE_IDS.has(parts[0])) {
    fail(`${fileLabel} is outside a required gate directory.`);
  }
  const fileName = parts[1];
  if (
    fileName !== "evidence.json" &&
    fileName !== "evidence.template.json" &&
    fileName !== "raw-capture.json" &&
    fileName !== "raw-capture.template.json" &&
    !/^raw-capture-[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(fileName)
  ) {
    fail(`${fileLabel} is not an allowed proof, template, or structured raw-capture filename.`);
  }
};

export const assertExternalEvidenceRedacted = ({
  repoRoot = process.cwd(),
  relativeRoot = DEFAULT_EXTERNAL_ROOT,
  fail = failDefault,
  requireExisting = true,
} = {}) => {
  const root = path.resolve(repoRoot, ...relativeRoot.split("/"));
  if (!fs.existsSync(root)) {
    if (requireExisting) fail(`external evidence directory does not exist: ${relativeRoot}`);
    return { root: relativeRoot, fileCount: 0, bytes: 0 };
  }
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail(`external evidence root must be a regular directory: ${relativeRoot}`);
  }
  const realRepo = fs.realpathSync(path.resolve(repoRoot));
  const realRoot = fs.realpathSync(root);
  const relativeToRepo = path.relative(realRepo, realRoot);
  if (
    relativeToRepo === "" ||
    relativeToRepo === ".." ||
    relativeToRepo.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToRepo)
  ) {
    fail(`external evidence root resolves outside the repository: ${relativeRoot}`);
  }

  const files = [];
  collectFiles(realRoot, realRoot, files, fail);
  if (files.length === 0) fail("external evidence directory is empty.");
  let totalBytes = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const filePath of files) {
    const fileLabel = displayPath(realRoot, filePath);
    const extension = path.extname(filePath).toLowerCase();
    inspectText(fileLabel, `${fileLabel} path`, ".txt", fail);
    requireAllowedEvidencePath(fileLabel, fail);
    if (extension !== ".json" && fileLabel !== "README.md") {
      fail(
        `${fileLabel} has unsupported ${extension || "extensionless"} content; only JSON plus the generated root README.md are allowed.`,
      );
    }
    const bytes = fs.readFileSync(filePath);
    totalBytes += bytes.length;
    if (bytes.length > MAX_FILE_BYTES) {
      fail(`${fileLabel} exceeds the ${MAX_FILE_BYTES}-byte evidence limit.`);
    }
    if (bytes.includes(0)) fail(`${fileLabel} contains binary NUL bytes.`);
    let text;
    try {
      text = decoder.decode(bytes);
    } catch {
      fail(`${fileLabel} is not valid UTF-8 text.`);
    }
    inspectText(text, fileLabel, extension, fail);
    if (extension === ".json") {
      let json;
      try {
        json = JSON.parse(text);
      } catch (error) {
        fail(`${fileLabel} is not valid JSON: ${error.message}`);
      }
      inspectJsonValue(json, fileLabel, "$", fail);
    }
  }
  return {
    root: relativeRoot,
    fileCount: files.length,
    bytes: totalBytes,
    files: files.map((filePath) => displayPath(realRoot, filePath)),
  };
};

const write = (root, relativePath, value, encoding = "utf8") => {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, encoding);
};

const runSelfTest = () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jq33-redaction-"));
  const relativeRoot = "raw/external";
  const root = path.join(temporaryRoot, "raw", "external");
  try {
    write(
      root,
      "formspree-contact-delivery/evidence.json",
      `${JSON.stringify({
        redacted: true,
        endpointSha256: "a".repeat(64),
        note: "redacted",
      })}\n`,
    );
    assert.equal(
      assertExternalEvidenceRedacted({ repoRoot: temporaryRoot, relativeRoot }).fileCount,
      1,
    );

    const negativeCases = [
      ["email.json", { qaEmail: "person@example.com" }],
      ["lead.json", { leadData: { fullName: "Example Person" } }],
      ["token.txt", "token=super-secret-value"],
      ["endpoint.txt", "https://formspree.io/f/secret123"],
      ["phone.txt", "+1 514 555 0101"],
    ];
    for (const [name, value] of negativeCases) {
      const caseRoot = path.join(temporaryRoot, `case-${name.replace(/\W/g, "-")}`);
      const caseRelativeRoot = "raw/external";
      const caseExternalRoot = path.join(caseRoot, "raw", "external");
      write(
        caseExternalRoot,
        `formspree-contact-delivery/raw-capture.${name.endsWith(".json") ? "json" : "template.json"}`,
        typeof value === "string" ? value : `${JSON.stringify(value)}\n`,
      );
      assert.throws(() =>
        assertExternalEvidenceRedacted({
          repoRoot: caseRoot,
          relativeRoot: caseRelativeRoot,
        }),
      );
    }

    const piiPathRoot = path.join(temporaryRoot, "pii-path");
    write(
      path.join(piiPathRoot, "raw", "external"),
      "formspree-contact-delivery/person@example.com.json",
      "{}\n",
    );
    assert.throws(() =>
      assertExternalEvidenceRedacted({ repoRoot: piiPathRoot, relativeRoot }),
    );

    const binaryRoot = path.join(temporaryRoot, "binary");
    write(path.join(binaryRoot, "raw", "external"), "formspree-contact-delivery/raw-capture.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]), undefined);
    assert.throws(() =>
      assertExternalEvidenceRedacted({ repoRoot: binaryRoot, relativeRoot }),
    );
    console.log(
      "External evidence redaction self-test passed: safe structured evidence accepted; PII, credentials, provider endpoints, phones, and binary artifacts rejected.",
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
};

const parseArguments = () => {
  const options = { repoRoot: process.cwd(), relativeRoot: DEFAULT_EXTERNAL_ROOT, selfTest: false };
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--repo-root") options.repoRoot = process.argv[++index] || "";
    else if (argument === "--root") options.relativeRoot = process.argv[++index] || "";
    else failDefault(`unknown argument: ${argument}`);
  }
  return options;
};

const main = () => {
  const options = parseArguments();
  if (options.selfTest) {
    runSelfTest();
    return;
  }
  const result = assertExternalEvidenceRedacted({
    repoRoot: path.resolve(options.repoRoot),
    relativeRoot: options.relativeRoot,
  });
  console.log(
    `External evidence redaction passed: ${result.fileCount} files, ${result.bytes} bytes, no detected PII/secrets or unsupported binary content.`,
  );
};

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) main();
