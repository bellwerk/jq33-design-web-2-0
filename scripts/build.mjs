import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { minify as minifyHtml } from "html-minifier-terser";
import { transform as transformCss } from "lightningcss";
import subsetFont from "subset-font";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const allowTestFixtures = process.argv.includes("--allow-test-fixtures");
const canonicalOrigin = "https://jq33.design";
const releaseFingerprint = "20260826-production-launch-closure-nav-1";
const requiredToolchain = {
  node: "22.23.2",
  pnpm: "11.13.0",
};
const pnpmVersion = /(?:^|\s)pnpm\/([^\s]+)/.exec(
  process.env.npm_config_user_agent || "",
)?.[1];

if (process.versions.node !== requiredToolchain.node) {
  throw new Error(
    `Strict build requires Node ${requiredToolchain.node}; received ${process.versions.node}.`,
  );
}
if (pnpmVersion !== requiredToolchain.pnpm) {
  throw new Error(
    `Strict build requires pnpm ${requiredToolchain.pnpm}; received ${pnpmVersion || "unknown"}.`,
  );
}
const testFixtureValues = {
  PUBLIC_FORMSPREE_CONTACT_URL: "https://formspree.io/f/jq33-contact-fixture",
  PUBLIC_FORMSPREE_INQUIRY_URL: "https://formspree.io/f/jq33-inquiry-fixture",
  PUBLIC_CALENDLY_URL: "https://calendly.com/jq33-design/jq33-test-fixture",
};

if (allowTestFixtures) {
  for (const [name, value] of Object.entries(testFixtureValues)) {
    if (!String(process.env[name] || "").trim()) process.env[name] = value;
  }
}

const handAuthoredFiles = [
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
];

const publicScriptFiles = [
  "assets/js/leads.js",
  "assets/js/calendly.js",
  "assets/js/deferred-css.js",
  "assets/js/nav-drawer.js",
  "assets/js/components/header-nav.js",
  "assets/js/components/footer.js",
];

const publicAssetTrees = [
  {
    source: "assets/fonts",
    extensions: new Set([".woff", ".woff2", ".ttf", ".otf"]),
    required: true,
  },
  {
    source: "assets/home page images",
    extensions: new Set([".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"]),
    required: true,
  },
  {
    source: "assets/journal",
    extensions: new Set([".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"]),
    required: true,
  },
  {
    source: "assets/logo",
    extensions: new Set([".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"]),
    required: true,
  },
  {
    source: "assets/projects",
    extensions: new Set([".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"]),
    required: true,
  },
  {
    source: "assets/icons",
    extensions: new Set([".svg"]),
    required: false,
  },
  {
    source: "assets/social",
    extensions: new Set([".svg"]),
    required: false,
  },
  {
    source: "og",
    extensions: new Set([".avif", ".jpg", ".jpeg", ".png", ".webp"]),
    required: true,
  },
];

const fail = (message) => {
  throw new Error(message);
};

const normalizeRelative = (value) => value.split(path.sep).join("/");
const normalizeTextLineEndings = (value) => value.replace(/\r\n?/g, "\n");

const assertExactDistPath = () => {
  const expected = path.resolve(rootDir, "dist");
  if (
    path.resolve(distDir) !== expected ||
    path.dirname(expected) !== rootDir ||
    path.basename(expected) !== "dist"
  ) {
    fail(`Refusing to clean an unexpected output path: ${distDir}`);
  }

  if (fs.existsSync(distDir)) {
    const stat = fs.lstatSync(distDir);
    if (stat.isSymbolicLink()) {
      fail("Refusing to clean dist because it is a symbolic link or junction.");
    }
    const realOutput = fs.realpathSync(distDir);
    if (realOutput !== expected) {
      fail(`Refusing to clean dist because it resolves outside the repository: ${realOutput}`);
    }
  }
};

const copyFile = (relativePath) => {
  const source = path.join(rootDir, relativePath);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    fail(`Required public source file is missing: ${relativePath}`);
  }
  const destination = path.join(distDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(
    destination,
    normalizeTextLineEndings(fs.readFileSync(source, "utf8")),
    "utf8",
  );
};

const copyTree = ({ source, extensions, required }) => {
  const sourceRoot = path.join(rootDir, source);
  if (!fs.existsSync(sourceRoot)) {
    if (required) fail(`Required public asset directory is missing: ${source}`);
    return;
  }

  let copied = 0;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const sourcePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        fail(`Public asset trees may not contain links: ${normalizeRelative(path.relative(rootDir, sourcePath))}`);
      }
      if (entry.isDirectory()) {
        visit(sourcePath);
        continue;
      }
      if (!entry.isFile() || !extensions.has(path.extname(entry.name).toLowerCase())) continue;
      const relativePath = path.relative(rootDir, sourcePath);
      const destination = path.join(distDir, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(sourcePath, destination);
      copied += 1;
    }
  };

  visit(sourceRoot);
  if (required && copied === 0) {
    fail(`Required public asset directory is empty: ${source}`);
  }
};

const parseRequiredUrl = (name) => {
  const raw = String(process.env[name] || "").trim();
  if (!raw) fail(`${name} is required for every build.`);
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`${name} must be an absolute URL.`);
  }
  if (url.username || url.password || url.hash) {
    fail(`${name} may not include credentials or a fragment.`);
  }
  return url;
};

const isLocalFixture = (url) =>
  ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
  ["http:", "https:"].includes(url.protocol);

