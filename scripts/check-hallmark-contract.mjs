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

  if (/family=Inter(?=[:&"'])|font-family\s*[:=]\s*["']?Inter/i.test(source)) {
    failures.push(`${relativePath} still loads or declares the retired Inter typeface.`);
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
      if (
        !/^\s*\/\*\s*Hallmark\s+·\s+macrostructure:\s*Photographic\s+·\s+tone:\s*atmospheric editorial\s+·\s+anchor hue:\s*cobalt\s*\*\//i.test(
          css,
        )
      ) {
        failures.push(
          `${relativePath} inline style block ${index + 1} must begin with the Hallmark macrostructure stamp.`,
        );
      }
    });
  }

  if (!relativePath.startsWith(`admin${path.sep}`)) {
    for (const css of extractCssSources(filePath, source)) {
      for (const selector of findUngatedHoverSelectors(css)) {
        failures.push(
          `${relativePath} exposes hover feedback without hover/pointer capability gating: ${selector}`,
        );
      }
    }
  }
}

const tokensCss = read("tokens.css");
const criticalCss = read("assets/css/critical-shared.css");
const sharedCss = read("assets/css/site.css");
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
const fontFaces = [...tokensCss.matchAll(/@font-face\s*\{([\s\S]*?)\}/gi)].map(
  (match) => match[1],
);
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
  !/\.site-footer\s*\{[^}]*color\s*:\s*var\(--color-white\)/is.test(siteCss)
) {
  failures.push("The dark footer must use a readable light foreground.");
}
if (
  !/\.site-footer\s+\.info-pillar\.pillar-right\s*\{[^}]*background-color\s*:\s*var\(--color-deep-surface\)/is.test(
    siteCss
  )
) {
  failures.push("The footer's right pillar must provide its own dark contrast surface.");
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
const homeBrandSurfaceRules = homeRules.filter(({ selector }) =>
  /(?:^|,)\s*\.panel--home\s+\.brand-mark__text\s*(?:,|$)/i.test(selector),
);
if (
  !homeBrandSurfaceRules.length ||
  !homeBrandSurfaceRules.some(
    ({ body }) =>
      /color\s*:\s*var\(--color-cobalt-deep\)/i.test(body) &&
      /background\s*:\s*var\(--color-white-a88\)/i.test(body) &&
      /border-radius\s*:\s*var\(--radius-card\)/i.test(body),
  )
) {
  failures.push("Homepage hero mark must retain its deterministic contrast-safe backing.");
}
if (
  !/@media\s*\(\s*max-width\s*:\s*480px\s*\)\s*\{[\s\S]{0,500}?\.panel--home\s+\.brand-mark\s*\{[^}]*font-size\s*:\s*clamp\(30px,\s*4vh,\s*32px\)/is.test(
    home,
  )
) {
  failures.push("Homepage mobile hero mark must keep its reduced accent footprint.");
}
if (
  !/@media\s*\(\s*min-width\s*:\s*769px\s*\)\s*and\s*\(\s*max-width\s*:\s*900px\s*\)\s*\{[\s\S]{0,300}?\.panel--home\s+\.brand-mark\s*\{[^}]*font-size\s*:\s*clamp\(58px,\s*8vh,\s*64px\)/is.test(
    home,
  )
) {
  failures.push("Homepage tablet hero mark must not jump above the restrained accent footprint.");
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
if (!/class=["']hero-actions["'][\s\S]*?>Book a call<[^>]*[\s\S]*?>View projects</i.test(home)) {
  failures.push("Homepage hero must expose Book a call and View projects actions.");
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
const homeMobileNavHidden = extractCssSources("index.html", home).some((css) =>
  /@media\s*\(\s*max-width\s*:\s*768px\s*\)\s*\{[\s\S]{0,900}?body\.is-home\s*>\s*\.header-nav\s+\.nav-group(?:\s*,[^{}]+)?\s*\{[^}]*display\s*:\s*none/is.test(
    css,
  ),
);
if (!homeMobileNavHidden) {
  failures.push("Homepage mobile CSS must explicitly hide the high-specificity desktop nav group.");
}
const homeSubheadlineRules = homeRules.filter(({ selector }) =>
  /(?:^|,)\s*\.panel--home\s+\.header-subheadline\s*(?:,|$)/i.test(selector),
);
const homeSubheadlineMeasureRules = homeSubheadlineRules.filter(({ body }) =>
  /max-width\s*:/i.test(body),
);
if (
  !homeSubheadlineMeasureRules.length ||
  homeSubheadlineMeasureRules.some(({ body }) => !/max-width\s*:[^;]*45ch/i.test(body))
) {
  failures.push("Homepage subheadline prose measure must remain at least 45ch at every breakpoint.");
}
if (
  !homeSubheadlineRules.some(
    ({ body }) =>
      /color\s*:\s*var\(--color-ink\)/i.test(body) &&
      /background\s*:\s*var\(--color-white-a88\)/i.test(body) &&
      /text-shadow\s*:\s*none/i.test(body),
  )
) {
  failures.push("Homepage subheadline must retain its readable light contrast surface.");
}
const homeInfoPillarRules = homeRules.filter(({ selector }) =>
  /(?:^|,)\s*\.panel--home\s+\.info-pillar\s*(?:,|$)/i.test(selector),
);
if (
  !homeInfoPillarRules.some(
    ({ body }) =>
      /color\s*:\s*var\(--color-ink\)/i.test(body) &&
      /background\s*:\s*var\(--color-white-a88\)/i.test(body) &&
      /text-shadow\s*:\s*none/i.test(body),
  )
) {
  failures.push("Homepage information pillars must retain readable light contrast surfaces.");
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

for (const label of ["01. Start timing", "02. Quote inputs", "03. Permits + stamps"]) {
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
if (
  !/header\.header-nav\s*\{[^}]*position\s*:\s*absolute[^}]*background\s*:\s*transparent/is.test(
    commercial
  )
) {
  failures.push("Commercial navigation must overlap the hero on a transparent background.");
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
if (
  !/\.site-footer\s+\.pillar-left\s*\{[^}]*border-radius\s*:\s*var\(--radius-container\)/is.test(
    siteCss
  )
) {
  failures.push("Inquiry contact pillar must use the approved 30px radius.");
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
