import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repositoryRoot = path.resolve(__dirname, "..");
const canonicalOrigin = "https://jq33.design";
const projectSlugs = [
  "bruton-place-iv",
  "ethereal-gallery",
  "obsidian-lounge",
  "vortex-showroom",
  "canvas-studios",
];
const publicRoutes = [
  "/",
  "/commercial-interior-design-montreal/",
  "/projects/",
  ...projectSlugs.map((slug) => `/projects/${slug}/`),
  "/journal/",
  "/journal/reduction-as-creation/",
  "/contact/",
  "/inquiry/",
  "/privacy/",
  "/terms/",
];

const argumentValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};

const distRoot = path.resolve(argumentValue("--root", path.join(repositoryRoot, "dist")));
const manifestTargetValue = argumentValue("--write-manifest", "");
const manifestTarget = manifestTargetValue ? path.resolve(manifestTargetValue) : "";
const allowTestFixtures = process.argv.includes("--allow-test-fixtures");
const failures = [];
const cloudflareBeaconUrl = "https://static.cloudflareinsights.com/beacon.min.js";
const normalized = (value) => value.split(path.sep).join("/");
const inlineCriticalStyleDocuments = new Set([
  "index.html",
  "commercial-interior-design-montreal/index.html",
  "journal/index.html",
]);

const requiredExactFiles = new Set([
  "index.html",
  "commercial-interior-design-montreal/index.html",
  "projects/index.html",
  ...projectSlugs.map((slug) => `projects/${slug}/index.html`),
  "journal/index.html",
  "journal/reduction-as-creation/index.html",
  "contact/index.html",
  "inquiry/index.html",
  "privacy/index.html",
  "terms/index.html",
  "404.html",
  "robots.txt",
  "sitemap.xml",
  "favicon.svg",
  "apple-touch-icon.svg",
  "tokens.css",
  "assets/css/site.css",
  "_redirects",
  "_headers",
]);

const permittedScripts = new Set([
  "assets/js/leads.js",
  "assets/js/calendly.js",
  "assets/js/cloudflare-analytics.js",
  "assets/js/deferred-css.js",
  "assets/js/nav-drawer.js",
  "assets/js/components/header-nav.js",
  "assets/js/components/footer.js",
]);

const permittedAssetPath = (relativePath) => {
  if (requiredExactFiles.has(relativePath) || permittedScripts.has(relativePath)) return true;
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (
    /^assets\/fonts\/[^/]+\/[^/]+$/.test(relativePath) &&
    [".woff", ".woff2", ".ttf", ".otf"].includes(extension)
  ) {
    return true;
  }
  if (
    /^assets\/(?:home page images|journal|logo|projects)\/.+/.test(relativePath) &&
    [".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"].includes(extension)
  ) {
    return true;
  }
  if (
    /^assets\/(?:icons|social)\/[^/]+\.svg$/.test(relativePath)
  ) {
    return true;
  }
  if (/^assets\/generated\/[a-f0-9]{64}\.(?:css|js)$/.test(relativePath)) {
    return true;
  }
  if (
    /^assets\/generated\/images\/[a-z0-9]+(?:-[a-z0-9]+)*-[0-9]+\.webp$/.test(
      relativePath,
    )
  ) {
    return true;
  }
  return (
    /^og\/[^/]+$/.test(relativePath) &&
    [".avif", ".jpg", ".jpeg", ".png", ".webp"].includes(extension)
  );
};

const walk = (directory, files = []) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    const relativePath = normalized(path.relative(distRoot, fullPath));
    if (entry.isSymbolicLink()) {
      failures.push(`${relativePath} is a symbolic link or junction.`);
    } else if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile()) {
      files.push({ fullPath, relativePath });
    } else {
      failures.push(`${relativePath} is not a regular file.`);
    }
  }
  return files;
};

if (!fs.existsSync(distRoot) || !fs.statSync(distRoot).isDirectory()) {
  console.error(`Distribution directory does not exist: ${distRoot}`);
  process.exit(1);
}
if (manifestTarget && (manifestTarget === distRoot || manifestTarget.startsWith(`${distRoot}${path.sep}`))) {
  console.error("The artifact manifest must be written outside dist.");
  process.exit(1);
}