const validateIntegrations = () => {
  if (allowTestFixtures && process.env.NODE_ENV === "production") {
    fail("--allow-test-fixtures is forbidden when NODE_ENV=production.");
  }

  const contact = parseRequiredUrl("PUBLIC_FORMSPREE_CONTACT_URL");
  const inquiry = parseRequiredUrl("PUBLIC_FORMSPREE_INQUIRY_URL");
  const calendly = parseRequiredUrl("PUBLIC_CALENDLY_URL");

  const validFormspree = (url) =>
    url.protocol === "https:" &&
    url.hostname === "formspree.io" &&
    /^\/f\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) &&
    !url.search;
  const validCalendly = (url) =>
    url.protocol === "https:" &&
    ["calendly.com", "www.calendly.com"].includes(url.hostname) &&
    url.pathname.split("/").filter(Boolean).length >= 2 &&
    !url.search;

  for (const [name, url] of [
    ["PUBLIC_FORMSPREE_CONTACT_URL", contact],
    ["PUBLIC_FORMSPREE_INQUIRY_URL", inquiry],
  ]) {
    if (!validFormspree(url) && !(allowTestFixtures && isLocalFixture(url))) {
      fail(`${name} must be a direct https://formspree.io/f/... endpoint.`);
    }
  }
  if (!validCalendly(calendly) && !(allowTestFixtures && isLocalFixture(calendly))) {
    fail("PUBLIC_CALENDLY_URL must be a direct published Calendly event URL.");
  }
  if (contact.href === inquiry.href) {
    fail("Contact and Inquiry must use distinct Formspree endpoints.");
  }
  return {
    contact: contact.href,
    inquiry: inquiry.href,
    calendly: calendly.href,
    formActionOrigin: contact.origin,
  };
};

const socialProviders = [
  {
    network: "instagram",
    env: "PUBLIC_SOCIAL_INSTAGRAM_URL",
    hosts: new Set(["instagram.com", "www.instagram.com"]),
  },
  {
    network: "facebook",
    env: "PUBLIC_SOCIAL_FACEBOOK_URL",
    hosts: new Set(["facebook.com", "www.facebook.com"]),
  },
  {
    network: "youtube",
    env: "PUBLIC_SOCIAL_YOUTUBE_URL",
    hosts: new Set(["youtube.com", "www.youtube.com"]),
  },
  {
    network: "behance",
    env: "PUBLIC_SOCIAL_BEHANCE_URL",
    hosts: new Set(["behance.net", "www.behance.net"]),
  },
];

const getSocialProfiles = () =>
  socialProviders.flatMap(({ network, env, hosts }) => {
    const raw = String(process.env[env] || "").trim();
    if (!raw) return [];
    let url;
    try {
      url = new URL(raw);
    } catch {
      fail(`${env} must be an absolute HTTPS profile URL.`);
    }
    if (
      url.protocol !== "https:" ||
      !hosts.has(url.hostname) ||
      url.username ||
      url.password ||
      url.hash ||
      url.pathname.split("/").filter(Boolean).length === 0
    ) {
      fail(`${env} must be an HTTPS ${network} profile URL on the expected provider host.`);
    }
    return [{ network, url: url.href }];
  });

const run = (scriptPath) => {
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--output-root", distDir],
    {
      cwd: rootDir,
      stdio: "inherit",
      env: { ...process.env, PUBLIC_SITE_URL: canonicalOrigin },
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const walkFiles = (directory, files = []) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      fail(`Distribution may not contain links: ${normalizeRelative(path.relative(distDir, fullPath))}`);
    }
    if (entry.isDirectory()) walkFiles(fullPath, files);
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
};

