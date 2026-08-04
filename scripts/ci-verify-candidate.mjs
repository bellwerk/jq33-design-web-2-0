import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const argumentValue = (name, fallback = "") => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};

const fail = (message) => {
  console.error(`Candidate verification failed: ${message}`);
  process.exit(1);
};

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const normalized = (value) => value.split(path.sep).join("/");
const isSha256 = (value) => /^[a-f0-9]{64}$/.test(value);
const isCommit = (value) => /^[a-f0-9]{40}$/.test(value);

const parseTagAttributes = (tag) => {
  const attributes = new Map();
  const pattern = /\s([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of tag.matchAll(pattern)) {
    attributes.set(
      match[1].toLowerCase(),
      match[2] ?? match[3] ?? match[4] ?? "",
    );
  }
  return attributes;
};

const canonicalHttpsUrl = (raw, label) => {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`${label} is not a valid absolute URL.`);
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.hash
  ) {
    fail(`${label} must be a credential-free HTTPS URL without a fragment.`);
  }
  return url;
};

const socialPlatformForHost = (hostname) => {
  const normalizedHost = hostname.toLowerCase();
  const entries = [
    ["instagram", new Set(["instagram.com", "www.instagram.com"])],
    ["facebook", new Set(["facebook.com", "www.facebook.com"])],
    ["youtube", new Set(["youtube.com", "www.youtube.com"])],
    ["behance", new Set(["behance.net", "www.behance.net"])],
  ];
  return entries.find(([, hosts]) => hosts.has(normalizedHost))?.[0] || null;
};

