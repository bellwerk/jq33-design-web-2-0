import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const failures = [];

const read = (relativePath) =>
  fs.readFileSync(path.join(rootDir, relativePath), "utf8");

const walk = (directory, files = []) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".agent", ".git", ".hallmark", "dist", "node_modules", "test-results"].includes(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if ([".html", ".css", ".js", ".mjs"].includes(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
};

const extractCssSources = (filePath, source) => {
  if (path.extname(filePath) === ".css") return [source];
  if (path.extname(filePath) !== ".html") return [];
  return [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(
    (match) => match[1],
  );
};

const collectCssRules = (filePath, source) =>
  extractCssSources(filePath, source).flatMap((css) =>
    [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
      selector: match[1].replace(/\s+/g, " ").trim(),
      body: match[2],
    })),
  );

const cssValues = (body, property) =>
  [...body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "gi"))].map(
    (match) => match[1].trim(),
  );

const cssDeclarations = (body) =>
  Object.fromEntries(
    [...body.matchAll(/(?:^|;)\s*(?<property>--?[\w-]+|[a-z][\w-]*)\s*:\s*(?<value>[^;]+)/gi)].map(
      (match) => [
        match.groups.property.toLowerCase(),
        match.groups.value.replace(/\s+/g, " ").trim().toLowerCase(),
      ],
    ),
  );

const selectorTargets = (selector, exactSelector) =>
  selector
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(",")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .includes(exactSelector);

const selectedRuleSignatures = (source, selector, properties) =>
  collectCssRules("shared.css", source)
    .filter((rule) => selectorTargets(rule.selector, selector))
    .map((rule) => {
      const declarations = cssDeclarations(rule.body);
      return Object.fromEntries(
        properties
          .filter((property) => Object.hasOwn(declarations, property))
          .map((property) => [property, declarations[property]]),
      );
    })
    .filter((signature) => Object.keys(signature).length > 0);

const hasHeroBackingSurface = (body) => {
  const paintedBackground = cssValues(
    body,
    "background(?:-color|-image)?",
  ).some((value) => !/^(?:none|transparent)(?:\s*!important)?$/i.test(value));
  const visibleBorder = cssValues(body, "border(?:-[a-z-]+)?").some(
    (value) => !/^(?:0(?:px)?|none|transparent)(?:\s*!important)?$/i.test(value),
  );
  const rounded = cssValues(body, "border-radius").some(
    (value) => !/^0(?:px)?(?:\s*!important)?$/i.test(value),
  );
  const shadowed = cssValues(body, "box-shadow").some(
    (value) => !/^none(?:\s*!important)?$/i.test(value),
  );
  const blurred = cssValues(body, "(?:-webkit-)?backdrop-filter").some(
    (value) => !/^none(?:\s*!important)?$/i.test(value),
  );
  const padded = cssValues(body, "padding(?:-[a-z-]+)?").some(
    (value) => !/^(?:0(?:px)?)(?:\s*!important)?$/i.test(value),
  );
  return paintedBackground || visibleBorder || rounded || shadowed || blurred || padded;
};

const findUngatedHoverSelectors = (css) => {
  const failures = [];
  const stack = [];
  let boundary = 0;
  let quote = "";
  let inComment = false;

  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    const next = css[index + 1];

    if (inComment) {
      if (character === "*" && next === "/") {
        inComment = false;
        index += 1;
        boundary = index + 1;
      }
      continue;
    }
    if (!quote && character === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }
    if (quote) {
      if (character === "\\") {
        index += 1;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") {
      const prelude = css.slice(boundary, index).trim();
      const isHoverCapabilityMedia =
        /^@media\b/i.test(prelude) &&
        /\(\s*hover\s*:\s*hover\s*\)/i.test(prelude) &&
        /\(\s*pointer\s*:\s*fine\s*\)/i.test(prelude);
      if (
        /:hover\b/i.test(prelude) &&
        !isHoverCapabilityMedia &&
        !stack.some((context) => context.isHoverCapabilityMedia)
      ) {
        failures.push(prelude.replace(/\s+/g, " ").slice(0, 180));
      }
      stack.push({ isHoverCapabilityMedia });
      boundary = index + 1;
      continue;
    }
    if (character === "}") {
      stack.pop();
      boundary = index + 1;
      continue;
    }
    if (character === ";") {
      boundary = index + 1;
    }
  }
  return failures;
};

