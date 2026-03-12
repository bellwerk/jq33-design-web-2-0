import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const shouldSkipHref = (href) => {
  const value = href.trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  return (
    lower.startsWith("#") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:") ||
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("//") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    value.includes("${") ||
    value.includes("{{")
  );
};

const stripQueryHash = (value) => value.split("#")[0].split("?")[0];

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const loadRedirects = () => {
  const redirectsPath = path.join(rootDir, "_redirects");
  if (!fs.existsSync(redirectsPath)) return [];
  const lines = fs.readFileSync(redirectsPath, "utf8").split(/\r?\n/);
  return lines
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean)
    .map((from) => {
      const pattern = `^${escapeRegex(from).replace(/\\\*/g, ".*")}$`;
      return new RegExp(pattern);
    });
};

const redirectPatterns = loadRedirects();
const matchesRedirect = (hrefPath) =>
  redirectPatterns.some((pattern) => pattern.test(hrefPath));

const resolveInternalTarget = (href, filePath) => {
  const cleaned = stripQueryHash(href);
  if (!cleaned) return null;

  if (cleaned.startsWith("/")) {
    const relative = cleaned.replace(/^\/+/, "");
    if (!relative) return path.join(rootDir, "index.html");
    return path.join(rootDir, relative);
  }

  const dir = path.dirname(filePath);
  return path.resolve(dir, cleaned);
};

const normalizeTarget = (targetPath) => {
  const ext = path.extname(targetPath);
  if (ext) return targetPath;
  if (targetPath.endsWith(path.sep)) {
    return path.join(targetPath, "index.html");
  }
  return path.join(targetPath, "index.html");
};

const walk = (dir, files = []) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["assets", "supabase"].includes(entry.name)) continue;
      walk(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".html") && !entry.name.startsWith("_")) {
      files.push(fullPath);
    }
  }
  return files;
};

const anchorHrefRegex = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;

const htmlFiles = walk(rootDir);
const broken = [];

for (const filePath of htmlFiles) {
  const content = fs.readFileSync(filePath, "utf8");
  let match;
  while ((match = anchorHrefRegex.exec(content)) !== null) {
    const href = match[1].trim();
    if (shouldSkipHref(href)) continue;
    if (!href) {
      broken.push({ filePath, href: "(empty)" });
      continue;
    }

    const cleanHref = stripQueryHash(href);
    if (!cleanHref || cleanHref === "/") {
      const target = path.join(rootDir, "index.html");
      if (!fs.existsSync(target)) {
        broken.push({ filePath, href });
      }
      continue;
    }

    if (matchesRedirect(cleanHref)) {
      continue;
    }

    const resolved = resolveInternalTarget(cleanHref, filePath);
    if (!resolved) continue;
    const normalized = normalizeTarget(resolved);
    if (!fs.existsSync(normalized)) {
      broken.push({ filePath, href });
    }
  }
}

if (broken.length) {
  console.error("Broken internal links detected:");
  for (const item of broken) {
    const rel = path.relative(rootDir, item.filePath);
    console.error(`- ${rel}: ${item.href}`);
  }
  process.exitCode = 1;
} else {
  console.log("All internal anchor links look valid.");
}