const inspectIntegrations = (verifiedFiles) => {
  const textFiles = verifiedFiles
    .filter(({ relativePath }) => /\.(?:html|js)$/i.test(relativePath))
    .map(({ fullPath, relativePath }) => ({
      relativePath,
      text: fs.readFileSync(fullPath, "utf8"),
    }));
  const htmlFiles = textFiles.filter(({ relativePath }) =>
    relativePath.toLowerCase().endsWith(".html"),
  );
  if (htmlFiles.length === 0) {
    fail("distribution contains no public HTML documents to inspect for integrations.");
  }

  const formActions = new Map();
  for (const { relativePath, text } of htmlFiles) {
    for (const match of text.matchAll(/<form\b[^>]*>/gi)) {
      const attributes = parseTagAttributes(match[0]);
      const formName = attributes.get("data-lead-form");
      if (!formName) continue;
      if (!["contact", "inquiry"].includes(formName)) {
        fail(`${relativePath} publishes an unexpected data-lead-form value: ${formName}.`);
      }
      if (formActions.has(formName)) {
        fail(`distribution publishes more than one ${formName} lead form.`);
      }
      const action = canonicalHttpsUrl(
        attributes.get("action") || "",
        `${relativePath} ${formName} form action`,
      );
      if (
        action.hostname !== "formspree.io" ||
        !/^\/f\/[A-Za-z0-9_-]+\/?$/.test(action.pathname) ||
        action.search
      ) {
        fail(`${relativePath} ${formName} form must post to a direct Formspree endpoint.`);
      }
      formActions.set(formName, action.href);
    }
  }
  if (!formActions.has("contact") || !formActions.has("inquiry")) {
    fail("distribution must publish exactly one contact and one inquiry Formspree form.");
  }
  if (formActions.get("contact") === formActions.get("inquiry")) {
    fail("contact and inquiry Formspree endpoints must be distinct.");
  }

  const calendlyUrls = new Set();
  const calendlyPattern = /https:\/\/(?:www\.)?calendly\.com\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+/gi;
  for (const { relativePath, text } of textFiles) {
    for (const match of text.matchAll(calendlyPattern)) {
      const url = canonicalHttpsUrl(match[0], `${relativePath} Calendly URL`);
      if (
        !["calendly.com", "www.calendly.com"].includes(
          url.hostname.toLowerCase(),
        ) ||
        url.pathname.split("/").filter(Boolean).length < 2 ||
        url.search
      ) {
        fail(`${relativePath} does not contain a direct Calendly event URL.`);
      }
      calendlyUrls.add(url.href);
    }
  }
  if (calendlyUrls.size !== 1) {
    fail(
      `distribution must embed exactly one distinct direct Calendly event URL; found ${calendlyUrls.size}.`,
    );
  }
  const [calendlyUrl] = calendlyUrls;

  const socialProfiles = new Map();
  const socialPattern = /https:\/\/(?:www\.)?(?:instagram\.com|facebook\.com|youtube\.com|behance\.net)\/[^\s"'<>\\)]+/gi;
  for (const { relativePath, text } of textFiles) {
    for (const match of text.matchAll(socialPattern)) {
      const url = canonicalHttpsUrl(match[0], `${relativePath} social profile URL`);
      const platform = socialPlatformForHost(url.hostname);
      if (!platform || url.pathname.split("/").filter(Boolean).length === 0 || url.search) {
        fail(`${relativePath} contains an invalid published social profile URL.`);
      }
      const key = `${platform}\0${url.href}`;
      socialProfiles.set(key, {
        platform,
        urlSha256: sha256(url.href),
      });
    }
  }
  const profiles = [...socialProfiles.values()].sort((left, right) =>
    left.platform.localeCompare(right.platform) ||
    left.urlSha256.localeCompare(right.urlSha256),
  );
  if (new Set(profiles.map(({ platform }) => platform)).size !== profiles.length) {
    fail("distribution publishes more than one destination for a social platform.");
  }

  const analyticsTokens = new Set();
  for (const { relativePath, text } of htmlFiles) {
    const tags = [...text.matchAll(/<script\b[^>]*>/gi)].filter((match) => {
      const src = parseTagAttributes(match[0]).get("src") || "";
      return src === "https://static.cloudflareinsights.com/beacon.min.js";
    });
    if (tags.length !== 1) {
      fail(`${relativePath} must contain exactly one source-managed Cloudflare Analytics beacon.`);
    }
    const attributes = parseTagAttributes(tags[0][0]);
    let beacon;
    try {
      beacon = JSON.parse(attributes.get("data-cf-beacon") || "");
    } catch {
      fail(`${relativePath} has invalid Cloudflare Analytics beacon metadata.`);
    }
    if (
      !beacon ||
      typeof beacon !== "object" ||
      Array.isArray(beacon) ||
      Object.keys(beacon).length !== 1 ||
      !/^[a-f0-9]{32}$/i.test(String(beacon.token || ""))
    ) {
      fail(`${relativePath} has an invalid Cloudflare Analytics token.`);
    }
    analyticsTokens.add(beacon.token);
  }
  if (analyticsTokens.size !== 1) {
    fail(
      `public HTML must embed exactly one distinct Cloudflare Analytics token; found ${analyticsTokens.size}.`,
    );
  }
  const [analyticsToken] = analyticsTokens;

  return {
    formspree: {
      contactEndpointSha256: sha256(formActions.get("contact")),
      inquiryEndpointSha256: sha256(formActions.get("inquiry")),
    },
    calendly: {
      eventUrlSha256: sha256(calendlyUrl),
    },
    social: {
      publishedProfileCount: profiles.length,
      profiles,
    },
    cloudflareWebAnalytics: {
      tokenSha256: sha256(analyticsToken),
      documentCount: htmlFiles.length,
    },
  };
};

const distRoot = path.resolve(argumentValue("--dist", "dist"));
const manifestPath = path.resolve(
  argumentValue("--manifest", "dist-manifest.json"),
);
const lockfilePath = path.resolve(argumentValue("--lockfile", "pnpm-lock.yaml"));
const outputPath = path.resolve(
  argumentValue("--output", "candidate-verification.json"),
);
const expectedArtifact = argumentValue(
  "--expected-artifact",
  process.env.EXPECTED_ARTIFACT_SHA256 || "",
).toLowerCase();
const expectedCommit = argumentValue(
  "--expected-commit",
  process.env.EXPECTED_SOURCE_COMMIT || "",
).toLowerCase();
const expectedRef = argumentValue(
  "--expected-ref",
  process.env.EXPECTED_SOURCE_REF || "",
);
const requireMain = process.argv.includes("--require-main");
const expectedLockfile = argumentValue(
  "--expected-lockfile",
  process.env.EXPECTED_LOCKFILE_SHA256 || "",
).toLowerCase();

if (!fs.existsSync(distRoot) || !fs.statSync(distRoot).isDirectory()) {
  fail(`distribution directory does not exist: ${distRoot}`);
}
if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) {
  fail(`manifest does not exist: ${manifestPath}`);
}
if (!fs.existsSync(lockfilePath) || !fs.statSync(lockfilePath).isFile()) {
  fail(`lockfile does not exist: ${lockfilePath}`);
}
if (expectedArtifact && !isSha256(expectedArtifact)) {
  fail("--expected-artifact must be a lowercase SHA-256.");
}
if (expectedCommit && !isCommit(expectedCommit)) {
  fail("--expected-commit must be a lowercase 40-character commit SHA.");
}
if (expectedLockfile && !isSha256(expectedLockfile)) {
  fail("--expected-lockfile must be a lowercase SHA-256.");
}
if (requireMain && expectedRef !== "refs/heads/main") {
  fail("the production candidate ref must be refs/heads/main.");
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  fail(`manifest is not valid JSON: ${error.message}`);
}