const sourceFiles = walk(rootDir).filter(
  (filePath) => path.resolve(filePath) !== path.resolve(__filename)
);
for (const filePath of sourceFiles) {
  const relativePath = path.relative(rootDir, filePath);
  const source = fs.readFileSync(filePath, "utf8");

  if (/cursor-dot|cursor-hover|hoverCursor|leaveCursor|id=["']cursor["']/i.test(source)) {
    failures.push(`${relativePath} still contains the removed cursor follower.`);
  }

  if (/overflow-x\s*:\s*hidden/i.test(source)) {
    failures.push(`${relativePath} uses overflow-x: hidden instead of fixing or clipping geometry.`);
  }

  if (/transition\s*:[^;]*(?:^|[\s,])width(?:[\s,]|$)/im.test(source)) {
    failures.push(`${relativePath} animates width instead of transform/opacity.`);
  }

  const remoteInter = /family=Inter(?=[:&"'])|@import[^;]*\bInter\b/i.test(source);
  const rawInterSource = relativePath === "tokens.css"
    ? source
        .replace(/@font-face\s*\{[^{}]*font-family\s*:\s*["']Inter["'][^{}]*\}/gi, "")
        .replace(/--font-hero\s*:\s*["']Inter["']\s*,\s*var\(--font-body\)\s*;/gi, "")
    : source;
  if (remoteInter || /font-family\s*[:=]\s*["']?Inter/i.test(rawInterSource)) {
    failures.push(`${relativePath} loads or declares Inter outside the self-hosted homepage hero token.`);
  }

  if (
    path.extname(filePath) === ".html" &&
    /\svid=["']\d+["']/i.test(source)
  ) {
    failures.push(`${relativePath} still contains browser-inspector vid attributes.`);
  }

  if (
    path.extname(filePath) === ".html" &&
    /<div\b[^>]*class=["'][^"']*\bgrain\b[^"']*["'](?![^>]*\baria-hidden=["']true["'])[^>]*>/i.test(
      source
    )
  ) {
    failures.push(`${relativePath} exposes decorative grain to assistive technology.`);
  }

  if (
    path.extname(filePath) === ".html" &&
    /<div\b[^>]*class=["'][^"']*\bbg-layer\b[^"']*["'](?![^>]*\baria-hidden=["']true["'])[^>]*>\s*<\/div>/i.test(
      source,
    )
  ) {
    failures.push(`${relativePath} exposes an empty decorative background layer to assistive technology.`);
  }

  if (path.extname(filePath) === ".html") {
    extractCssSources(filePath, source).forEach((css, index) => {
      const isProjectsIndex = [
        path.join("projects", "_projects-index-template.html"),
        path.join("projects", "index.html"),
      ].includes(relativePath);
      const stampPattern = isProjectsIndex
        ? /^\s*\/\*\s*Hallmark\s+·\s+genre:\s*editorial\s+·\s+macrostructure:\s*Portfolio Grid\s+·\s+user override:\s*mandatory circular marquee overlap\s*\*\//i
        : /^\s*\/\*\s*Hallmark\s+·\s+macrostructure:\s*Photographic\s+·\s+tone:\s*atmospheric editorial\s+·\s+anchor hue:\s*cobalt\s*\*\//i;
      if (
        !stampPattern.test(css)
      ) {
        failures.push(
          `${relativePath} inline style block ${index + 1} must begin with its approved Hallmark macrostructure stamp.`,
        );
      }
    });
  }

  if (!relativePath.startsWith(`admin${path.sep}`)) {
    for (const css of extractCssSources(filePath, source)) {
      for (const selector of findUngatedHoverSelectors(css)) {
        const sharedNavigationStateReset =
          /(?:header\.header-nav|\.nav-drawer)/i.test(selector) &&
          /:hover\b/i.test(selector) &&
          /:focus(?:-visible)?\b/i.test(selector);
        if (sharedNavigationStateReset) continue;
        failures.push(
          `${relativePath} exposes hover feedback without hover/pointer capability gating: ${selector}`,
        );
      }
    }
  }
}

const navigationSelectorPattern =
  /(?:^|[^\w-])(?:header\s*\.header-nav|\.header-nav|\.nav-group|\.nav-item|\.nav-logo|\.nav-link|\.nav-toggle|\.nav-drawer|\.nav-overlay)(?![\w-])/i;
const publicHtmlRoots = new Set([
  "commercial-interior-design-montreal",
  "contact",
  "inquiry",
  "journal",
  "privacy",
  "projects",
  "terms",
]);
const publicAndTemplateHtml = sourceFiles.filter((filePath) => {
  if (path.extname(filePath) !== ".html") return false;
  const relativePath = path.relative(rootDir, filePath);
  const parts = relativePath.split(path.sep);
  return ["404.html", "index.html"].includes(relativePath) || publicHtmlRoots.has(parts[0]);
});
const sharedNavigationCacheKey = "20260824-global-nav-final-2";
const sharedNavigationCacheConsumers = [
  ...publicAndTemplateHtml,
  path.join(rootDir, "admin", "portfolio", "index.html"),
];

for (const filePath of sharedNavigationCacheConsumers) {
  const relativePath = path.relative(rootDir, filePath);
  const source = fs.readFileSync(filePath, "utf8");
  const tokenCssLinks = [
    ...source.matchAll(/href=["']\/tokens\.css(?:\?([^"']*))?["']/gi),
  ];
  if (
    tokenCssLinks.length !== 1 ||
    tokenCssLinks[0][1] !== `v=${sharedNavigationCacheKey}`
  ) {
    failures.push(
      `${relativePath} must load the shared token stylesheet once with cache key ${sharedNavigationCacheKey}.`,
    );
  }
  const siteCssLinks = [
    ...source.matchAll(/href=["']\/assets\/css\/site\.css(?:\?([^"']*))?["']/gi),
  ];
  if (
    siteCssLinks.length !== 1 ||
    siteCssLinks[0][1] !== `v=${sharedNavigationCacheKey}`
  ) {
    failures.push(
      `${relativePath} must load the shared site stylesheet once with cache key ${sharedNavigationCacheKey}.`,
    );
  }
  if (
    tokenCssLinks.length === 1 &&
    siteCssLinks.length === 1 &&
    tokenCssLinks[0].index >= siteCssLinks[0].index
  ) {
    failures.push(`${relativePath} must load tokens.css before the shared site stylesheet.`);
  }
  const criticalCssLinks = [
    ...source.matchAll(/href=["']\/assets\/css\/critical-shared\.css(?:\?([^"']*))?["']/gi),
  ];
  if (
    criticalCssLinks.some((link) => link[1] !== `v=${sharedNavigationCacheKey}`)
  ) {
    failures.push(
      `${relativePath} must use cache key ${sharedNavigationCacheKey} for critical shared navigation CSS.`,
    );
  }
}

for (const filePath of publicAndTemplateHtml) {
  const relativePath = path.relative(rootDir, filePath);
  const source = fs.readFileSync(filePath, "utf8");
  for (const rule of collectCssRules(relativePath, source)) {
    if (navigationSelectorPattern.test(rule.selector)) {
      failures.push(
        `${relativePath} contains page-local shared-navigation selector: ${rule.selector.slice(0, 180)}.`,
      );
    }
  }

  const inlineScripts = [...source.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (match) => match[1],
  );
  for (const script of inlineScripts) {
    const referencesSharedMenu =
      /header\.header-nav|#site-nav-drawer|\.nav-group|\.nav-link|\bnavItems\b|\bdrawerNav\b/i.test(
        script,
      );
    const mutatesMarkup =
      /\.innerHTML\s*=|\.outerHTML\s*=|\.insertAdjacentHTML\s*\(|\.replaceChildren\s*\(|\.append(?:Child)?\s*\(/i.test(
        script,
      );
    if (referencesSharedMenu && mutatesMarkup) {
      failures.push(`${relativePath} mutates the shared header or drawer menu after component mount.`);
    }
  }
}

const tokensCss = read("tokens.css");
const criticalCss = read("assets/css/critical-shared.css");
const sharedCss = read("assets/css/site.css");
const navigationTokenDeclarations = [
  ...tokensCss.matchAll(/--color-nav\s*:\s*([^;]+)\s*;/gi),
];
if (
  navigationTokenDeclarations.length !== 1 ||
  navigationTokenDeclarations[0][1].trim().toLowerCase() !== "#5427e1"
) {
  failures.push("tokens.css must declare --color-nav exactly once as #5427E1.");
}
const navigationHexOccurrences = tokensCss.match(/#5427e1\b/gi) || [];
if (navigationHexOccurrences.length !== 1) {
  failures.push("The exact #5427E1 navigation color must have one token authority in tokens.css.");
}
const navigationSurfaceDeclarations = [
  ...tokensCss.matchAll(/--color-nav-surface\s*:\s*([^;]+)\s*;/gi),
];
if (
  navigationSurfaceDeclarations.length !== 1 ||
  navigationSurfaceDeclarations[0][1].trim().replace(/\s+/g, " ").toLowerCase() !==
    "rgb(246 245 240)"
) {
  failures.push("tokens.css must declare one opaque shared paper navigation surface as rgb(246 245 240).");
}
if (
  !/--font-body\s*:\s*["']Lato["']/i.test(tokensCss) ||
  !/--font-sans\s*:\s*var\(--font-body\)/i.test(tokensCss)
) {
  failures.push("The shared sans-serif typography token must use Lato.");
}
if (
  !/--font-display\s*:\s*var\(--font-heading\)/i.test(tokensCss) ||
  !/--font-heading\s*:\s*["']Permanent Marker["']/i.test(tokensCss)
) {
  failures.push("The display typography token must resolve to Permanent Marker.");
}
if (!/--font-hero\s*:\s*["']Inter["']\s*,\s*var\(--font-body\)/i.test(tokensCss)) {
  failures.push("The homepage hero typography token must use the self-hosted Inter family with the body fallback.");
}
const fontFaces = [...tokensCss.matchAll(/@font-face\s*\{([\s\S]*?)\}/gi)].map(
  (match) => match[1],
);
const heroFontFace = fontFaces.find((face) =>
  /font-family\s*:\s*["']Inter["']/i.test(face),
);
if (
  !heroFontFace ||
  !/src\s*:\s*url\(["']?(?:\.\/|\/)assets\/fonts\/inter\/inter-latin-400-900\.woff2["']?\)\s*format\(["']woff2["']\)/i.test(
    heroFontFace,
  ) ||
  !/font-weight\s*:\s*400\s+900/i.test(heroFontFace)
) {
  failures.push("The homepage hero must load its local variable Inter font without a remote dependency.");
}
if (
  !fontFaces.length ||
  fontFaces.some((face) => !/font-display\s*:\s*swap/i.test(face))
) {
  failures.push("Every production webfont and metric fallback must use font-display: swap.");
}
for (const fallback of ["Lato Metric Fallback", "Permanent Marker Metric Fallback"]) {
  const face = fontFaces.find((candidate) =>
    new RegExp(`font-family\\s*:\\s*["']${fallback}["']`, "i").test(candidate)
  );
  if (
    !face ||
    !/size-adjust\s*:/i.test(face) ||
    !/ascent-override\s*:/i.test(face) ||
    !/descent-override\s*:/i.test(face) ||
    !/line-gap-override\s*:/i.test(face)
  ) {
    failures.push(`${fallback} must define complete font metric overrides.`);
  }
}
if (!/--gradient-accent\s*:\s*var\(--color-accent\)/i.test(tokensCss)) {
  failures.push("The accent treatment must resolve to a solid semantic color.");
}
if (/--color-ink\s*:\s*(?:#000(?:000)?|rgb\(\s*0\s+0\s+0\s*\))/i.test(tokensCss)) {
  failures.push("The base ink must remain intentionally tinted rather than pure black.");
}

const siteCss = read("assets/css/site.css");
const sharedRules = collectCssRules("assets/css/site.css", siteCss);
const criticalRules = collectCssRules("assets/css/critical-shared.css", criticalCss);

const navigationCoreProperties = [
  "font-family",
  "position",
  "inset",
  "top",
  "right",
  "bottom",
  "left",
  "width",
  "min-width",
  "max-width",
  "height",
  "min-height",
  "max-height",
  "box-sizing",
  "display",
  "flex-direction",
  "flex-wrap",
  "align-items",
  "justify-content",
  "gap",
  "row-gap",
  "column-gap",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "border",
  "border-width",
  "border-style",
  "border-color",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-radius",
  "background",
  "background-color",
  "background-image",
  "backdrop-filter",
  "-webkit-backdrop-filter",
  "opacity",
  "visibility",
  "pointer-events",
  "z-index",
  "color",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-transform",
  "text-decoration",
  "list-style",
  "object-fit",
  "cursor",
  "transition",
];
const synchronizedNavigationSelectors = [
  "header.header-nav",
  "header.header-nav .nav-group",
  "header.header-nav .nav-item",
  "header.header-nav .nav-item > .label",
  "header.header-nav .nav-logo",
  "header.header-nav a",
  "header.header-nav .nav-link",
  "header.header-nav .nav-toggle",
  "header.header-nav .nav-toggle-bars",
  "header.header-nav .nav-toggle-bars span",
  ".nav-overlay",
  ".nav-drawer",
  ".nav-drawer .drawer-top",
  ".nav-drawer .drawer-title",
  ".nav-drawer nav",
  ".nav-drawer nav a",
  "body.is-nav-open .nav-overlay",
  "body.is-nav-open .nav-drawer",
];
for (const selector of synchronizedNavigationSelectors) {
  const criticalSignatures = selectedRuleSignatures(
    criticalCss,
    selector,
    navigationCoreProperties,
  );
  const finalSignatures = selectedRuleSignatures(siteCss, selector, navigationCoreProperties);
  if (JSON.stringify(criticalSignatures) !== JSON.stringify(finalSignatures)) {
    failures.push(
      `First-paint and final shared navigation declarations differ for ${selector}.`,
    );
  }
}

for (const [label, selector, property, value] of [
  ["header", "header.header-nav", "font-family", "var(--font-sans)"],
  ["header brand label", "header.header-nav .nav-item > .label", "color", "var(--color-nav)"],
  ["header home link", "header.header-nav .nav-item", "position", "relative"],
  ["header home link", "header.header-nav .nav-item", "text-decoration", "none"],
  ["header primary links", "header.header-nav .nav-link", "color", "var(--color-nav)"],
  ["header primary links", "header.header-nav .nav-link", "font-size", "0.78rem"],
  ["header primary links", "header.header-nav .nav-link", "font-weight", "600"],
  ["header primary links", "header.header-nav .nav-link", "letter-spacing", "1px"],
  ["header primary links", "header.header-nav .nav-link", "text-decoration", "none"],
  ["mobile toggle", "header.header-nav .nav-toggle", "color", "var(--color-nav)"],
  ["drawer", ".nav-drawer", "font-family", "var(--font-sans)"],
  ["drawer title", ".nav-drawer .drawer-title", "color", "var(--color-nav)"],
  ["drawer route links", ".nav-drawer nav a", "position", "relative"],
  ["drawer route links", ".nav-drawer nav a", "color", "var(--color-nav)"],
  ["drawer links", ".nav-drawer a", "text-decoration", "none"],
]) {
  for (const [sheet, rules] of [
    ["first-paint", criticalRules],
    ["final", sharedRules],
  ]) {
    const matched = rules
      .filter((rule) => selectorTargets(rule.selector, selector))
      .map((rule) => cssDeclarations(rule.body))
      .some((declarations) => declarations[property] === value);
    if (!matched) {
      failures.push(`${sheet} CSS must set ${label} ${property} to ${value}.`);
    }
  }
}

for (const [sheet, rules] of [
  ["first-paint", criticalRules],
  ["final", sharedRules],
]) {
  for (const rule of rules) {
    const selector = rule.selector.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
    const targetsHeaderPrimary =
      /header\.header-nav[^,{]*(?:\.label|\.nav-link|\.nav-toggle|\ba\b)/i.test(selector);
    const targetsDrawerPrimary =
      /\.nav-drawer[^,{]*(?:\.drawer-title|\bnav\b[^,{]*(?:>\s*)?a\b)/i.test(selector) &&
      !/\.drawer-cta\b/i.test(selector);
    if (!targetsHeaderPrimary && !targetsDrawerPrimary) continue;

    const declarations = cssDeclarations(rule.body);
    if (declarations.color && declarations.color !== "var(--color-nav)") {
      failures.push(`${sheet} navigation selector changes #5427E1 through ${selector}.`);
    }
    if (/::(?:before|after)\b/i.test(selector)) {
      if (
        !/^none(?:\s*!important)?$/.test(declarations.content || "") ||
        !/^none(?:\s*!important)?$/.test(declarations.display || "")
      ) {
        failures.push(`${sheet} navigation pseudo-elements must remain non-rendering: ${selector}.`);
      }
    }
    if (
      declarations["text-decoration"] &&
      !/^none(?:\s*!important)?$/.test(declarations["text-decoration"])
    ) {
      failures.push(`${sheet} navigation selector underlines menu text: ${selector}.`);
    }
    if (
      declarations["background-image"] &&
      !/^none(?:\s*!important)?$/.test(declarations["background-image"])
    ) {
      failures.push(`${sheet} navigation selector draws a background-image underline: ${selector}.`);
    }
  }
}
if (/:root\s*\{/i.test(siteCss)) {
  failures.push("assets/css/site.css must consume tokens.css rather than declaring a parallel :root token authority.");
}
if (!/:where\(html, body\)\s*\{[^}]*overflow-x\s*:\s*clip/is.test(siteCss)) {
  failures.push("assets/css/site.css must apply overflow-x: clip to both html and body.");
}
if (!/--focus-ring\s*:\s*var\(--color-cobalt-bright\)/i.test(tokensCss)) {
  failures.push("Focus ring token must retain the verified 3:1+ cross-surface color.");
}
if (!/white-space\s*:\s*nowrap/i.test(siteCss)) {
  failures.push("Shared action and navigation labels must be protected from wrapping.");
}
if (!/--radius-control\s*:\s*30px/i.test(tokensCss)) {
  failures.push("Shared button geometry must use the approved 30px radius.");
}
if (!/--radius-card\s*:\s*20px/i.test(tokensCss)) {
  failures.push("Content-card geometry must use the approved 20px radius.");
}
if (!/--radius-container\s*:\s*30px/i.test(tokensCss)) {
  failures.push("Panel and container geometry must use the approved 30px radius.");
}
if (
  !/--control-height\s*:\s*52px/i.test(tokensCss) ||
  !/:where\([^{}]*input:not[^{}]*select\)\s*\{[^}]*height\s*:\s*var\(--control-height\)[^}]*min-height\s*:\s*var\(--control-height\)/is.test(
    siteCss,
  ) ||
  !/:where\(\.btn,\s*\.cta-button,\s*button\[type=["']submit["']\]\)\s*\{[^}]*min-height\s*:\s*var\(--control-height\)/is.test(
    siteCss,
  )
) {
  failures.push("Single-line fields and adjacent actions must share the 52px control-height token.");
}
if (!/--ease-standard\s*:\s*cubic-bezier\(/i.test(tokensCss)) {
  failures.push("Standard motion must use a crafted easing curve rather than raw ease.");
}
if (
  !/:where\(h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\)\s*\{[^}]*font-family\s*:\s*var\(--font-brand\)\s*!important/is.test(
    siteCss
  )
) {
  failures.push("All semantic heading levels must use the Permanent Marker brand font.");
}
if (
  !/:where\(h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\)\s*\{[^}]*min-width\s*:\s*0[^}]*overflow-wrap\s*:\s*anywhere/is.test(
    siteCss
  ) ||
  !/h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\s*\{[^}]*min-width\s*:\s*0[^}]*overflow-wrap\s*:\s*anywhere/is.test(
    criticalCss
  )
) {
  failures.push("Shared and first-paint heading rules must guard against narrow-width overflow.");
}
if (
  !/:where\([^}]*\):active\s*\{[^}]*background\s*:\s*var\(--color-accent\)/is.test(
    siteCss
  ) ||
  !/\):disabled,[\s\S]{0,500}\[aria-disabled=["']true["']\]\s*\{[^}]*opacity\s*:\s*0\.55[^}]*pointer-events\s*:\s*none/is.test(
    siteCss
  )
) {
  failures.push("Shared controls must expose explicit active and disabled states.");
}
if (
  /:where\(\.btn,\s*\.cta-button,\s*\[aria-disabled=["']true["']\]\)\s*\{/is.test(
    siteCss
  )
) {
  failures.push("Enabled .btn and .cta-button controls must not inherit disabled styling.");
}
const anchorActiveRule = sharedRules.find(
  ({ selector }) =>
    /:where\(\s*a\[href\]\s*,\s*summary\s*\):active/i.test(selector),
);
const anchorDisabledRule = sharedRules.find(
  ({ selector }) =>
    /:where\(\s*a\[href\]\s*,\s*summary\s*\)\[aria-disabled=["']true["']\]/i.test(
      selector,
    ),
);
if (!anchorActiveRule || !/opacity\s*:/i.test(anchorActiveRule.body)) {
  failures.push("Shared anchors and summaries must expose an explicit active state.");
}
if (
  !anchorDisabledRule ||
  !/cursor\s*:\s*not-allowed/i.test(anchorDisabledRule.body) ||
  !/opacity\s*:\s*0\.55/i.test(anchorDisabledRule.body) ||
  !/pointer-events\s*:\s*none/i.test(anchorDisabledRule.body)
) {
  failures.push("Shared anchors and summaries must expose aria-disabled styling.");
}
const cardRadiusRules = sharedRules.filter(({ body }) =>
  /border-radius\s*:\s*var\(--radius-card\)\s*!important/i.test(body),
);
const containerRadiusRules = sharedRules.filter(({ body }) =>
  /border-radius\s*:\s*var\(--radius-container\)\s*!important/i.test(body),
);
if (
  cardRadiusRules.some(({ selector }) => /\.error-panel\b/i.test(selector)) ||
  !containerRadiusRules.some(({ selector }) => /\.error-panel\b/i.test(selector))
) {
  failures.push(".error-panel must use the 30px container radius, not the 20px card radius.");
}
if (
  !/\.field-error\s*\{[^}]*min-height\s*:\s*1lh/is.test(siteCss)
) {
  failures.push("Field-error slots must reserve stable space before validation.");
}
if (
  !/header\.header-nav\s*\{[^}]*align-items\s*:\s*center/is.test(siteCss) ||
  !/header\.header-nav\s*\{[^}]*align-items\s*:\s*center/is.test(criticalCss)
) {
  failures.push("Shared navigation must remain vertically centered in final and first-paint CSS.");
}
if (
  !/\.site-footer\s*\{[^}]*border-top\s*:\s*1px\s+solid\s+var\(--color-cobalt-a45\)[^}]*grid-template-columns\s*:\s*minmax\(7rem,\s*0\.34fr\)\s+minmax\(11rem,\s*0\.46fr\)\s+minmax\(0,\s*1\.2fr\)[^}]*color\s*:\s*var\(--color-warm-paper\)[^}]*font-family\s*:\s*var\(--font-sans\)/is.test(
    siteCss,
  )
) {
  failures.push("The shared Ft4 footer must keep the approved top rule, desktop grid, warm-paper foreground, and JQ33 sans typography.");
}
if (
  !/\.site-footer::before\s*\{[^}]*grid-column\s*:\s*1[^}]*background\s*:\s*url\(["']\/assets\/logo\/logo%20purple%20svg\.svg["']\)\s+center\s*\/\s*contain\s+no-repeat/is.test(
    siteCss,
  )
) {
  failures.push("The shared Ft4 footer must render the approved cobalt logo in its first column.");
}
if (
  !/\.site-footer\s+\.info-pillar,\s*\.site-footer\s+\.info-pillar\.pillar-right\s*\{[^}]*padding\s*:\s*0[^}]*border\s*:\s*0[^}]*border-radius\s*:\s*0\s*!important[^}]*background\s*:\s*transparent/is.test(
    siteCss,
  )
) {
  failures.push("Shared footer pillars must remain transparent, square, and unboxed.");
}
if (
  !/\.site-footer\s+\.info-pillar\s+\.label\s*\{[^}]*color\s*:\s*var\(--color-cobalt-bright\)/is.test(
    siteCss,
  )
) {
  failures.push("Shared footer labels must use the approved bright cobalt token.");
}
if (
  !/@media\s*\(max-width:\s*48rem\)\s*\{[\s\S]*?\.site-footer\s*\{[^}]*grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/i.test(
    siteCss,
  )
) {
  failures.push("The shared Ft4 footer must collapse to one column at the approved mobile breakpoint.");
}

const home = read("index.html");
const homeRules = collectCssRules("index.html", home);
const homeFaqHoverRules = homeRules.filter(({ selector }) =>
  /(?:^|,)\s*\.panel--faq\s+\.faq-question:hover\s*(?:,|$)/i.test(selector),
);
if (
  !homeFaqHoverRules.length ||
  homeFaqHoverRules.some(
    ({ body }) =>
      !/color\s*:/i.test(body) ||
      /(?:opacity|filter|transform|background(?:-color)?|box-shadow)\s*:/i.test(body),
  )
) {
  failures.push("Homepage FAQ hover feedback must change color only.");
}
const homePhotoRules = homeRules.filter(({ selector }) =>
  /(?:^|,)\s*\.panel--home\s+\.bg-layer\s*(?:,|$)/i.test(selector),
);
if (
  !homePhotoRules.some(({ body }) =>
    /filter\s*:\s*grayscale\(20%\)\s+contrast\(110%\)/i.test(body),
  ) ||
  !homeRules.some(
    ({ selector, body }) =>
      /(?:^|,)\s*\.bg-layer\s*>\s*img\s*(?:,|$)/i.test(selector) &&
      /object-fit\s*:\s*cover/i.test(body) &&
      /object-position\s*:\s*center/i.test(body),
  )
) {
  failures.push("Homepage hero photograph must keep the old centered cover crop and grayscale/contrast filter.");
}
const homeOverlayRules = homeRules.filter(({ selector }) =>
  /(?:^|,)\s*\.panel--home::(?:before|after)\s*(?:,|$)/i.test(selector),
);
if (homeOverlayRules.some(({ body }) => hasHeroBackingSurface(body))) {
  failures.push("Homepage hero must not add a gradient, scrim, or painted pseudo-element overlay.");
}

const homeMarkRules = homeRules.filter(({ selector }) =>
  /(?:^|,)\s*\.panel--home\s+\.brand-mark\s*(?:,|$)/i.test(selector),
);
const homeMarkTextRules = homeRules.filter(({ selector }) =>
  /(?:^|,)\s*\.panel--home\s+\.brand-mark__text\s*(?:,|$)/i.test(selector),
);
if (
  !homeMarkRules.some(
    ({ body }) =>
      /font-size\s*:\s*clamp\(56px,\s*14vh,\s*220px\)/i.test(body) &&
      /line-height\s*:\s*0\.9(?:0+)?\s*;/i.test(body) &&
      /color\s*:\s*var\(--cobalt\)/i.test(body),
  ) ||
  !homeMarkRules.some(
    ({ body }) =>
      /text-shadow\s*:\s*0\s+0\s+20px\s+(?:rgba\(59,\s*65,\s*227,\s*0\.2\)|rgb\(59\s+65\s+227\s*\/\s*20%\)|var\(--color-cobalt-a20\))/i.test(
        body,
      ),
  ) ||
  homeMarkTextRules.some(({ body }) => hasHeroBackingSurface(body))
) {
  failures.push("Homepage hero mark must keep the old large transparent cobalt treatment without a backing card.");
}
if (
  !/@media\s*\(\s*max-width\s*:\s*768px\s*\)\s*\{[\s\S]{0,1800}?\.panel--home\s+\.brand-mark\s*\{[^}]*font-size\s*:\s*clamp\(45px,\s*11\.2vh,\s*176px\)/is.test(
    home,
  )
) {
  failures.push("Homepage hero mark must retain the old 11.2vh mobile and tablet scale.");
}
const sectionIds = ["home", "selected-work", "how", "pricing", "faq", "work"];
let previousPosition = -1;
for (const id of sectionIds) {
  const position = home.indexOf(`id="${id}"`);
  if (position < 0) {
    failures.push(`index.html is missing required homepage section #${id}.`);
  } else if (position <= previousPosition) {
    failures.push(`index.html homepage section #${id} is out of the approved order.`);
  }
  previousPosition = position;
}

if (/id=["']atelier["']|panel--atelier/i.test(home)) {
  failures.push("index.html still contains the redundant Atelier section or CSS.");
}
const homeSection = home.match(/<section\b[^>]*\bid=["']home["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] || "";
const heroActionTags = [...homeSection.matchAll(/<a\b[^>]*\bclass=["'][^"']*\bhero-action\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi)].map(
  (match) => match[0],
);
const primaryHeroAction = heroActionTags.find((tag) => /\bhero-action--primary\b/i.test(tag));
const secondaryHeroAction = heroActionTags.find((tag) => /\bhero-action--secondary\b/i.test(tag));
if (
  heroActionTags.length !== 2 ||
  !primaryHeroAction ||
  !/>\s*Book a call\s*<\/a>/i.test(primaryHeroAction) ||
  !/\bdata-calendly-cta(?:\s|=|>)/i.test(primaryHeroAction) ||
  !/\btarget=["']_blank["']/i.test(primaryHeroAction) ||
  !/\brel=["'][^"']*\bnoopener\b[^"']*\bnoreferrer\b[^"']*["']/i.test(primaryHeroAction) ||
  !secondaryHeroAction ||
  !/\bhref=["']\/projects\/["']/i.test(secondaryHeroAction) ||
  !/>\s*View projects\s*<\/a>/i.test(secondaryHeroAction)
) {
  failures.push("Homepage hero must preserve exactly the Book a call and View projects links and their integration attributes.");
}
const homeHeroActionRadiusRules = homeRules.filter(
  ({ selector, body }) =>
    /\.panel--home\s+\.hero-action\b/i.test(selector) && /border-radius\s*:/i.test(body),
);
if (
  !homeHeroActionRadiusRules.some(
    ({ selector, body }) =>
      /\.panel--home\s+\.hero-action\b/i.test(selector) &&
      /border-radius\s*:\s*0(?:px)?\s*!important/i.test(body),
  ) ||
  homeHeroActionRadiusRules.some(({ body }) =>
    cssValues(body, "border-radius").some(
      (value) => !/^0(?:px)?(?:\s*!important)?$/i.test(value),
    ),
  )
) {
  failures.push("Homepage hero actions must keep square corners without a competing home-specific radius rule.");
}
if (!/selected-project--feature[\s\S]*selected-supporting/i.test(home)) {
  failures.push("Selected Work must contain one dominant feature and supporting projects.");
}
if (!/grid-template-columns:\s*minmax\(0, 0\.88fr\)\s+minmax\(0, 1\.18fr\)/i.test(home)) {
  failures.push("Packages must give the featured package greater visual weight.");
}
if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)/i.test(home)) {
  failures.push("Homepage must include reduced-motion handling.");
}
const homeSubheadlineRules = homeRules.filter(({ selector }) =>
  /(?:^|,)\s*\.panel--home\s+\.header-subheadline\s*(?:,|$)/i.test(selector),
);
const homeSubheadlineMeasureRules = homeSubheadlineRules.filter(({ body }) =>
  /max-width\s*:/i.test(body),
);
if (
  !homeSubheadlineMeasureRules.length ||
  !homeSubheadlineMeasureRules.some(({ body }) =>
    /max-width\s*:\s*min\(80vw,\s*42ch\)/i.test(body),
  ) ||
  !/@media\s*\(\s*max-width\s*:\s*768px\s*\)\s*\{[\s\S]{0,2400}?\.panel--home\s+\.header-subheadline\s*\{[^}]*max-width\s*:\s*min\(84vw,\s*28ch\)/is.test(
    home,
  ) ||
  !/@media\s*\(\s*max-width\s*:\s*480px\s*\)\s*\{[\s\S]{0,1600}?\.panel--home\s+\.header-subheadline\s*\{[^}]*max-width\s*:\s*26ch/is.test(
    home,
  )
) {
  failures.push("Homepage subheadline must keep the old 42ch, 28ch, and 26ch responsive measures.");
}
if (
  !homeSubheadlineRules.some(({ body }) => /color\s*:\s*var\(--cobalt\)/i.test(body)) ||
  homeSubheadlineRules.some(({ body }) => hasHeroBackingSurface(body))
) {
  failures.push("Homepage subheadline must remain cobalt on the photograph without a backing surface.");
}
const homeInfoPillarRules = homeRules.filter(({ selector }) =>
  /(?:^|,)\s*\.panel--home\s+\.info-pillar\s*(?:,|$)/i.test(selector),
);
if (homeInfoPillarRules.some(({ body }) => hasHeroBackingSurface(body))) {
  failures.push("Homepage information pillars must remain transparent without cards, borders, blur, or shadows.");
}
for (const content of [
  "Now booking: Next 2-4 weeks",
  "Fast turnaround options (7-14 days)",
  "2727 Saint-Patrick St.",
  "Cafes · Salons · Clinics · Boutiques · Offices",
  "Layout + finishes + 3D visuals to decide fast",
]) {
  if (!homeSection.includes(content)) failures.push(`Homepage old-hero metadata is missing: ${content}`);
}
if (
  !/\.selected-header\s*\{[^}]*grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/is.test(
    home
  ) ||
  !/\.selected-header\s*>\s*p\s*\{[^}]*max-width\s*:\s*48ch/is.test(home)
) {
  failures.push("Selected Work must use a single-responsibility intro with a readable prose measure.");
}
if (
  !/\.final-cta\s*>\s*p:not\(\.final-cta__kicker\)\s*\{[^}]*max-width\s*:\s*48ch/is.test(home) ||
  !/\.selected-header\s+h2\s*\{[^}]*line-height\s*:\s*1(?:\.0+)?\s*;/is.test(home)
) {
  failures.push("Homepage display copy must preserve readable measure and marker-font line height.");
}
if (
  /\.how-step-card:hover/i.test(home) ||
  /\.selected-grid\s*\{[^}]*grid-template-columns\s*:\s*1fr\s*;/is.test(home) ||
  /\.selected-supporting\s*\{[^}]*grid-template-columns\s*:\s*1fr\s*;/is.test(home)
) {
  failures.push("Homepage noninteractive process rows must not imply clicks, and image grids must use minmax tracks.");
}

for (const label of [
  "01. Quote inputs",
  "02. Permits + stamps",
  "03. Contractor workflow",
  "04. Style clarity",
]) {
  if (!home.includes(label)) failures.push(`Homepage FAQ is missing concise label: ${label}.`);
}

const commercial = read("commercial-interior-design-montreal/index.html");
const notFound = read("404.html");
for (const [name, relativePath, source] of [
  ["Homepage", "index.html", home],
  ["Commercial", "commercial-interior-design-montreal/index.html", commercial],
  ["404", "404.html", notFound],
]) {
  const flexHeroActionRules = collectCssRules(relativePath, source).filter(
    ({ selector, body }) =>
      /(?:^|,)\s*\.hero-actions\s*(?:,|$)/i.test(selector) &&
      /display\s*:\s*flex/i.test(body),
  );
  if (
    !flexHeroActionRules.length ||
    flexHeroActionRules.some(({ body }) => !/align-items\s*:\s*center/i.test(body))
  ) {
    failures.push(`${name} flex hero-action rows must explicitly align items to center.`);
  }
}
if (
  !/\.hero\s*\{[^}]*position\s*:\s*relative[^}]*min-height\s*:\s*clamp\([^}]*overflow\s*:\s*hidden/is.test(
    commercial
  )
) {
  failures.push("Commercial hero must provide a tall, clipped image-led canvas.");
}
if (
  !/\.hero-media\s*\{[^}]*position\s*:\s*absolute[^}]*inset\s*:\s*0/is.test(
    commercial
  )
) {
  failures.push("Commercial hero image must fill the hero rather than share a split column.");
}
if (!/\.hero::after\s*\{[^}]*linear-gradient/is.test(commercial)) {
  failures.push("Commercial hero must retain a readable image-overlay scrim.");
}
if (!/\.hero\s*\{[^}]*border-radius\s*:\s*0\s*!important/is.test(commercial)) {
  failures.push("Commercial hero must remain edge-to-edge without rounded corners.");
}
if (!/\.hero-media img\s*\{[^}]*border-radius\s*:\s*0\s*!important/is.test(commercial)) {
  failures.push("Commercial hero image must not inherit card radii.");
}
if (
  !/padding\s*:\s*clamp\(var\(--space-xl\),\s*6vw,\s*var\(--space-20\)\)\s+clamp\(var\(--space-xl\),\s*6vw,\s*var\(--space-20\)\)\s+clamp\(var\(--space-2xl\),\s*8vw,\s*var\(--space-26\)\)/is.test(
    commercial
  )
) {
  failures.push("Commercial hero must keep intentionally deeper bottom padding on the shared spacing scale.");
}
if (/h1\s*\{[^}]*line-height\s*:\s*0\./is.test(commercial)) {
  failures.push("Commercial marker-font H1 line height is too compressed.");
}
const commercialCaseGridRules = collectCssRules(
  "commercial-interior-design-montreal/index.html",
  commercial,
).filter(
  ({ selector, body }) =>
    /\.cases-grid\b/i.test(selector) && /grid-template-columns\s*:/i.test(body),
);
if (
  !commercialCaseGridRules.some(({ body }) =>
    /grid-template-columns\s*:\s*minmax\(0,\s*1fr\)\s*;/i.test(body),
  ) ||
  commercialCaseGridRules.some(({ body }) =>
    /grid-template-columns\s*:\s*1fr\s*;/i.test(body),
  )
) {
  failures.push("Commercial responsive case-study grid must use minmax(0, 1fr), never bare 1fr.");
}

const inquiry = read("inquiry/index.html");
const contact = read("contact/index.html");
for (const id of ["inquiry-name", "inquiry-email", "inquiry-space-type", "inquiry-goals"]) {
  const visibleLabel = new RegExp(`<label(?![^>]*sr-only)[^>]*for=["']${id}["']`, "i");
  if (!visibleLabel.test(inquiry)) {
    failures.push(`Inquiry field ${id} must have a visible associated label.`);
  }
}
if (!/\.brand-mark\s*\{[^}]*font-family\s*:\s*var\(--font-brand\)/is.test(inquiry)) {
  failures.push("Inquiry background wordmark must use the Permanent Marker brand font.");
}
if (
  !/input,\s*textarea\s*\{[^}]*border-radius\s*:\s*30px[^}]*padding\s*:\s*var\(--space-md\)\s+var\(--space-5\)/is.test(
    inquiry
  )
) {
  failures.push("Inquiry fields must use 30px radii and generous internal helper-text spacing.");
}
if (/Studio \(Montreal\)|class=["']map-container["']/i.test(inquiry)) {
  failures.push("Inquiry must not restore the removed studio/map block.");
}
for (const [name, source] of [
  ["Inquiry", inquiry],
  ["Contact", contact],
]) {
  if (
    !/<div\b[^>]*class=["'][^"']*\bbrand-mark\b[^"']*["'][^>]*\baria-hidden=["']true["'][^>]*>/i.test(
      source
    )
  ) {
    failures.push(`${name} decorative wordmark must be hidden from assistive technology.`);
  }
  if (/\.brand-mark\s*\{[^}]*line-height\s*:\s*0\./is.test(source)) {
    failures.push(`${name} decorative marker typography is vertically over-compressed.`);
  }
}

for (const [name, source, prefix] of [
  ["Inquiry", inquiry, "inquiry"],
  ["Contact", contact, "contact"],
]) {
  const errors = source.match(/\bdata-field-error\b/g) || [];
  if (errors.length !== 4) {
    failures.push(`${name} must render exactly four persistent field-error slots; found ${errors.length}.`);
  }
  if (
    !/outline\s*:\s*2px\s+solid\s+transparent/i.test(source) ||
    !/:focus-visible\s*\{[^}]*outline\s*:\s*2px\s+solid\s+var\(--focus-ring\)/is.test(source)
  ) {
    failures.push(`${name} controls must retain a transparent rest outline and visible focus outline.`);
  }
  if (!/:disabled\s*\{[^}]*opacity\s*:\s*0\.55/is.test(source)) {
    failures.push(`${name} controls must expose a distinct disabled state.`);
  }
  for (const field of source.matchAll(
    new RegExp(`<(?<tag>input|select|textarea)\\b[^>]*\\bid=["'](${prefix}-(?!company)[^"']+)["'][^>]*\\brequired\\b[^>]*>`, "gi")
  )) {
    const id = field[2];
    if (
      !new RegExp(`aria-describedby=["'][^"']*${id}-error[^"']*["']`, "i").test(
        field[0]
      )
    ) {
      failures.push(`${name} required field ${id} must reference its persistent error slot.`);
    }
  }
}

for (const [relativePath, gridPattern, introPattern] of [
  [
    "projects/_projects-index-template.html",
    /grid-template-columns\s*:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/i,
    /\.concept-index__intro\s*\{[^}]*grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/is,
  ],
  [
    "journal/_journal-index-template.html",
    /grid-template-columns\s*:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/i,
    /\.journal-intro-copy\s*\{[^}]*max-width\s*:\s*48ch/is,
  ],
  [
    "journal/_journal-template.html",
    /grid-template-columns\s*:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/i,
    /\.content-grid\s*\{[^}]*minmax\(0,\s*1fr\)/is,
  ],
]) {
  const source = read(relativePath);
  if (!gridPattern.test(source) || !introPattern.test(source)) {
    failures.push(`${relativePath} must use overflow-safe minmax grids and a clear intro responsibility.`);
  }
}

const footer = read("assets/js/components/footer.js");
for (const network of ["instagram", "facebook", "youtube", "behance"]) {
  if (!new RegExp(`\\b${network}:\\s*["']M`, "i").test(footer)) {
    failures.push(`Footer must define the real ${network} brand icon path.`);
  }
}
if (
  !/class=["']social-link social-link--\$\{network\}["'][\s\S]{0,300}aria-label=["']JQ33 DESIGN on \$\{label\}["']/i.test(
    footer
  )
) {
  failures.push("Configured social profiles must render as accessible labelled icon links.");
}
for (const [selector, pattern] of [
  ["heavy-text a", /\.site-footer\s+\.heavy-text\s+a\s*\{[^}]*min-width\s*:\s*44px[^}]*min-height\s*:\s*44px/is],
  ["footer-nav a", /\.site-footer\s+\.footer-nav\s+a\s*\{[^}]*min-width\s*:\s*44px[^}]*min-height\s*:\s*44px/is],
  ["footer-legal a", /\.site-footer\s+\.footer-legal\s+a\s*\{[^}]*min-width\s*:\s*44px[^}]*min-height\s*:\s*44px/is],
]) {
  if (!pattern.test(siteCss)) {
    failures.push(`Shared footer ${selector} targets must be at least 44 by 44 CSS pixels.`);
  }
}
for (const [label, href] of [
  ["Concept studies", "/projects/"],
  ["Commercial interior design", "/commercial-interior-design-montreal/"],
  ["Design journal", "/journal/"],
  ["Project inquiry", "/inquiry/"],
  ["Contact", "/contact/"],
]) {
  if (!new RegExp(`<a\\s+href=["']${href.replaceAll("/", "\\/")}["']>${label}<\\/a>`, "i").test(footer)) {
    failures.push(`Shared footer must keep the descriptive "${label}" link to ${href}.`);
  }
}
const projectsIndexTemplate = read("projects/_projects-index-template.html");
if (/\.concept-index\s+\.site-footer\b/i.test(projectsIndexTemplate)) {
  failures.push("Projects must not retain route-scoped footer appearance rules.");
}
const commercialPage = read("commercial-interior-design-montreal/index.html");
if (/footer-summary|buildFooter/i.test(commercialPage)) {
  failures.push("Commercial interiors must not mutate or summarize the shared footer.");
}

const clickableLongCallLabel = /<(?:a|button)\b[^>]*>[\s\S]{0,120}Book a free(?:<br\s*\/?>|\s)+15-minute call[\s\S]{0,40}<\/(?:a|button)>/i;
for (const filePath of sourceFiles.filter((file) => path.extname(file) === ".html")) {
  const source = fs.readFileSync(filePath, "utf8");
  if (clickableLongCallLabel.test(source)) {
    failures.push(`${path.relative(rootDir, filePath)} still uses the wrapping call CTA label.`);
  }
}

const srgb = (hex) =>
  hex.match(/../g).map((part) => {
    const value = Number.parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
const luminance = (hex) => {
  const [red, green, blue] = srgb(hex.replace("#", ""));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};
const contrast = (foreground, background) => {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

for (const [name, foreground, background, threshold] of [
  ["control text", "#ffffff", "#3b41e3", 4.5],
  ["dark-surface accent", "#8b90ff", "#1a1a1a", 4.5],
  ["focus ring on dark", "#7075eb", "#1a1a1a", 3],
  ["focus ring on light", "#7075eb", "#f0f0f0", 3]
]) {
  const ratio = contrast(foreground, background);
  if (ratio < threshold) {
    failures.push(`${name} contrast is ${ratio.toFixed(2)}:1; expected at least ${threshold}:1.`);
  }
}

if (failures.length) {
  console.error("Hallmark remediation contract check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Hallmark remediation contracts passed.");
}
