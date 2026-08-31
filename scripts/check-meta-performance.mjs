import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const baseUrl = "https://jq33.design";
const failures = [];
const warnings = [];

const walk = (dir, files = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || ["node_modules", "supabase", "assets"].includes(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".html") && !entry.name.startsWith("_")) {
      files.push(fullPath);
    }
  }
  return files;
};

const getAttr = (tag, name) => {
  const doubleQuoted = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
  if (doubleQuoted) return doubleQuoted[1];
  const singleQuoted = new RegExp(`${name}\\s*=\\s*'([^']*)'`, "i").exec(tag);
  return singleQuoted ? singleQuoted[1] : "";
};

const metaTags = (html) => [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
const linkTags = (html) => [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);

const findMeta = (html, attrName, value) =>
  metaTags(html).find((tag) => getAttr(tag, attrName).toLowerCase() === value.toLowerCase());

const findLink = (html, rel) =>
  linkTags(html).find((tag) => getAttr(tag, "rel").toLowerCase() === rel.toLowerCase());

const localPathForAbsoluteUrl = (url) => {
  if (!url.startsWith(baseUrl)) return "";
  return url.slice(baseUrl.length).replace(/^\/+/, "");
};

const htmlFiles = walk(rootDir).filter((filePath) => path.relative(rootDir, filePath) !== "home-page.html");

for (const filePath of htmlFiles) {
  const rel = path.relative(rootDir, filePath);
  const html = fs.readFileSync(filePath, "utf8");
  const title = (/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "")
    .replace(/\s+/g, " ")
    .trim();
  const description = getAttr(findMeta(html, "name", "description") || "", "content").trim();
  const robots = getAttr(findMeta(html, "name", "robots") || "", "content").toLowerCase();
  const canonical = getAttr(findLink(html, "canonical") || "", "href").trim();
  const isAdmin = rel.replace(/\\/g, "/").startsWith("admin/");
  const isNoindexShell = robots.includes("noindex");

  if (!title) failures.push(`${rel} is missing a title.`);
  if (!description || description.length < 50) {
    failures.push(`${rel} needs a meta description of at least 50 characters.`);
  }
  if (isAdmin && !robots.includes("noindex")) {
    failures.push(`${rel} is admin content and must be explicitly noindex.`);
  }
  if (!isAdmin && !isNoindexShell && !canonical) {
    failures.push(`${rel} is indexable and missing canonical.`);
  }

  for (const selector of [
    ["property", "og:image"],
    ["name", "twitter:image"]
  ]) {
    const imageUrl = getAttr(findMeta(html, selector[0], selector[1]) || "", "content");
    const local = localPathForAbsoluteUrl(imageUrl);
    if (local && !fs.existsSync(path.join(rootDir, local))) {
      failures.push(`${rel} references missing social image ${imageUrl}.`);
    }
  }
}

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const imageFiles = [];
const walkImages = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkImages(fullPath);
    } else if (entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase())) {
      imageFiles.push(fullPath);
    }
  }
};

for (const dir of ["assets", "og"]) {
  const full = path.join(rootDir, dir);
  if (fs.existsSync(full)) walkImages(full);
}

const maxAssetBytes = 1_250_000;
const totalBudgetBytes = 20_000_000;
const totalBytes = imageFiles.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);

for (const filePath of imageFiles) {
  const size = fs.statSync(filePath).size;
  if (size > maxAssetBytes) {
    failures.push(`${path.relative(rootDir, filePath)} exceeds ${maxAssetBytes} bytes.`);
  } else if (size > 900_000) {
    warnings.push(`${path.relative(rootDir, filePath)} is large at ${size} bytes.`);
  }
}

if (totalBytes > totalBudgetBytes) {
  failures.push(`Total image asset weight ${totalBytes} exceeds ${totalBudgetBytes} bytes.`);
}

for (const warning of warnings) console.warn(`Warning: ${warning}`);

if (failures.length) {
  console.error("Metadata/performance check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Metadata/performance checks passed. ${imageFiles.length} image assets, ${totalBytes} bytes total.`
  );
}