if (
  manifest.schemaVersion !== 2 ||
  manifest.root !== "dist" ||
  !Array.isArray(manifest.files) ||
  !isSha256(String(manifest.artifactSha256 || "")) ||
  !isCommit(String(manifest.sourceRevision || "")) ||
  !isSha256(String(manifest.sourceTreeSha256 || "")) ||
  !Number.isSafeInteger(manifest.sourceInputCount) ||
  manifest.sourceInputCount < 1 ||
  manifest.sourceDirty !== false ||
  manifest.sourceChangeCount !== 0
) {
  fail(
    "manifest must use immutable schema v2 and bind a clean declared production source tree.",
  );
}
if (expectedCommit && manifest.sourceRevision !== expectedCommit) {
  fail(
    `manifest sourceRevision ${manifest.sourceRevision} does not match ${expectedCommit}.`,
  );
}

const manifestByPath = new Map();
for (const entry of manifest.files) {
  if (
    !entry ||
    typeof entry.path !== "string" ||
    !Number.isSafeInteger(entry.bytes) ||
    entry.bytes < 0 ||
    !isSha256(String(entry.sha256 || ""))
  ) {
    fail("manifest contains an invalid file record.");
  }
  if (
    entry.path.startsWith("/") ||
    entry.path.includes("\\") ||
    entry.path.split("/").some((part) => part === ".." || part === "")
  ) {
    fail(`manifest contains an unsafe file path: ${entry.path}`);
  }
  if (manifestByPath.has(entry.path)) {
    fail(`manifest contains duplicate file path: ${entry.path}`);
  }
  manifestByPath.set(entry.path, entry);
}

const diskFiles = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    const relativePath = normalized(path.relative(distRoot, fullPath));
    if (entry.isSymbolicLink()) {
      fail(`distribution contains a symbolic link: ${relativePath}`);
    }
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.isFile()) diskFiles.push({ fullPath, relativePath });
    else fail(`distribution contains a non-regular entry: ${relativePath}`);
  }
};
walk(distRoot);

const diskPaths = new Set(diskFiles.map(({ relativePath }) => relativePath));
for (const manifestPathValue of manifestByPath.keys()) {
  if (!diskPaths.has(manifestPathValue)) {
    fail(`manifest file is missing from dist: ${manifestPathValue}`);
  }
}
for (const { relativePath } of diskFiles) {
  if (!manifestByPath.has(relativePath)) {
    fail(`dist contains a file absent from the manifest: ${relativePath}`);
  }
}

const recomputedFiles = diskFiles
  .map(({ fullPath, relativePath }) => {
    const buffer = fs.readFileSync(fullPath);
    const record = {
      path: relativePath,
      bytes: buffer.length,
      sha256: sha256(buffer),
    };
    const expected = manifestByPath.get(relativePath);
    if (
      expected.bytes !== record.bytes ||
      expected.sha256 !== record.sha256
    ) {
      fail(`file bytes do not match the manifest: ${relativePath}`);
    }
    return record;
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const artifactSha256 = sha256(
  recomputedFiles
    .map((entry) => `${entry.path}\0${entry.bytes}\0${entry.sha256}\n`)
    .join(""),
);
if (artifactSha256 !== manifest.artifactSha256) {
  fail(
    `recomputed artifact ${artifactSha256} does not match manifest ${manifest.artifactSha256}.`,
  );
}
if (expectedArtifact && artifactSha256 !== expectedArtifact) {
  fail(
    `recomputed artifact ${artifactSha256} does not match expected ${expectedArtifact}.`,
  );
}

const lockfileSha256 = sha256(fs.readFileSync(lockfilePath));
if (expectedLockfile && lockfileSha256 !== expectedLockfile) {
  fail(
    `lockfile ${lockfileSha256} does not match expected ${expectedLockfile}.`,
  );
}

const integrations = inspectIntegrations(diskFiles);
const legalDocumentDefinitions = {
  privacy: { route: "/privacy/", artifactPath: "privacy/index.html" },
  terms: { route: "/terms/", artifactPath: "terms/index.html" },
};
const legalDocuments = Object.fromEntries(
  Object.entries(legalDocumentDefinitions).map(([name, definition]) => {
    const record = recomputedFiles.find(
      ({ path: relativePath }) => relativePath === definition.artifactPath,
    );
    if (!record) {
      fail(`required legal document is missing from the candidate: ${definition.artifactPath}`);
    }
    return [
      name,
      {
        route: definition.route,
        artifactPath: definition.artifactPath,
        sha256: record.sha256,
      },
    ];
  }),
);

const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  result: "PASS",
  source: {
    commit: manifest.sourceRevision,
    ref: expectedRef || null,
    lockfileSha256,
    sourceTreeSha256: manifest.sourceTreeSha256,
    sourceInputCount: manifest.sourceInputCount,
    sourceDirty: manifest.sourceDirty,
    sourceChangeCount: manifest.sourceChangeCount,
  },
  artifact: {
    sha256: artifactSha256,
    manifestSha256: sha256(fs.readFileSync(manifestPath)),
    fileCount: recomputedFiles.length,
  },
  integrations,
  legalDocuments,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  `Candidate verification passed: ${recomputedFiles.length} files, artifact ${artifactSha256}.`,
);