const createProductionFontSubsets = async () => {
  const publicFontPath = path.join(
    distDir,
    "assets",
    "fonts",
    "permanent-marker",
    "permanent-marker-400.woff2",
  );
  if (!fs.existsSync(publicFontPath)) {
    fail("Permanent Marker source font is missing from the distribution.");
  }
  const interFontPath = path.join(
    distDir,
    "assets",
    "fonts",
    "inter",
    "inter-latin-400-900.woff2",
  );
  if (!fs.existsSync(interFontPath)) {
    fail("Inter variable source font is missing from the distribution.");
  }
  const lato400FontPath = path.join(
    distDir,
    "assets",
    "fonts",
    "lato",
    "lato-400.woff2",
  );
  const lato700FontPath = path.join(
    distDir,
    "assets",
    "fonts",
    "lato",
    "lato-700.woff2",
  );
  for (const [label, fontPath] of [
    ["Lato 400", lato400FontPath],
    ["Lato 700", lato700FontPath],
  ]) {
    if (!fs.existsSync(fontPath)) {
      fail(`${label} source font is missing from the distribution.`);
    }
  }

  const glyphText =
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u2014";
  const supportedGlyphs = new Set(glyphText);
  for (const filePath of walkFiles(distDir).filter((candidate) =>
    candidate.endsWith(".html"),
  )) {
    const html = fs.readFileSync(filePath, "utf8");
    for (const match of html.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
      const headingText = match[1].replace(/<[^>]+>/g, "");
      const unsupported = [...headingText].filter(
        (character) => character.codePointAt(0) > 127 && !supportedGlyphs.has(character),
      );
      if (unsupported.length) {
        fail(
          `${normalizeRelative(path.relative(distDir, filePath))} uses unsupported heading glyphs: ${[...new Set(unsupported)].join(" ")}`,
        );
      }
    }
  }

  const source = fs.readFileSync(publicFontPath);
  const interSource = fs.readFileSync(interFontPath);
  const lato400Source = fs.readFileSync(lato400FontPath);
  const lato700Source = fs.readFileSync(lato700FontPath);
  const homeHtml = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
  const homePanelMatch = /<section\b[^>]*\bid=(?:"home"|'home')[^>]*>([\s\S]*?)<\/section>/i.exec(
    homeHtml,
  );
  if (!homePanelMatch) {
    fail("Homepage Inter subset could not bind to the static #home panel.");
  }
  const homeInterGlyphText = homePanelMatch[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_match, value) =>
      String.fromCodePoint(Number.parseInt(value, 16)),
    )
    .replace(/&#([0-9]+);/g, (_match, value) =>
      String.fromCodePoint(Number.parseInt(value, 10)),
    )
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
  if (/&[a-z][a-z0-9]+;/i.test(homeInterGlyphText)) {
    fail("Homepage Inter subset encountered an unsupported named HTML entity.");
  }
  const homeGlyphText = " JQ33Design";
  const commercialH1GlyphText = " Commercial Interior Design in Montreal";
  const homeInterSubsetText = `${homeInterGlyphText}${homeInterGlyphText.toUpperCase()}`;
  const homeCriticalLatoText = "JQ33 DESIGN Projects Journal Inquiry Contact";
  const commercialCriticalLato400Text =
    "Commercial Interior Design • Montreal Layout-first interiors for cafes, salons, boutiques, and offices that need better flow, stronger first impressions, and a clear build-ready direction. Designed for: Cafes Salons Clinics Boutiques Offices";
  const commercialCriticalLato700Text =
    "JQ33 DESIGN Book a call Get a free quote Projects Journal Inquiry Contact";
  const [
    homeSubset,
    commercialH1Subset,
    subset,
    homeInterSubset,
    homeCriticalLatoSubset,
    commercialCriticalLato400Subset,
    commercialCriticalLato700Subset,
  ] = await Promise.all([
    subsetFont(source, homeGlyphText, { targetFormat: "woff2" }),
    subsetFont(source, commercialH1GlyphText, { targetFormat: "woff2" }),
    subsetFont(source, glyphText, { targetFormat: "woff2" }),
    subsetFont(interSource, homeInterSubsetText, { targetFormat: "woff2" }),
    subsetFont(lato700Source, `${homeCriticalLatoText}${homeCriticalLatoText.toUpperCase()}`, {
      targetFormat: "woff2",
    }),
    subsetFont(
      lato400Source,
      `${commercialCriticalLato400Text}${commercialCriticalLato400Text.toUpperCase()}`,
      { targetFormat: "woff2" },
    ),
    subsetFont(
      lato700Source,
      `${commercialCriticalLato700Text}${commercialCriticalLato700Text.toUpperCase()}`,
      { targetFormat: "woff2" },
    ),
  ]);
  fs.writeFileSync(
    path.join(path.dirname(publicFontPath), "permanent-marker-home.woff2"),
    homeSubset,
  );
  fs.writeFileSync(publicFontPath, subset);
  fs.writeFileSync(
    path.join(path.dirname(interFontPath), "inter-home-hero.woff2"),
    homeInterSubset,
  );
  if (homeInterSubset.length > 22_000 || homeInterSubset.length * 2 >= interSource.length) {
    fail("Homepage Inter subset must remain at most 22 KB and under half the shared variable font.");
  }
  if (commercialH1Subset.length > 5_000) {
    fail("Commercial H1 subset must remain at most 5 KB before inlining.");
  }
  const assertCriticalLatoSubset = ({
    label,
    subsetBuffer,
    sourceBuffer,
    maximumBytes,
    expectedBytes,
    expectedSha256,
  }) => {
    if (
      !Buffer.isBuffer(subsetBuffer) ||
      subsetBuffer.length < 1_000 ||
      subsetBuffer.subarray(0, 4).toString("ascii") !== "wOF2"
    ) {
      fail(`${label} must be a non-empty WOFF2 font.`);
    }
    if (subsetBuffer.length > maximumBytes || subsetBuffer.length >= sourceBuffer.length) {
      fail(
        `${label} must remain at most ${maximumBytes} bytes and smaller than its source font.`,
      );
    }
    const actualSha256 = crypto.createHash("sha256").update(subsetBuffer).digest("hex");
    if (subsetBuffer.length !== expectedBytes || actualSha256 !== expectedSha256) {
      fail(
        `${label} drifted from its pinned ${expectedBytes}-byte artifact (${expectedSha256}); received ${subsetBuffer.length} bytes (${actualSha256}).`,
      );
    }
  };
  for (const definition of [
    {
      label: "Homepage critical Lato 700 subset",
      subsetBuffer: homeCriticalLatoSubset,
      sourceBuffer: lato700Source,
      maximumBytes: 8_000,
      expectedBytes: 5_980,
      expectedSha256: "f2aeafcd35c2ff85ddf85614106f9201f8ebdca38a6239a0acce98bccf0a55ed",
    },
    {
      label: "Commercial critical Lato 400 subset",
      subsetBuffer: commercialCriticalLato400Subset,
      sourceBuffer: lato400Source,
      maximumBytes: 11_000,
      expectedBytes: 8_236,
      expectedSha256: "011f713874f6500a5a3254ed5cbab0fbc0487f0d2d39ab7abbb86edf01178ede",
    },
    {
      label: "Commercial critical Lato 700 subset",
      subsetBuffer: commercialCriticalLato700Subset,
      sourceBuffer: lato700Source,
      maximumBytes: 9_000,
      expectedBytes: 6_948,
      expectedSha256: "909659cf9ac4b889e395fad86358557b4e6e47dbcc65a3db3bcd9956b8d2bada",
    },
  ]) {
    assertCriticalLatoSubset(definition);
  }
  console.log(
    `Subset production fonts (Permanent Marker ${source.length} -> shared ${subset.length}, homepage ${homeSubset.length}, commercial H1 ${commercialH1Subset.length}; Inter ${interSource.length} -> homepage ${homeInterSubset.length}; critical Lato home 700 ${homeCriticalLatoSubset.length}, commercial 400 ${commercialCriticalLato400Subset.length}, commercial 700 ${commercialCriticalLato700Subset.length} bytes).`,
  );
  return {
    homeSubset,
    commercialH1Subset,
    homeCriticalLatoSubset,
    commercialCriticalLato400Subset,
    commercialCriticalLato700Subset,
  };
};

