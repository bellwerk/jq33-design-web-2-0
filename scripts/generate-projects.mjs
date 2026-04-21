import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const dataPath = path.join(rootDir, "data", "projects.json");
const projectTemplatePath = path.join(rootDir, "projects", "_project-template.html");
const indexTemplatePath = path.join(
  rootDir,
  "projects",
  "_projects-index-template.html"
);

const baseUrl = (process.env.PUBLIC_SITE_URL || "https://jq33.design").replace(/\/+$/, "");

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const joinLinesWithBreaks = (lines) =>
  (lines ?? []).map((line) => escapeHtml(line)).join("<br />");

const toPublicPath = (filePath) => {
  if (!filePath) return "";
  return filePath.startsWith("/") ? filePath : `/${filePath}`;
};

const toAbsoluteUrl = (value) => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${baseUrl}${value}`;
  return `${baseUrl}/${value}`;
};

const pickImage = (image) => {
  if (!image) return "";
  if (image.local) {
    const localPath = image.local.replace(/^\/+/, "");
    const absolute = path.join(rootDir, localPath);
    if (fs.existsSync(absolute)) {
      return toPublicPath(image.local);
    }
  }
  return image.remote ?? "";
};

const loadJson = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("projects.json must be an array");
  }
  return parsed;
};

const fillTemplate = (template, replacements) =>
  Object.entries(replacements).reduce(
    (result, [key, value]) =>
      result.replaceAll(`{{${key}}}`, value ?? ""),
    template
  );

const renderDetailsGrid = (details) =>
  (details ?? [])
    .map(
      (detail) => `
        <div class="info-col">
          <div class="label">${escapeHtml(detail.label)}</div>
          ${(detail.lines ?? []).map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
        </div>`
    )
    .join("");

const renderNarrativeBlocks = (narrative) =>
  (narrative ?? [])
    .map(
      (block) => `
        <div class="info-col">
          <div class="label">${escapeHtml(block.label)}</div>
          <div class="narrative-text">${escapeHtml(block.text)}</div>
        </div>`
    )
    .join("");

const renderGalleryItems = (items) =>
  (items ?? [])
    .map((item, index) => {
      const imageSrc = pickImage(item);
      const caption = item.caption ? escapeHtml(item.caption) : "";
      const alt = escapeHtml(item.alt ?? `Project gallery ${index + 1}`);
      return `
        <div class="gallery-item">
          <img
            src="${imageSrc}"
            class="gallery-image"
            alt="${alt}"
            width="2400"
            height="1600"
            loading="lazy"
            decoding="async"
          />
          ${caption ? `<div class="gallery-caption">${caption}</div>` : ""}
        </div>`;
    })
    .join("");

const renderSpecRows = (specs) =>
  (specs ?? [])
    .map(
      (spec) => `
        <div class="spec-row">
          <div class="spec-label">${escapeHtml(spec.label)}</div>
          <div class="spec-value">${escapeHtml(spec.value)}</div>
        </div>`
    )
    .join("");

const renderProjectList = (projects) =>
  projects
    .map((project) => {
      const previewImage = pickImage(project.images?.preview) || pickImage(project.images?.hero);
      const titleLines = joinLinesWithBreaks(project.title_lines);
      return `
        <a
          class="project-item"
          href="/projects/${project.slug}/"
          data-img="${previewImage}"
          data-title="${escapeHtml(project.title)}"
          onmouseenter="hoverProject(this)"
          onmouseleave="leaveProject()"
        >
          <div class="project-meta">
            <span class="project-year">${escapeHtml(project.year)}</span>
            <h2 class="project-title">${titleLines}</h2>
          </div>
          <div class="project-category">${escapeHtml(project.category)}</div>
        </a>`;
    })
    .join("");

const renderNavLink = (project, direction) => {
  if (!project) {
    const label = direction === "prev" ? "Previous" : "Next";
    return `<span class="project-nav disabled">${label}</span>`;
  }
  const arrow = direction === "prev" ? "←" : "→";
  const label = direction === "prev" ? `${arrow} ${project.title}` : `${project.title} ${arrow}`;
  return `<a class="project-nav" href="/projects/${project.slug}/">${escapeHtml(
    label
  )}</a>`;
};

const generate = () => {
  const projects = loadJson(dataPath);
  const projectTemplate = fs.readFileSync(projectTemplatePath, "utf8");
  const indexTemplate = fs.readFileSync(indexTemplatePath, "utf8");

  const listHtml = renderProjectList(projects);
  const indexHtml = fillTemplate(indexTemplate, {
    project_list: listHtml
  });

  fs.writeFileSync(path.join(rootDir, "projects", "index.html"), indexHtml, "utf8");

  projects.forEach((project, index) => {
    const heroImage = pickImage(project.images?.hero);
    const heroTitle = joinLinesWithBreaks(project.hero_title_lines);
    const metaTitle = escapeHtml(project.meta?.title || project.title);
    const metaDescription = escapeHtml(project.meta?.description || "");
    const canonicalUrl = `${baseUrl}/projects/${project.slug}/`;
    const ogImage = pickImage(project.images?.hero) || pickImage(project.images?.preview);
    const ogImageUrl = toAbsoluteUrl(ogImage);
    const prevProject = index > 0 ? projects[index - 1] : null;
    const nextProject = index < projects.length - 1 ? projects[index + 1] : null;

    const html = fillTemplate(projectTemplate, {
      meta_title: metaTitle,
      meta_description: metaDescription,
      canonical_url: canonicalUrl,
      og_title: metaTitle,
      og_description: metaDescription,
      og_image: ogImageUrl,
      hero_image: heroImage,
      hero_alt: escapeHtml(project.title),
      hero_title: heroTitle,
      details_grid: renderDetailsGrid(project.details),
      narrative_blocks: renderNarrativeBlocks(project.narrative),
      gallery_items: renderGalleryItems(project.images?.gallery),
      spec_rows: renderSpecRows(project.specifications),
      prev_nav: renderNavLink(prevProject, "prev"),
      next_nav: renderNavLink(nextProject, "next")
    });

    const projectDir = path.join(rootDir, "projects", project.slug);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "index.html"), html, "utf8");
  });
};

generate();
console.log("Projects generated.");
