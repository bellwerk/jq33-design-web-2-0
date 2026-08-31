import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
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
const failures = [];

for (const relativePath of sourceFiles) {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) {
    failures.push(`${relativePath} is missing.`);
    continue;
  }
  const source = fs.readFileSync(filePath, "utf8");
  const cssSources = relativePath.endsWith(".html")
    ? [
        ...[...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(
          (match) => match[1],
        ),
        ...[...source.matchAll(/\sstyle\s*=\s*(["'])(.*?)\1/gi)].map(
          (match) => match[2],
        ),
      ]
    : [source];
  for (const css of cssSources) {
    for (const match of css.matchAll(colorPattern)) {
      failures.push(`${relativePath} contains raw color ${match[0]}.`);
    }
    for (const match of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
      if (!match[1].includes("var(")) {
        failures.push(`${relativePath} contains raw font-family ${match[1].trim()}.`);
      }
    }
  }
}

if (failures.length) {
  console.error("Design token validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Design token validation passed: colors and fonts are locked to named tokens.");