const inlineHomepageFontSubset = (homeSubset) => {
  const homeFontCssPath = path.join(distDir, "assets", "css", "home-font.css");
  const css = fs.readFileSync(homeFontCssPath, "utf8");
  const inlined = css.replace(
    /url\(\s*(["']?)\/assets\/fonts\/permanent-marker\/permanent-marker-home\.woff2\1\s*\)/i,
    `url("data:font/woff2;base64,${homeSubset.toString("base64")}")`,
  );
  if (inlined === css) {
    fail("Homepage subset font URL could not be embedded in critical CSS.");
  }
  fs.writeFileSync(homeFontCssPath, normalizeTextLineEndings(inlined), "utf8");
};

const escapeForJavaScriptString = (value) =>
  JSON.stringify(value).slice(1, -1).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

const replaceBuildTokens = (integrations, profiles) => {
  const replacements = new Map([
    ["{{FORMSPREE_CONTACT_URL}}", integrations.contact],
    ["{{FORMSPREE_INQUIRY_URL}}", integrations.inquiry],
    ["{{CALENDLY_URL}}", integrations.calendly],
    [
      "{{SOCIAL_PROFILES_JSON}}",
      escapeForJavaScriptString(JSON.stringify(profiles)),
    ],
  ]);
  const textExtensions = new Set([".css", ".html", ".js", ".svg", ".txt", ".xml"]);

  for (const filePath of walkFiles(distDir)) {
    if (!textExtensions.has(path.extname(filePath).toLowerCase())) continue;
    let content = normalizeTextLineEndings(fs.readFileSync(filePath, "utf8"));
    for (const [token, value] of replacements) {
      content = content.replaceAll(token, value);
    }
    fs.writeFileSync(filePath, content, "utf8");
  }

  const remainingTokens = [];
  for (const filePath of walkFiles(distDir)) {
    if (!textExtensions.has(path.extname(filePath).toLowerCase())) continue;
    const content = fs.readFileSync(filePath, "utf8");
    if (/{{[^{}\r\n]+}}/.test(content)) {
      remainingTokens.push(normalizeRelative(path.relative(distDir, filePath)));
    }
  }
  if (remainingTokens.length) {
    fail(`Unresolved build tokens remain in: ${remainingTokens.join(", ")}`);
  }
};

const pruneUnreferencedAssets = () => {
  const requiredPublicFiles = new Set(["assets/css/site.css"]);
  const referenced = new Set();
  const referenceToPath = (raw, sourceRelativePath) => {
    const value = raw.trim();
    if (!value || /^(?:data:|#)/i.test(value)) return;
    let candidate = value.split(/[?#]/, 1)[0];
    if (/^https?:\/\//i.test(candidate)) {
      const url = new URL(candidate);
      if (url.origin !== canonicalOrigin) return;
      candidate = url.pathname;
    }
    let relativePath;
    if (candidate.startsWith("/")) {
      relativePath = candidate.replace(/^\/+/, "");
    } else {
      relativePath = path.posix.normalize(
        path.posix.join(path.posix.dirname(sourceRelativePath), candidate),
      );
    }
    try {
      relativePath = decodeURIComponent(relativePath);
    } catch {
      fail(`Invalid encoded asset reference in ${sourceRelativePath}: ${raw}`);
    }
    if (/^(?:assets|og)\//.test(relativePath)) referenced.add(relativePath);
  };

  const scannable = walkFiles(distDir).filter((filePath) =>
    [".css", ".html", ".js", ".svg"].includes(path.extname(filePath).toLowerCase()),
  );
  for (const filePath of scannable) {
    const relativePath = normalizeRelative(path.relative(distDir, filePath));
    const content = fs.readFileSync(filePath, "utf8");
    for (const match of content.matchAll(/\b(?:src|href|data-img|content)\s*=\s*(["'])(.*?)\1/gi)) {
      referenceToPath(match[2], relativePath);
    }
    for (const match of content.matchAll(/\b(?:srcset|imagesrcset)\s*=\s*(["'])(.*?)\1/gi)) {
      for (const candidate of match[2].split(",")) {
        referenceToPath(candidate.trim().split(/\s+/, 1)[0], relativePath);
      }
    }
    for (const match of content.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
      referenceToPath(match[2], relativePath);
    }
  }

  for (const filePath of walkFiles(distDir)) {
    const relativePath = normalizeRelative(path.relative(distDir, filePath));
    if (!/^(?:assets|og)\//.test(relativePath)) continue;
    if (requiredPublicFiles.has(relativePath)) continue;
    if (!referenced.has(relativePath)) fs.rmSync(filePath);
  }

  const removeEmptyDirectories = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) removeEmptyDirectories(path.join(directory, entry.name));
    }
    if (directory !== distDir && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
  };
  removeEmptyDirectories(distDir);
};

const externalizeInlineAssets = async ({
  commercialH1Subset,
  homeCriticalLatoSubset,
  commercialCriticalLato400Subset,
  commercialCriticalLato700Subset,
}) => {
  const generatedRoot = path.join(distDir, "assets", "generated");
  const writeGenerated = (extension, content) => {
    const optimizedContent =
      extension === "css"
        ? transformCss({
            filename: "jq33-generated.css",
            code: Buffer.from(content),
            minify: true,
          }).code.toString()
        : content;
    const digest = crypto
      .createHash("sha256")
      .update(optimizedContent, "utf8")
      .digest("hex");
    const relativePath = `assets/generated/${digest}.${extension}`;
    const destination = path.join(distDir, relativePath);
    fs.mkdirSync(generatedRoot, { recursive: true });
    if (!fs.existsSync(destination)) fs.writeFileSync(destination, optimizedContent, "utf8");
    return `/${relativePath}`;
  };

  const firstIntentFontRoutes = new Set([
    "/index.html",
    "/commercial-interior-design-montreal/index.html",
  ]);
  const sharedNetworkFontPaths = [
    "/assets/fonts/lato/lato-400.woff2",
    "/assets/fonts/lato/lato-700.woff2",
    "/assets/fonts/lato/lato-900.woff2",
    "/assets/fonts/inter/inter-latin-400-900.woff2",
    "/assets/fonts/permanent-marker/permanent-marker-400.woff2",
  ];
  const fontFacePattern = /@font-face\s*\{[^{}]*\}/gi;
  const getFontFaceFamily = (fontFace) => {
    const match = /font-family\s*:\s*(?:"([^"]+)"|'([^']+)'|([^;]+))/i.exec(fontFace);
    return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
  };
  const splitSharedNetworkFontFaces = (css) => {
    const moved = [];
    const remaining = css.replace(fontFacePattern, (fontFace) => {
      if (!sharedNetworkFontPaths.some((fontPath) => fontFace.includes(fontPath))) {
        return fontFace;
      }
      moved.push(fontFace);
      return "";
    });
    return { remaining, moved };
  };
  const createFirstIntentLoader = (fontOnlyHref) => `(() => {
  let activated = false;
  const events = ["pointermove", "pointerdown", "touchstart", "wheel", "scroll", "keydown"];
  const activate = () => {
    if (activated) return;
    activated = true;
    for (const eventName of events) window.removeEventListener(eventName, activate);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = ${JSON.stringify(fontOnlyHref)};
    link.dataset.jq33FontOnly = "";
    document.head.append(link);
  };
  for (const eventName of events) {
    window.addEventListener(eventName, activate, {
      once: true,
      passive: eventName !== "keydown",
    });
  }
})();`;

  const htmlFiles = walkFiles(distDir).filter((filePath) => filePath.endsWith(".html"));
  let firstIntentRouteCount = 0;
  for (const filePath of htmlFiles) {
    const documentPath = `/${normalizeRelative(path.relative(distDir, filePath))}`;
    const documentDirectory = path.posix.dirname(documentPath);
    const makeCssUrlsAbsolute = (css) =>
      css.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (match, quote, raw) => {
        const value = raw.trim();
        if (!value || /^(?:\/|#|data:|https?:)/i.test(value)) return match;
        const absolute = path.posix.resolve(documentDirectory, value);
        return `url(${quote}${absolute}${quote})`;
      });
    let html = fs.readFileSync(filePath, "utf8");
    if (documentPath === "/index.html") {
      const fullInterPath = "/assets/fonts/inter/inter-latin-400-900.woff2";
      const homeInterPath = "/assets/fonts/inter/inter-home-hero.woff2";
      const expectedHomePreload = `<link rel="preload" href="${homeInterPath}" as="font" type="font/woff2" crossorigin />`;
      if (!html.includes(expectedHomePreload) || html.includes(`href="${fullInterPath}" as="font"`)) {
        fail("Homepage must preload only its route-scoped Inter subset.");
      }
      html = html.replace(
        /(<style\b[^>]*\bdata-jq33-critical\b[^>]*>)/i,
        `$1
@font-face {
  font-family: "JQ33 Home Inter";
  font-style: normal;
  font-weight: 400 900;
  font-display: swap;
  src: url("${homeInterPath}") format("woff2");
}
@font-face {
  font-family: "JQ33 Home Critical Lato";
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("data:font/woff2;base64,${homeCriticalLatoSubset.toString("base64")}") format("woff2");
}
.header-nav {
  --font-sans: "JQ33 Home Critical Lato", "Lato Metric Fallback", system-ui, -apple-system, "Segoe UI", sans-serif;
  font-family: var(--font-sans);
}
.header-nav .label,
.header-nav .nav-link {
  font-family: var(--font-sans) !important;
}
.panel--home {
  --font-hero: "JQ33 Home Inter", "JQ33 Home Critical Lato", "Lato Metric Fallback", system-ui, sans-serif;
  --font-home-mark: "Permanent Marker Home", "Permanent Marker Metric Fallback", "JQ33 Home Critical Lato", cursive;
}`,
      );
      if (
        !html.includes('font-family: "JQ33 Home Inter"') ||
        !html.includes('font-family: "JQ33 Home Critical Lato"')
      ) {
        fail("Homepage route-critical fonts could not be injected into critical CSS.");
      }
    }
    if (documentPath === "/commercial-interior-design-montreal/index.html") {
      const commercialFontPath =
        "/assets/fonts/permanent-marker/permanent-marker-commercial-h1.woff2";
      if (html.includes(commercialFontPath)) {
        fail("Commercial H1 source must not retain an external subset URL or preload.");
      }
      html = html.replace(
        /(<style\b[^>]*\bdata-jq33-critical\b[^>]*>)/i,
        `$1
@font-face {
  font-family: "Permanent Marker Commercial H1";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("data:font/woff2;base64,${commercialH1Subset.toString("base64")}") format("woff2");
  unicode-range: U+0020, U+0043, U+0044, U+0049, U+004D, U+0061, U+0063, U+0065, U+0067, U+0069, U+006C, U+006D, U+006E, U+006F, U+0072, U+0073, U+0074;
}
@font-face {
  font-family: "JQ33 Commercial Critical Lato";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("data:font/woff2;base64,${commercialCriticalLato400Subset.toString("base64")}") format("woff2");
}
@font-face {
  font-family: "JQ33 Commercial Critical Lato";
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("data:font/woff2;base64,${commercialCriticalLato700Subset.toString("base64")}") format("woff2");
}
.header-nav {
  --font-sans: "JQ33 Commercial Critical Lato", "Lato Metric Fallback", system-ui, -apple-system, "Segoe UI", sans-serif;
  font-family: var(--font-sans);
}
.header-nav .label,
.header-nav .nav-link {
  font-family: var(--font-sans) !important;
}
main .hero {
  --font-sans: "JQ33 Commercial Critical Lato", "Lato Metric Fallback", system-ui, -apple-system, "Segoe UI", sans-serif;
  font-family: var(--font-sans);
}
main .hero h1 {
  font-family: "Permanent Marker Commercial H1", "Permanent Marker Metric Fallback", "JQ33 Commercial Critical Lato", cursive !important;
}
main .hero > div:first-child > .hero-actions .btn {
  font-family: var(--font-sans) !important;
}`,
      );
      if (
        !html.includes('font-family: "JQ33 Commercial Critical Lato"') ||
        !html.includes("main .hero > div:first-child > .hero-actions .btn")
      ) {
        fail("Commercial route-critical fonts could not be injected into critical CSS.");
      }
    }
    html = html.replace(/\svid\s*=\s*(["'])[^"']*\1/gi, "");
    html = html.replace(
      /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
      (_match, attributes, content) =>
        `<link rel="stylesheet" href="${writeGenerated("css", makeCssUrlsAbsolute(content))}"${attributes}>`,
    );
    html = html.replace(
      /<script\b((?![^>]*\bsrc\s*=)[^>]*)>([\s\S]*?)<\/script>/gi,
      (match, attributes, content) => {
        if (/\btype\s*=\s*(["'])application\/ld\+json\1/i.test(attributes)) return match;
        return `<script${attributes} src="${writeGenerated("js", content)}"></script>`;
      },
    );

    const styleRules = new Map();
    html = html.replace(/\sstyle\s*=\s*(["'])(.*?)\1/gi, (_match, _quote, declarations) => {
      const marker = crypto
        .createHash("sha256")
        .update(declarations, "utf8")
        .digest("hex")
        .slice(0, 16);
      styleRules.set(marker, declarations);
      return ` data-jq33-style="${marker}"`;
    });
    if (styleRules.size) {
      const css = [...styleRules]
        .map(
          ([marker, declarations]) =>
            `:is(#jq33-inline-specificity,[data-jq33-style="${marker}"]){${declarations}}`,
        )
        .join("\n");
      html = html.replace(
        /<\/head>/i,
        `  <link rel="stylesheet" href="${writeGenerated("css", css)}">\n  </head>`,
      );
    }

    const handlers = [];
    html = html.replace(
      /\son([a-z]+)\s*=\s*(["'])(.*?)\2/gi,
      (_match, eventName, _quote, code) => {
        const marker = crypto
          .createHash("sha256")
          .update(`${eventName}\0${code}`, "utf8")
          .digest("hex")
          .slice(0, 16);
        handlers.push({ eventName: eventName.toLowerCase(), code, marker });
        return ` data-jq33-on${eventName.toLowerCase()}="${marker}"`;
      },
    );
    if (handlers.length) {
      const listenerSource = handlers
        .map(
          ({ eventName, code, marker }) => `
for (const element of document.querySelectorAll('[data-jq33-on${eventName}="${marker}"]')) {
  element.addEventListener(${JSON.stringify(eventName)}, function jq33InlineHandler(event) {
    const result = (function originalInlineHandler(event) {
      ${code}
    }).call(this, event);
    if (result === false) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}`,
        )
        .join("\n");
      html = html.replace(
        /<\/body>/i,
        `  <script src="${writeGenerated("js", listenerSource)}"></script>\n  </body>`,
      );
    }

    const getAttribute = (tag, name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = new RegExp(
        `(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
        "i",
      ).exec(tag);
      return match ? match[1] ?? match[2] ?? match[3] ?? "" : "";
    };
    const localStylesheets = [...html.matchAll(/<link\b[^>]*>/gi)].flatMap((match) => {
      const tag = match[0];
      const rel = getAttribute(tag, "rel").toLowerCase().split(/\s+/);
      if (!rel.includes("stylesheet")) return [];
      const media = getAttribute(tag, "media").trim().toLowerCase();
      if (media && media !== "all" && media !== "screen") return [];
      const href = getAttribute(tag, "href");
      if (!href || /^(?:data:|https?:|\/\/)/i.test(href)) return [];
      const cleanHref = href.split(/[?#]/, 1)[0];
      const publicPath = cleanHref.startsWith("/")
        ? path.posix.normalize(cleanHref)
        : path.posix.resolve(documentDirectory, cleanHref);
      let decodedPublicPath;
      try {
        decodedPublicPath = decodeURIComponent(publicPath);
      } catch {
        fail(`Invalid stylesheet URL in ${documentPath}: ${href}`);
      }
      const sourcePath = path.resolve(distDir, `.${decodedPublicPath}`);
      if (
        sourcePath !== distDir &&
        !sourcePath.startsWith(`${distDir}${path.sep}`)
      ) {
        fail(`Stylesheet escapes dist in ${documentPath}: ${href}`);
      }
      if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
        fail(`Stylesheet is missing in ${documentPath}: ${href}`);
      }
      const stylesheetDirectory = path.posix.dirname(decodedPublicPath);
      const content = fs
        .readFileSync(sourcePath, "utf8")
        .replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (urlMatch, quote, raw) => {
          const value = raw.trim();
          if (!value || /^(?:\/|#|data:|https?:)/i.test(value)) return urlMatch;
          const absolute = path.posix.resolve(stylesheetDirectory, value);
          return `url(${quote}${absolute}${quote})`;
        });
      return [
        {
          index: match.index,
          length: tag.length,
          content,
          critical: /\bdata-jq33-critical(?:\s|=|>)/i.test(tag),
        },
      ];
    });

    if (localStylesheets.length) {
      const criticalStylesheets = localStylesheets.filter(({ critical }) => critical);
      const deferredStylesheets = localStylesheets.filter(({ critical }) => !critical);
      const makeBundle = (stylesheets) =>
        stylesheets
          .map(({ content }) => content.trim())
          .filter(Boolean)
          .join("\n");
      let criticalCss = criticalStylesheets.length ? makeBundle(criticalStylesheets) : "";
      let deferredCss = deferredStylesheets.length ? makeBundle(deferredStylesheets) : "";
      let intentScriptHref = "";
      let fontOnlyHref = "";
      if (firstIntentFontRoutes.has(documentPath)) {
        const criticalSplit = splitSharedNetworkFontFaces(criticalCss);
        const deferredSplit = splitSharedNetworkFontFaces(deferredCss);
        const movedFontFaces = [...criticalSplit.moved, ...deferredSplit.moved];
        criticalCss = criticalSplit.remaining;
        deferredCss = deferredSplit.remaining;

        if (movedFontFaces.length !== sharedNetworkFontPaths.length) {
          fail(
            `${documentPath} must move exactly ${sharedNetworkFontPaths.length} network-backed shared font faces; received ${movedFontFaces.length}.`,
          );
        }
        const movedFontCss = movedFontFaces.join("\n");
        const initialCss = `${criticalCss}\n${deferredCss}`;
        for (const fontPath of sharedNetworkFontPaths) {
          const movedCount = movedFontFaces.filter((fontFace) =>
            fontFace.includes(fontPath),
          ).length;
          if (movedCount !== 1 || initialCss.includes(fontPath)) {
            fail(
              `${documentPath} must move the shared face ${fontPath} exactly once and leave no initial reference.`,
            );
          }
        }
        if (/Metric Fallback/i.test(movedFontCss)) {
          fail(`${documentPath} must retain metric-fallback faces in initial CSS.`);
        }

        const initialFontFamilies = [...initialCss.matchAll(fontFacePattern)].map((match) =>
          getFontFaceFamily(match[0]),
        );
        for (const metricFamily of [
          "Lato Metric Fallback",
          "Permanent Marker Metric Fallback",
        ]) {
          if (initialFontFamilies.filter((family) => family === metricFamily).length !== 1) {
            fail(`${documentPath} must retain exactly one ${metricFamily} face before intent.`);
          }
        }
        const expectedCriticalFamilies =
          documentPath === "/index.html"
            ? ["Permanent Marker Home", "JQ33 Home Inter", "JQ33 Home Critical Lato"]
            : [
                "Permanent Marker Commercial H1",
                "JQ33 Commercial Critical Lato",
                "JQ33 Commercial Critical Lato",
              ];
        const remainingCriticalFamilies = initialFontFamilies.filter(
          (family) => !family.endsWith("Metric Fallback"),
        );
        if (
          remainingCriticalFamilies.length !== expectedCriticalFamilies.length ||
          expectedCriticalFamilies.some(
            (family, index) => remainingCriticalFamilies[index] !== family,
          )
        ) {
          fail(
            `${documentPath} retained unexpected route-critical font faces: ${remainingCriticalFamilies.join(", ") || "none"}.`,
          );
        }

        fontOnlyHref = writeGenerated("css", movedFontCss);
        intentScriptHref = writeGenerated("js", createFirstIntentLoader(fontOnlyHref));
        firstIntentRouteCount += 1;
      }
      const deferredHref = deferredCss ? writeGenerated("css", deferredCss) : "";
      const replacements = new Map();
      for (const [stylesheetIndex, { index }] of criticalStylesheets.entries()) {
        replacements.set(
          index,
          stylesheetIndex === 0
            ? `<style data-jq33-critical-bundle>${criticalCss}</style>`
            : "",
        );
      }
      for (const [stylesheetIndex, { index }] of deferredStylesheets.entries()) {
        replacements.set(
          index,
          stylesheetIndex === 0
            ? criticalStylesheets.length
              ? `<link rel="stylesheet" href="${deferredHref}" media="print" data-jq33-deferred-css>`
              : `<link rel="stylesheet" href="${deferredHref}">`
            : "",
        );
      }
      let cursor = 0;
      let rebuilt = "";
      for (const stylesheet of localStylesheets) {
        rebuilt += html.slice(cursor, stylesheet.index);
        rebuilt += replacements.get(stylesheet.index) ?? "";
        cursor = stylesheet.index + stylesheet.length;
      }
      html = `${rebuilt}${html.slice(cursor)}`;
      if (intentScriptHref) {
        const parseTimeFontLinks = [...html.matchAll(/<link\b[^>]*>/gi)].filter((match) =>
          match[0].includes(fontOnlyHref),
        );
        if (parseTimeFontLinks.length) {
          fail(`${documentPath} must not parse-load its first-intent font stylesheet.`);
        }
        html = html.replace(
          /<\/body>/i,
          `  <script src="${intentScriptHref}" data-jq33-font-intent></script>\n  </body>`,
        );
        const intentScripts = [
          ...html.matchAll(
            /<script\b([^>]*data-jq33-font-intent[^>]*)>([\s\S]*?)<\/script>/gi,
          ),
        ];
        if (
          intentScripts.length !== 1 ||
          !/\bsrc\s*=/.test(intentScripts[0][1]) ||
          intentScripts[0][2].trim()
        ) {
          fail(`${documentPath} must contain exactly one external first-intent font script.`);
        }
      }
    }

    if (firstIntentFontRoutes.has(documentPath) && !html.includes("data-jq33-font-intent")) {
      fail(`${documentPath} is missing its first-intent font loader.`);
    }
    if (!firstIntentFontRoutes.has(documentPath) && html.includes("data-jq33-font-intent")) {
      fail(`${documentPath} must not receive the route-scoped first-intent font loader.`);
    }

    html = html.replace(/<script\b([^>]*\bsrc\s*=[^>]*)>/gi, (tag, attributes) => {
      if (/\b(?:defer|async)\b/i.test(attributes)) return tag;
      return `<script defer${attributes}>`;
    });
    if (!html.includes(releaseFingerprint)) {
      html = html.replace(
        /<\/head>/i,
        `<meta name="jq33-release" content="${releaseFingerprint}">\n</head>`,
      );
    }
    html = await minifyHtml(html, {
      caseSensitive: true,
      collapseBooleanAttributes: true,
      collapseWhitespace: true,
      conservativeCollapse: true,
      decodeEntities: false,
      keepClosingSlash: true,
      minifyCSS: false,
      minifyJS: false,
      removeAttributeQuotes: false,
      removeComments: true,
      removeEmptyAttributes: false,
      removeOptionalTags: false,
      removeRedundantAttributes: false,
      sortAttributes: false,
      sortClassName: false,
    });
    fs.writeFileSync(filePath, html, "utf8");
  }
  if (firstIntentRouteCount !== firstIntentFontRoutes.size) {
    fail(
      `Expected ${firstIntentFontRoutes.size} first-intent font routes; built ${firstIntentRouteCount}.`,
    );
  }
};

// HTML parsing normalizes CRLF and lone CR line endings inside inline elements
// to LF before CSP hashes are evaluated. Hash the browser-visible source so a
// Windows checkout produces the same policy as Linux CI and the deployed page.
const normalizeInlineCspSource = (value) => value.replace(/\r\n?/g, "\n");
const sha256Source = (value) =>
  `'sha256-${crypto
    .createHash("sha256")
    .update(normalizeInlineCspSource(value), "utf8")
    .digest("base64")}'`;

const collectCspHashes = () => {
  const scriptHashes = new Set();
  const styleHashes = new Set();
  const htmlFiles = walkFiles(distDir).filter((filePath) => filePath.endsWith(".html"));

  for (const filePath of htmlFiles) {
    const html = fs.readFileSync(filePath, "utf8");
    for (const match of html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)) {
      if (match[1]) scriptHashes.add(sha256Source(match[1]));
    }
    for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      if (match[1]) styleHashes.add(sha256Source(match[1]));
    }
    for (const match of html.matchAll(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi)) {
      if (match[2]) styleHashes.add(sha256Source(match[2]));
    }
    for (const match of html.matchAll(/\son[a-z]+\s*=\s*(["'])([\s\S]*?)\1/gi)) {
      if (match[2]) scriptHashes.add(sha256Source(match[2]));
    }
  }

  return {
    scriptHashes: [...scriptHashes].sort().join(" "),
    styleHashes: [...styleHashes].sort().join(" "),
  };
};

const writeHeaders = (integrations) => {
  const templatePath = path.join(rootDir, "_headers");
  if (!fs.existsSync(templatePath)) fail("Required host-control file is missing: _headers");
  const { scriptHashes, styleHashes } = collectCspHashes();
  const output = fs
    .readFileSync(templatePath, "utf8")
    .replaceAll("{{CSP_SCRIPT_HASHES}}", scriptHashes)
    .replaceAll("{{CSP_STYLE_HASHES}}", styleHashes)
    .replaceAll("{{FORM_ACTION_ORIGIN}}", integrations.formActionOrigin)
    .replace("font-src 'self';", "font-src 'self' data:;");
  if (!/(?:^|;)\s*font-src\s+'self'\s+data:\s*;/i.test(output)) {
    fail("Generated _headers must allow only self and data: homepage font sources.");
  }
  if (/{{[^{}\r\n]+}}/.test(output)) {
    fail("_headers contains an unresolved build token.");
  }
  fs.writeFileSync(
    path.join(distDir, "_headers"),
    normalizeTextLineEndings(output),
    "utf8",
  );
};

const assertConfiguredUrlsOnly = (integrations) => {
  const textExtensions = new Set([".css", ".html", ".js", ".svg", ".txt", ".xml"]);
  const unexpected = [];
  for (const filePath of walkFiles(distDir)) {
    if (!textExtensions.has(path.extname(filePath).toLowerCase())) continue;
    const content = fs.readFileSync(filePath, "utf8");
    for (const match of content.matchAll(/https:\/\/calendly\.com\/[^\s"'<>`)]+/gi)) {
      const candidate = match[0].replace(/[.,;]+$/, "");
      if (candidate !== integrations.calendly) {
        unexpected.push(`${normalizeRelative(path.relative(distDir, filePath))}: ${candidate}`);
      }
    }
  }
  if (unexpected.length) {
    fail(`Unconfigured Calendly URLs found:\n${unexpected.join("\n")}`);
  }
};

try {
  assertExactDistPath();
  const integrations = validateIntegrations();
  const profiles = getSocialProfiles();

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir);

  for (const relativePath of handAuthoredFiles) copyFile(relativePath);
  copyFile("assets/css/site.css");
  copyFile("assets/css/critical-shared.css");
  copyFile("assets/css/home-font.css");
  const homeFontCssPath = path.join(distDir, "assets/css/home-font.css");
  const homeFontCss = fs.readFileSync(homeFontCssPath, "utf8");
  const routeScopedHomeFontCss = homeFontCss.replace(
    'font-family: "Permanent Marker";',
    'font-family: "Permanent Marker Home";',
  );
  if (routeScopedHomeFontCss === homeFontCss) {
    fail("Homepage subset font family could not be scoped unambiguously.");
  }
  fs.writeFileSync(homeFontCssPath, normalizeTextLineEndings(routeScopedHomeFontCss), "utf8");
  for (const relativePath of publicScriptFiles) copyFile(relativePath);
  for (const assetTree of publicAssetTrees) copyTree(assetTree);

  run("scripts/generate-responsive-images.mjs");
  run("scripts/generate-projects.mjs");
  run("scripts/generate-journal.mjs");
  run("scripts/generate-sitemap.mjs");

  replaceBuildTokens(integrations, profiles);
  const {
    homeSubset,
    commercialH1Subset,
    homeCriticalLatoSubset,
    commercialCriticalLato400Subset,
    commercialCriticalLato700Subset,
  } = await createProductionFontSubsets();
  inlineHomepageFontSubset(homeSubset);
  await externalizeInlineAssets({
    commercialH1Subset,
    homeCriticalLatoSubset,
    commercialCriticalLato400Subset,
    commercialCriticalLato700Subset,
  });
  pruneUnreferencedAssets();
  assertConfiguredUrlsOnly(integrations);
  writeHeaders(integrations);

  const checkArguments = [
    "scripts/check-dist.mjs",
    "--root",
    distDir,
    "--write-manifest",
    path.join(rootDir, "dist-manifest.json"),
  ];
  if (allowTestFixtures) checkArguments.push("--allow-test-fixtures");
  const checkResult = spawnSync(
    process.execPath,
    checkArguments,
    { cwd: rootDir, stdio: "inherit", env: process.env },
  );
  if (checkResult.status !== 0) process.exit(checkResult.status ?? 1);

  console.log(`Clean static distribution built at ${distDir}.`);
} catch (error) {
  console.error(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
