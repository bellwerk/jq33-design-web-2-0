import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repositoryRoot = path.resolve(__dirname, "..");
const rootIndex = process.argv.indexOf("--root");
const artifactRoot = path.resolve(
  rootIndex === -1 ? path.join(repositoryRoot, "dist") : process.argv[rootIndex + 1],
);
const projectSlugs = [
  "bruton-place-iv",
  "ethereal-gallery",
  "obsidian-lounge",
  "vortex-showroom",
  "canvas-studios",
];
const knownRoutes = [
  "/projects/",
  ...projectSlugs.map((slug) => `/projects/${slug}/`),
];
const unknownRoutes = [
  "/projects/not-a-project/",
  "/projects/not-a-project/nested/",
  "/unknown-root-path/",
];

for (const route of knownRoutes) {
  const relativePath =
    route === "/projects/"
      ? "projects/index.html"
      : `${route.replace(/^\/|\/$/g, "")}/index.html`;
  const filePath = path.join(artifactRoot, relativePath);
  assert(fs.existsSync(filePath), `${route} must be represented by a static HTML file.`);
  const html = fs.readFileSync(filePath, "utf8");
  assert(
    html.includes(`https://jq33.design${route}`),
    `${route} must contain its canonical production URL.`,
  );
}

for (const route of unknownRoutes) {
  const relativePath = `${route.replace(/^\/|\/$/g, "")}/index.html`;
  assert(
    !fs.existsSync(path.join(artifactRoot, relativePath)),
    `${route} must not have a generated static document.`,
  );
}
assert(
  !fs.existsSync(path.join(artifactRoot, "projects", "project.html")),
  "The dynamic project shell must not exist in the artifact.",
);
assert(
  !fs.existsSync(path.join(artifactRoot, "functions")),
  "Pages Functions must not exist in the artifact.",
);
const notFound = fs.readFileSync(path.join(artifactRoot, "404.html"), "utf8");
assert(
  /<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(notFound),
  "The branded 404 document must be noindex.",
);

const baseUrl = String(process.env.PROJECT_ROUTE_BASE_URL || "").replace(/\/+$/, "");

const requestDirect = async (route, expectedStatus) => {
  const response = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
  assert.equal(
    response.status,
    expectedStatus,
    `${route} must return direct HTTP ${expectedStatus}; received ${response.status}.`,
  );
  assert(
    !response.headers.get("location"),
    `${route} must not redirect (Location: ${response.headers.get("location")}).`,
  );
  return response;
};

if (baseUrl) {
  for (const route of knownRoutes) {
    const response = await requestDirect(route, 200);
    const html = await response.text();
    assert(
      html.includes(`https://jq33.design${route}`),
      `${route} did not return its intended static page.`,
    );
  }
  for (const route of unknownRoutes) {
    const response = await requestDirect(route, 404);
    const html = await response.text();
    assert(/noindex/i.test(html), `${route} must return the branded noindex 404 document.`);
    assert(
      !/project-shell|portfolio-detail|supabase/i.test(html),
      `${route} returned a dynamic project shell.`,
    );
  }
  console.log(`Static project route checks passed against ${baseUrl}.`);
} else {
  console.log(
    `Static project artifact checks passed for ${knownRoutes.length} known routes and ${unknownRoutes.length} negative routes. Set PROJECT_ROUTE_BASE_URL for HTTP status verification.`,
  );
}