const files = walk(distRoot);
const fileSet = new Set(files.map(({ relativePath }) => relativePath));

for (const requiredFile of requiredExactFiles) {
  if (!fileSet.has(requiredFile)) failures.push(`Missing required distribution file: ${requiredFile}`);
}
for (const { relativePath } of files) {
  if (!permittedAssetPath(relativePath)) {
    failures.push(`File is outside the public distribution allowlist: ${relativePath}`);
  }
  if (
    /(^|\/)(?:admin|data|functions|scripts|supabase|templates?)(?:\/|$)/i.test(relativePath) ||
    /(?:^|\/)_(?:journal|project)/i.test(relativePath) ||
    /(?:^|\/)project\.html$/i.test(relativePath) ||
    /\.map$/i.test(relativePath)
  ) {
    failures.push(`Development-only file is forbidden in dist: ${relativePath}`);
  }
}

const textFile = ({ relativePath }) =>
  [".css", ".html", ".js", ".svg", ".txt", ".xml"].includes(
    path.posix.extname(relativePath).toLowerCase(),
  ) || ["_headers", "_redirects"].includes(relativePath);

const prohibitedText = [
  { pattern: /{{[^{}\r\n]+}}/, label: "unresolved build token" },
  { pattern: /__(?:SUPABASE|FORM|CALENDLY|SOCIAL|PUBLIC|RUNTIME)[A-Z0-9_]*__/, label: "unresolved config token" },
  { pattern: /\bsupabase\b/i, label: "dead Supabase integration" },
  { pattern: /portfolio-(?:admin|detail)\.js/i, label: "dead portfolio runtime" },
  { pattern: /(?:generate-)?runtime-config/i, label: "dead runtime config" },
  { pattern: /googletagmanager|google-analytics|gtag\s*\(/i, label: "non-Cloudflare analytics" },
  { pattern: /images\.unsplash\.com|unsplash\.com/i, label: "remote Unsplash fallback" },
  { pattern: /PUBLIC_(?:SUPABASE|LEAD_FUNCTION|ADMIN_UPLOAD|FORM_FALLBACK|GA_MEASUREMENT)/, label: "runtime environment integration" },
  { pattern: /\/functions\/|lead-intake|admin-portfolio-upload/i, label: "backend function integration" },
  { pattern: /SUPABASE_SERVICE_ROLE_KEY|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i, label: "secret material" },
  { pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/, label: "JWT-like credential" },
  { pattern: /sourceMappingURL\s*=/i, label: "source map reference" },
];
const generatedHeaders = fs.readFileSync(path.join(distRoot, "_headers"), "utf8");

for (const file of files.filter(textFile)) {
  const content = fs.readFileSync(file.fullPath, "utf8");
  if (!allowTestFixtures && /\bjq33-(?:contact|inquiry|test)-fixture\b/i.test(content)) {
    failures.push(`${file.relativePath} contains a local QA integration fixture.`);
  }
  for (const { pattern, label } of prohibitedText) {
    if (pattern.test(content)) failures.push(`${file.relativePath} contains ${label}.`);
  }
  if (file.relativePath.endsWith(".html")) {
    const inlineStyles = [
      ...content.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi),
    ];
    if (inlineStyles.length) {
      if (
        !inlineCriticalStyleDocuments.has(file.relativePath) ||
        inlineStyles.length !== 1 ||
        inlineStyles[0][1].trim() !== "data-jq33-critical-bundle" ||
        !inlineStyles[0][2].trim()
      ) {
        failures.push(`${file.relativePath} contains a non-approved inline style block.`);
      } else {
        // Browsers normalize inline element line endings before CSP hashing.
        // Mirror that behavior so Windows CRLF artifacts cannot pass this
        // check with a hash the browser will reject.
        const browserVisibleStyle = inlineStyles[0][2].replace(/\r\n?/g, "\n");
        const cspHash = `'sha256-${crypto
          .createHash("sha256")
          .update(browserVisibleStyle, "utf8")
          .digest("base64")}'`;
        if (!generatedHeaders.includes(cspHash)) {
          failures.push(
            `${file.relativePath} critical style hash is missing from the generated CSP.`,
          );
        }
      }
    } else if (inlineCriticalStyleDocuments.has(file.relativePath)) {
      failures.push(`${file.relativePath} is missing its approved critical style bundle.`);
    }
    if (/\sstyle\s*=/i.test(content)) failures.push(`${file.relativePath} contains an inline style attribute.`);
    if (/\son[a-z]+\s*=/i.test(content)) failures.push(`${file.relativePath} contains an inline event handler.`);
    if (/\svid\s*=/i.test(content)) failures.push(`${file.relativePath} contains a development vid attribute.`);
    for (const match of content.matchAll(/<script\b((?![^>]*\bsrc\s*=)[^>]*)>/gi)) {
      if (!/\btype\s*=\s*(["'])application\/ld\+json\1/i.test(match[1])) {
        failures.push(`${file.relativePath} contains an executable inline script.`);
      }
    }
  }
}

const htmlFiles = files.filter(
  (file) => path.posix.extname(file.relativePath).toLowerCase() === ".html",
);
const analyticsTokens = new Set();
for (const file of htmlFiles) {
  const html = fs.readFileSync(file.fullPath, "utf8");
  const beaconTags = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])\/assets\/js\/cloudflare-analytics\.js\1[^>]*><\/script>/gi)];

  if (allowTestFixtures) {
    if (beaconTags.length) {
      failures.push(`${file.relativePath} must not emit analytics traffic in a test-fixture build.`);
    }
    continue;
  }

  if (beaconTags.length !== 1) {
    failures.push(`${file.relativePath} must contain exactly one source-managed Cloudflare Web Analytics loader.`);
    continue;
  }
  const tag = beaconTags[0][0];
  if (!/\bdefer(?:\s|>|=)/i.test(tag)) {
    failures.push(`${file.relativePath} Cloudflare Web Analytics loader must be deferred.`);
  }
  if (!new RegExp(`\\bdata-beacon-src\\s*=\\s*(["'])${cloudflareBeaconUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1`, "i").test(tag)) {
    failures.push(`${file.relativePath} Cloudflare Web Analytics loader lacks the canonical beacon URL.`);
  }
  const dataMatch = /\bdata-cf-beacon\s*=\s*(["'])(.*?)\1/i.exec(tag);
  if (!dataMatch) {
    failures.push(`${file.relativePath} Cloudflare Web Analytics beacon lacks data-cf-beacon.`);
    continue;
  }
  let config;
  try {
    config = JSON.parse(dataMatch[2].replace(/&quot;/g, '"'));
  } catch (error) {
    failures.push(`${file.relativePath} has invalid data-cf-beacon JSON: ${error.message}`);
    continue;
  }
  const token = String(config?.token || "");
  if (!/^[a-f0-9]{32}$/i.test(token) || /^0+$/.test(token)) {
    failures.push(`${file.relativePath} has a missing or placeholder Cloudflare Web Analytics token.`);
  } else {
    analyticsTokens.add(token);
  }
}
if (!allowTestFixtures && analyticsTokens.size !== 1) {
  failures.push("All public HTML documents and 404 must use the same Cloudflare Web Analytics token.");
}
if (!allowTestFixtures) {
  const loader = fs.readFileSync(
    path.join(distRoot, "assets/js/cloudflare-analytics.js"),
    "utf8",
  );
  if (
    !/location\.hostname\s*===\s*["']jq33\.design["']/.test(loader) ||
    !/beacon\.src\s*=\s*loader\.dataset\.beaconSrc/.test(loader) ||
    !/beacon\.dataset\.cfBeacon\s*=\s*loader\.dataset\.cfBeacon/.test(loader)
  ) {
    failures.push("Cloudflare Web Analytics must be host-gated to jq33.design.");
  }
}

const redirects = fs
  .readFileSync(path.join(distRoot, "_redirects"), "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => line.split(/\s+/))
  .filter((parts) => parts.length >= 2);
const redirectSources = new Set(
  redirects
    .map(([source]) => source)
    .filter((source) => source.startsWith("/")),
);

const targetExists = (pathname) => {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (decoded === "/") return fileSet.has("index.html");
  if (redirectSources.has(decoded)) return true;
  const relativePath = decoded.replace(/^\/+/, "");
  if (fileSet.has(relativePath)) return true;
  if (decoded.endsWith("/")) return fileSet.has(`${relativePath}index.html`);
  return fileSet.has(`${relativePath}/index.html`);
};

const checkReference = (reference, file, kind) => {
  const value = reference.trim();
  if (
    !value ||
    value.includes("${") ||
    value.includes("{{") ||
    /^(?:#|data:|mailto:|tel:|javascript:)/i.test(value)
  ) {
    return;
  }

  let pathname = "";
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.origin === canonicalOrigin) {
      pathname = url.pathname;
    } else {
      if (
        ["src", "data-img", "css-url"].includes(kind) &&
        !/^https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js$/i.test(value)
      ) {
        failures.push(`${file.relativePath} uses a remote ${kind} resource: ${value}`);
      }
      return;
    }
  } else if (value.startsWith("//")) {
    failures.push(`${file.relativePath} uses a protocol-relative resource: ${value}`);
    return;
  } else {
    pathname = value.split(/[?#]/, 1)[0];
    if (!pathname.startsWith("/")) {
      const baseDirectory = path.posix.dirname(`/${file.relativePath}`);
      pathname = path.posix.resolve(baseDirectory, pathname);
    }
  }

  if (!targetExists(pathname)) {
    failures.push(`${file.relativePath} references missing local target ${pathname}.`);
  }
};

for (const file of files.filter(textFile)) {
  const content = fs.readFileSync(file.fullPath, "utf8");
  for (const match of content.matchAll(/\b(src|href|action|data-img)\s*=\s*(["'])(.*?)\2/gi)) {
    checkReference(match[3], file, match[1].toLowerCase());
  }
  for (const match of content.matchAll(/\b(?:srcset|imagesrcset)\s*=\s*(["'])(.*?)\1/gi)) {
    for (const candidate of match[2].split(",")) {
      checkReference(candidate.trim().split(/\s+/, 1)[0], file, "src");
    }
  }
  if ([".css", ".html"].includes(path.posix.extname(file.relativePath).toLowerCase())) {
    for (const match of content.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
      checkReference(match[2], file, "css-url");
    }
  }
}

const headers = fs.readFileSync(path.join(distRoot, "_headers"), "utf8");
const csp = /Content-Security-Policy:\s*([^\r\n]+)/i.exec(headers)?.[1] || "";
for (const directive of [
  "default-src",
  "script-src",
  "style-src",
  "connect-src",
  "img-src",
  "font-src",
  "form-action",
  "frame-ancestors",
  "object-src",
  "base-uri",
]) {
  if (!new RegExp(`(?:^|;)\\s*${directive}\\s+`, "i").test(csp)) {
    failures.push(`_headers CSP is missing ${directive}.`);
  }
}
if (/'unsafe-inline'|'unsafe-eval'/i.test(csp)) {
  failures.push("_headers CSP may not contain unsafe-inline or unsafe-eval.");
}
if (!/frame-ancestors\s+'none'/i.test(csp)) failures.push("_headers must deny framing in CSP.");
if (!/X-Frame-Options:\s*DENY/i.test(headers)) failures.push("_headers must include X-Frame-Options: DENY.");
if (!/Strict-Transport-Security:\s*max-age=(?:31536000|[4-9]\d{7,});\s*includeSubDomains/i.test(headers)) {
  failures.push("_headers HSTS must cover at least one year and include subdomains.");
}
if (/Strict-Transport-Security:[^\r\n]*\bpreload\b/i.test(headers)) {
  failures.push("_headers HSTS may not request preload.");
}
for (const pattern of [
  /X-Content-Type-Options:\s*nosniff/i,
  /Referrer-Policy:\s*(?:no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin)/i,
  /Permissions-Policy:\s*[^\r\n]+/i,
]) {
  if (!pattern.test(headers)) failures.push(`_headers is missing required security header ${pattern}.`);
}

const notFoundHtml = fs.readFileSync(path.join(distRoot, "404.html"), "utf8");
if (!/<html\b[^>]*\blang=["']en-CA["']/i.test(notFoundHtml)) {
  failures.push("404.html must declare the sole en-CA locale.");
}
if (!/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(notFoundHtml)) {
  failures.push("404.html must include a noindex robots directive.");
}
if (/<link\b[^>]*rel=["']canonical["']/i.test(notFoundHtml)) {
  failures.push("404.html must not publish an indexable canonical URL.");
}

for (const route of publicRoutes) {
  const relativePath =
    route === "/" ? "index.html" : `${route.replace(/^\/|\/$/g, "")}/index.html`;
  const html = fs.readFileSync(path.join(distRoot, relativePath), "utf8");
  if (!/<html\b[^>]*\blang=["']en-CA["']/i.test(html)) {
    failures.push(`${relativePath} must declare the sole en-CA locale.`);
  }
  const canonicals = [
    ...html.matchAll(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/gi),
  ].map((match) => match[1]);
  const expectedCanonical = `${canonicalOrigin}${route}`;
  if (canonicals.length !== 1 || canonicals[0] !== expectedCanonical) {
    failures.push(`${relativePath} must contain exactly one canonical URL: ${expectedCanonical}`);
  }
}

const contactHtml = fs.readFileSync(path.join(distRoot, "contact/index.html"), "utf8");
const inquiryHtml = fs.readFileSync(path.join(distRoot, "inquiry/index.html"), "utf8");
const formAction = (html) => /<form\b[^>]*\baction=["']([^"']+)["'][^>]*>/i.exec(html)?.[1] || "";
const contactAction = formAction(contactHtml);
const inquiryAction = formAction(inquiryHtml);
const validFormAction = (value) => {
  if (/^https:\/\/formspree\.io\/f\/[A-Za-z0-9_-]+\/?$/.test(value)) return true;
  if (!allowTestFixtures) return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
};
if (!validFormAction(contactAction)) {
  failures.push("Contact form must have a direct production Formspree action.");
}
if (!validFormAction(inquiryAction)) {
  failures.push("Inquiry form must have a direct production Formspree action.");
}
if (contactAction && contactAction === inquiryAction) {
  failures.push("Contact and Inquiry must use different Formspree actions.");
}

const sitemap = fs.readFileSync(path.join(distRoot, "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const sitemapLastmods = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(
  (match) => match[1],
);
const expectedSitemapUrls = publicRoutes.map((route) => `${canonicalOrigin}${route}`);
if (
  sitemapUrls.length !== expectedSitemapUrls.length ||
  !expectedSitemapUrls.every((url) => sitemapUrls.includes(url))
) {
  failures.push("sitemap.xml must contain exactly the indexable launch routes.");
}
if (
  sitemapLastmods.length !== sitemapUrls.length ||
  sitemapLastmods.some((lastmod) => !/^\d{4}-\d{2}-\d{2}$/.test(lastmod))
) {
  failures.push("Every sitemap lastmod must be an ISO calendar date.");
}

const robots = fs.readFileSync(path.join(distRoot, "robots.txt"), "utf8");
if (!/^User-agent:\s*\*\s*$/im.test(robots) || !/^Allow:\s*\/\s*$/im.test(robots)) {
  failures.push("robots.txt must explicitly permit the public site crawl.");
}
if (!/^Sitemap:\s*https:\/\/jq33\.design\/sitemap\.xml\s*$/im.test(robots)) {
  failures.push("robots.txt must reference the canonical sitemap.");
}
if (/^Disallow:\s*\/(?:admin|data|functions|scripts|supabase)/im.test(robots)) {
  failures.push("robots.txt may not advertise or rely on source-only path exclusions.");
}

if (failures.length) {
  console.error("Distribution validation failed:");
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

const manifestFiles = files
  .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  .map(({ fullPath, relativePath }) => {
    const buffer = fs.readFileSync(fullPath);
    return {
      path: relativePath,
      bytes: buffer.length,
      sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    };
  });
const artifactSha256 = crypto
  .createHash("sha256")
  .update(
    manifestFiles
      .map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`)
      .join(""),
  )
  .digest("hex");
const revisionResult = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
});
const sourceRevision =
  revisionResult.status === 0 ? revisionResult.stdout.trim() : "unavailable";

const sourceExactFiles = [
  "index.html",
  "commercial-interior-design-montreal/index.html",
  "contact/index.html",
  "inquiry/index.html",
  "privacy/index.html",
  "terms/index.html",
  "404.html",
  "robots.txt",
  "favicon.svg",
  "apple-touch-icon.svg",
  "tokens.css",
  "_redirects",
  "_headers",
  "assets/css/site.css",
  "assets/css/critical-shared.css",
  "assets/js/leads.js",
  "assets/js/calendly.js",
  "assets/js/deferred-css.js",
  "assets/js/nav-drawer.js",
  "assets/js/components/header-nav.js",
  "assets/js/components/footer.js",
  "data/projects.json",
  "data/posts.json",
  "projects/_project-template.html",
  "projects/_projects-index-template.html",
  "journal/_journal-template.html",
  "journal/_journal-index-template.html",
  "scripts/build.mjs",
  "scripts/check-dist.mjs",
  "scripts/generate-responsive-images.mjs",
  "scripts/generate-projects.mjs",
  "scripts/generate-journal.mjs",
  "scripts/generate-sitemap.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "wrangler.toml",
];
const sourceTrees = [
  ["assets/fonts", new Set([".woff", ".woff2", ".ttf", ".otf"])],
  ["assets/home page images", new Set([".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"])],
  ["assets/journal", new Set([".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"])],
  ["assets/logo", new Set([".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"])],
  ["assets/projects", new Set([".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"])],
  ["assets/icons", new Set([".svg"])],
  ["assets/social", new Set([".svg"])],
  ["og", new Set([".avif", ".jpg", ".jpeg", ".png", ".webp"])],
];
const sourceInputPaths = new Set(sourceExactFiles);
for (const [relativeRoot, extensions] of sourceTrees) {
  const absoluteRoot = path.join(repositoryRoot, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) continue;
  const queue = [absoluteRoot];
  while (queue.length) {
    const directory = queue.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        sourceInputPaths.add(normalized(path.relative(repositoryRoot, fullPath)));
      }
    }
  }
}
const sourceInputs = [...sourceInputPaths]
  .sort((a, b) => a.localeCompare(b))
  .map((relativePath) => {
    const fullPath = path.join(repositoryRoot, relativePath);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      throw new Error(`Declared production source input is missing: ${relativePath}`);
    }
    const buffer = fs.readFileSync(fullPath);
    return {
      path: relativePath,
      bytes: buffer.length,
      sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    };
  });
const sourceTreeSha256 = crypto
  .createHash("sha256")
  .update(
    sourceInputs
      .map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`)
      .join(""),
  )
  .digest("hex");
const sourcePathspecs = [
  ...sourceExactFiles,
  ...sourceTrees.map(([relativeRoot]) => relativeRoot),
];
const sourceStatusResult = spawnSync(
  "git",
  ["status", "--porcelain=v1", "--untracked-files=all", "--", ...sourcePathspecs],
  { cwd: repositoryRoot, encoding: "utf8" },
);
const sourceStatus = sourceStatusResult.status === 0 ? sourceStatusResult.stdout.trim() : "";
const sourceChangeCount = sourceStatus ? sourceStatus.split(/\r?\n/).length : 0;
const sourceStatusSha256 = crypto
  .createHash("sha256")
  .update(sourceStatus, "utf8")
  .digest("hex");

if (manifestTarget) {
  fs.writeFileSync(
    manifestTarget,
    `${JSON.stringify(
      {
        schemaVersion: 2,
        root: "dist",
        generatedAt: new Date().toISOString(),
        sourceRevision,
        sourceTreeSha256,
        sourceInputCount: sourceInputs.length,
        sourceDirty: sourceChangeCount > 0,
        sourceChangeCount,
        sourceStatusSha256,
        nodeVersion: process.version,
        artifactSha256,
        files: manifestFiles,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

console.log(
  `Distribution validation passed: ${manifestFiles.length} allowlisted files, artifact ${artifactSha256}.`,
);
