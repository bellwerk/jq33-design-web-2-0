import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const canonicalOrigin = "https://jq33.design";
const projectSlugs = [
  "bruton-place-iv",
  "ethereal-gallery",
  "obsidian-lounge",
  "vortex-showroom",
  "canvas-studios",
];
const staticRoutes = [
  "/",
  "/commercial-interior-design-montreal/",
  "/projects/",
  "/journal/",
  "/contact/",
  "/inquiry/",
  "/privacy/",
  "/terms/",
];

const outputRootIndex = process.argv.indexOf("--output-root");
if (outputRootIndex === -1 || !process.argv[outputRootIndex + 1]) {
  throw new Error("generate-sitemap.mjs requires --output-root <directory>.");
}
const outputRoot = path.resolve(process.argv[outputRootIndex + 1]);

const loadArray = (relativePath) => {
  const parsed = JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${relativePath} must contain an array.`);
  return parsed;
};

const sourceDate = (...relativePaths) => {
  const dirty = spawnSync("git", ["status", "--porcelain", "--", ...relativePaths], {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (dirty.status === 0 && !dirty.stdout.trim()) {
    const committed = spawnSync(
      "git",
      ["show", "-s", "--format=%cs", "HEAD"],
      { cwd: rootDir, encoding: "utf8" },
    );
    const committedDate = committed.stdout.trim();
    if (committed.status === 0 && /^\d{4}-\d{2}-\d{2}$/.test(committedDate)) {
      return committedDate;
    }
  }
  const timestamp = Math.max(
    ...relativePaths.map((relativePath) =>
      fs.statSync(path.join(rootDir, relativePath)).mtime.getTime(),
    ),
  );
  return new Date(timestamp).toISOString().slice(0, 10);
};

const projects = loadArray("data/projects.json");
const actualProjectSlugs = projects.map((project) => project?.slug).filter(Boolean);
if (
  actualProjectSlugs.length !== projectSlugs.length ||
  !projectSlugs.every((slug) => actualProjectSlugs.includes(slug))
) {
  throw new Error("data/projects.json must contain exactly the five launch project slugs.");
}

const posts = loadArray("data/posts.json");
const publishedPosts = posts.filter((post) => post?.status === "published");
const entries = [
  ...staticRoutes.map((route) => {
    const source =
      route === "/"
        ? "index.html"
        : route === "/projects/"
          ? "projects/_projects-index-template.html"
          : route === "/journal/"
            ? "journal/_journal-index-template.html"
            : `${route.replace(/^\/|\/$/g, "")}/index.html`;
    return { route, lastmod: sourceDate(source) };
  }),
  ...projectSlugs.map((slug) => ({
    route: `/projects/${slug}/`,
    lastmod: sourceDate("data/projects.json", "projects/_project-template.html"),
  })),
  ...publishedPosts.map((post) => ({
    route: `/journal/${post.slug}/`,
    lastmod:
      /^\d{4}-\d{2}-\d{2}$/.test(post.modified || "")
        ? post.modified
        : /^\d{4}-\d{2}-\d{2}$/.test(post.published || "")
          ? post.published
          : sourceDate("data/posts.json", "journal/_journal-template.html"),
  })),
];

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries.map(
    ({ route, lastmod }) =>
      `  <url>\n    <loc>${canonicalOrigin}${route}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`,
  ),
  "</urlset>",
  "",
].join("\n");

fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(path.join(outputRoot, "sitemap.xml"), xml, "utf8");
console.log(`Sitemap generated in ${outputRoot}.`);
