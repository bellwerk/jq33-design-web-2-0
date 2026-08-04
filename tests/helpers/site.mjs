import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const repositoryRoot = path.resolve(here, "../..");
export const canonicalOrigin = "https://jq33.design";
export const taskId = "jq33-production-readiness-2026-07-29";
export const defaultRawRoot = path.join(repositoryRoot, ".agent", "tasks", taskId, "raw");

export const projectSlugs = [
  "bruton-place-iv",
  "ethereal-gallery",
  "obsidian-lounge",
  "vortex-showroom",
  "canvas-studios",
];

export const publicRoutes = [
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

export const notFoundRoute = "/__jq33-branded-not-found-probe__/";

export const negativeRoutes = [
  "/projects/not-a-project/",
  "/projects/not-a-project/nested/",
  "/not-a-public-route/",
];

export const sourceLeakRoutes = [
  "/.agent/",
  "/AGENTS.md",
  "/CLAUDE.md",
  "/.env",
  "/.env.example",
  "/package.json",
  "/pnpm-lock.yaml",
  "/wrangler.toml",
  "/tasks.md",
  "/DEPLOYMENT.md",
  "/admin/",
  "/data/projects.json",
  "/scripts/build.mjs",
  "/supabase/",
  "/functions/",
  "/projects/_project-template.html",
  "/projects/_projects-index-template.html",
  "/projects/project.html",
  "/journal/_journal-template.html",
  "/journal/_journal-index-template.html",
];

export const redirectRoutes = ["/home-page", "/home-page/", "/home-page.html"];

export const viewports = [
  { width: 320, height: 800 },
  { width: 375, height: 800 },
  { width: 414, height: 800 },
  { width: 768, height: 800 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];

export function argumentValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

export function resolveDistRoot() {
  return path.resolve(
    argumentValue("--root", process.env.DIST_ROOT || path.join(repositoryRoot, "dist")),
  );
}

export function requireDirectory(directory, label = "Directory") {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`${label} does not exist: ${directory}`);
  }
}

export function routeToRelativeHtml(route) {
  if (route === "/") return "index.html";
  return `${route.replace(/^\/|\/$/g, "")}/index.html`;
}

export function htmlDocuments(distRoot, includeNotFound = true) {
  const documents = publicRoutes.map((route) => {
    const relativePath = routeToRelativeHtml(route);
    const fullPath = path.join(distRoot, ...relativePath.split("/"));
    if (!fs.existsSync(fullPath)) throw new Error(`Missing route document: ${relativePath}`);
    return { route, relativePath, fullPath, html: fs.readFileSync(fullPath, "utf8") };
  });
  if (includeNotFound) {
    const relativePath = "404.html";
    const fullPath = path.join(distRoot, relativePath);
    if (!fs.existsSync(fullPath)) throw new Error(`Missing route document: ${relativePath}`);
    documents.push({
      route: "/404.html",
      relativePath,
      fullPath,
      html: fs.readFileSync(fullPath, "utf8"),
      notFound: true,
    });
  }
  return documents;
}

export function walkFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, files);
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

export function getAttribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
    "i",
  ).exec(tag);
  return match ? match[1] ?? match[2] ?? match[3] ?? "" : "";
}

export function hasAttribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s*=|\\s|/?>)`, "i").test(tag);
}

export function tags(html, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...html.matchAll(new RegExp(`<${escaped}\\b[^>]*>`, "gi"))].map(
    (match) => match[0],
  );
}

export function elements(html, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    ...html.matchAll(
      new RegExp(`<${escaped}\\b([^>]*)>([\\s\\S]*?)<\\/${escaped}\\s*>`, "gi"),
    ),
  ].map((match) => ({
    tag: `<${tagName}${match[1]}>`,
    attributes: match[1],
    content: match[2],
    source: match[0],
  }));
}

export function metaContent(html, key, value) {
  const matches = tags(html, "meta").filter(
    (tag) => getAttribute(tag, key).toLowerCase() === value.toLowerCase(),
  );
  return matches.map((tag) => getAttribute(tag, "content"));
}

export function linkHref(html, rel) {
  return tags(html, "link")
    .filter((tag) =>
      getAttribute(tag, "rel")
        .toLowerCase()
        .split(/\s+/)
        .includes(rel.toLowerCase()),
    )
    .map((tag) => getAttribute(tag, "href"));
}

export function stripMarkup(value) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function localPathFromUrl(value, distRoot) {
  let pathname = value.trim().split(/[?#]/, 1)[0];
  if (/^https?:\/\//i.test(pathname)) {
    const parsed = new URL(pathname);
    if (parsed.origin !== canonicalOrigin) return "";
    pathname = parsed.pathname;
  }
  if (!pathname.startsWith("/")) return "";
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return "";
  }
  const fullPath = path.resolve(distRoot, `.${decoded}`);
  if (fullPath !== distRoot && !fullPath.startsWith(`${distRoot}${path.sep}`)) return "";
  return fullPath;
}

export function imageDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: "png" };
  }

  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF") {
    const kind = buffer.toString("ascii", 12, 16);
    if (kind === "VP8X" && buffer.length >= 30) {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
        format: "webp",
      };
    }
    if (kind === "VP8 " && buffer.length >= 30) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
        format: "webp",
      };
    }
    if (kind === "VP8L" && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
        format: "webp",
      };
    }
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
          format: "jpeg",
        };
      }
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) break;
      offset += 2 + length;
    }
  }

  return null;
}

export function reportFailures(label, failures, successMessage) {
  const unique = [...new Set(failures)];
  if (unique.length) {
    console.error(`${label} failed:`);
    for (const failure of unique) console.error(`- ${failure}`);
    process.exitCode = 1;
    return false;
  }
  console.log(successMessage);
  return true;
}

export function safeJsonParse(source, label, failures) {
  try {
    return JSON.parse(source);
  } catch (error) {
    failures.push(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

export function ensureRawDirectory(relative = "") {
  const root = path.resolve(argumentValue("--output", process.env.RAW_ARTIFACT_ROOT || defaultRawRoot));
  const target = path.join(root, relative);
  fs.mkdirSync(target, { recursive: true });
  return target;
}
