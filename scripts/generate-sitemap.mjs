import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const baseUrl = (process.env.PUBLIC_SITE_URL || "https://jq33.design").replace(/\/+$/, "");
const sitemapPath = path.join(rootDir, "sitemap.xml");
const projectsPath = path.join(rootDir, "data", "projects.json");
const postsPath = path.join(rootDir, "data", "posts.json");

const staticRoutes = [
  "/",
  "/commercial-interior-design-montreal/",
  "/projects/",
  "/journal/",
  "/contact/",
  "/inquiry/",
  "/privacy/",
  "/terms/"
];

const loadJson = (filePath) => {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
};

const toUrl = (route) => `${baseUrl}${route}`;

const buildUrls = () => {
  const urls = new Set(staticRoutes.map(toUrl));

  const projects = loadJson(projectsPath);
  projects.forEach((project) => {
    if (!project?.slug) return;
    urls.add(toUrl(`/projects/${project.slug}/`));
  });

  const posts = loadJson(postsPath);
  posts
    .filter((post) => post?.status === "published")
    .forEach((post) => {
      if (!post?.slug) return;
      urls.add(toUrl(`/journal/${post.slug}/`));
    });

  return Array.from(urls);
};

const generate = () => {
  const urls = buildUrls();
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((loc) => `  <url>\n    <loc>${loc}</loc>\n  </url>`),
    "</urlset>",
    ""
  ].join("\n");

  fs.writeFileSync(sitemapPath, xml, "utf8");
};

generate();
console.log("Sitemap generated.");
