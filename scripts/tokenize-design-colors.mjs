import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const tokenPath = path.join(rootDir, "tokens.css");
const sourceFiles = [
  "assets/css/site.css",
  "assets/css/critical-shared.css",
  "index.html",
  "commercial-interior-design-montreal/index.html",
  "contact/index.html",
  "inquiry/index.html",
  "privacy/index.html",
  "terms/index.html",
  "404.html",
  "journal/_journal-index-template.html",
  "journal/_journal-template.html",
  "journal/index.html",
  "journal/reduction-as-creation/index.html",
  "projects/_project-template.html",
  "projects/_projects-index-template.html",
  "projects/index.html",
  "projects/bruton-place-iv/index.html",
  "projects/canvas-studios/index.html",
  "projects/ethereal-gallery/index.html",
  "projects/obsidian-lounge/index.html",
  "projects/vortex-showroom/index.html",
];

const colorPattern =
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\(\s*[0-9.]+(?:\s*,\s*|\s+)[0-9.]+(?:\s*,\s*|\s+)[0-9.]+(?:\s*(?:,|\/)\s*[0-9.%]+)?\s*\)/g;

const baseNames = new Map([
  ["0,0,0", "black"],
  ["255,255,255", "white"],
  ["12,12,12", "ink"],
  ["17,17,17", "deep-charcoal"],
  ["26,26,26", "charcoal"],
  ["34,34,34", "zinc"],
  ["20,20,20", "deep-surface"],
  ["6,6,8", "midnight"],
  ["10,10,10", "near-black"],
  ["15,15,15", "soft-black"],
  ["59,65,227", "cobalt"],
  ["94,99,232", "cobalt-hover"],
  ["112,117,235", "cobalt-bright"],
  ["139,144,255", "cobalt-soft"],
  ["123,75,255", "violet"],
  ["240,240,240", "paper"],
  ["246,245,240", "warm-paper"],
  ["31,79,47", "success-ink"],
  ["139,29,29", "error-ink"],
  ["64,64,64", "neutral-strong"],
  ["153,153,153", "neutral-muted"],
  ["204,204,204", "neutral-light"],
  ["191,227,255", "info-light"],
  ["255,210,210", "error-light"],
  ["30,34,129", "cobalt-deep"],
  ["23,105,255", "social-blue"],
  ["24,119,242", "facebook-blue"],
  ["131,58,180", "instagram-purple"],
  ["252,176,69", "instagram-gold"],
  ["253,29,29", "instagram-red"],
  ["255,0,51", "youtube-red"],
  ["255,122,0", "social-orange"],
  ["255,214,0", "social-yellow"],
]);

const parseColor = (value) => {
  if (value.startsWith("#")) {
    let hex = value.slice(1);
    if (hex.length === 3) hex = [...hex].map((character) => character.repeat(2)).join("");
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);
    const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { red, green, blue, alpha };
  }

  const match =
    /rgba?\(\s*([0-9.]+)(?:\s*,\s*|\s+)([0-9.]+)(?:\s*,\s*|\s+)([0-9.]+)(?:\s*(?:,|\/)\s*([0-9.%]+))?\s*\)/i.exec(
      value,
    );
  if (!match) throw new Error(`Unsupported color literal: ${value}`);
  const alpha = match[4]
    ? match[4].endsWith("%")
      ? Number.parseFloat(match[4]) / 100
      : Number.parseFloat(match[4])
    : 1;
  return {
    red: Number.parseFloat(match[1]),
    green: Number.parseFloat(match[2]),
    blue: Number.parseFloat(match[3]),
    alpha,
  };
};

const tokenFor = ({ red, green, blue, alpha }) => {
  const base =
    baseNames.get(`${red},${green},${blue}`) || `rgb-${red}-${green}-${blue}`;
  const alphaPercent = Math.round(alpha * 100);
  return `--color-${base}${
    alphaPercent === 100 ? "" : `-a${String(alphaPercent).padStart(2, "0")}`
  }`;
};

const declarationFor = (token, { red, green, blue, alpha }) => {
  const alphaPercent = Math.round(alpha * 100);
  return `  ${token}: rgb(${red} ${green} ${blue}${
    alphaPercent === 100 ? "" : ` / ${alphaPercent}%`
  });`;
};

const replaceColors = (source, discovered) =>
  source.replace(colorPattern, (literal) => {
    const color = parseColor(literal);
    const token = tokenFor(color);
    discovered.set(token, color);
    return `var(${token})`;
  });

const replaceHtmlColors = (source, discovered) =>
  source
    .replace(
      /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
      (_match, attributes, content) =>
        `<style${attributes}>${replaceColors(content, discovered)}</style>`,
    )
    .replace(
      /\sstyle\s*=\s*(["'])(.*?)\1/gi,
      (_match, quote, declarations) =>
        ` style=${quote}${replaceColors(declarations, discovered)}${quote}`,
    );

const discovered = new Map();
for (const relativePath of sourceFiles) {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`Missing style source: ${relativePath}`);
  const source = fs.readFileSync(filePath, "utf8");
  const output = relativePath.endsWith(".html")
    ? replaceHtmlColors(source, discovered)
    : replaceColors(source, discovered);
  if (output !== source) fs.writeFileSync(filePath, output, "utf8");
}

let tokenSource = fs.readFileSync(tokenPath, "utf8");
const existingTokens = new Set(
  [...tokenSource.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((match) => match[1]),
);
const newDeclarations = [...discovered]
  .filter(([token]) => !existingTokens.has(token))
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([token, color]) => declarationFor(token, color));

if (newDeclarations.length) {
  const rootEnd = tokenSource.lastIndexOf("\n}");
  if (rootEnd === -1) throw new Error("Unable to locate the tokens.css :root closing brace.");
  const block = [
    "",
    "  /* Hallmark locked color scale; generated by scripts/tokenize-design-colors.mjs. */",
    ...newDeclarations,
    "",
  ].join("\n");
  tokenSource = `${tokenSource.slice(0, rootEnd)}${block}${tokenSource.slice(rootEnd)}`;
  fs.writeFileSync(tokenPath, tokenSource, "utf8");
}

console.log(
  `Tokenized design colors across ${sourceFiles.length} style sources; added ${newDeclarations.length} tokens.`,
);
