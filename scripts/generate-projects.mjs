import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const CANONICAL_ORIGIN = "https://jq33.design";
const DISCLOSURE =
  "Self-initiated concept study; illustrative visual; not completed client work.";
const APPROVED_SLUGS = [
  "bruton-place-iv",
  "ethereal-gallery",
  "obsidian-lounge",
  "vortex-showroom",
  "canvas-studios"
];
const INDEX_META = {
  title: "Self-Initiated Concept Studies | JQ33 DESIGN",
  description:
    "Explore five self-initiated commercial interior concept studies, each using a distinct local illustrative board to examine a spatial question."
};
const INDEX_STUDY_FILENAME = "index-study-20260823.webp";
const INDEX_STUDY_WIDTH = 1120;
const INDEX_STUDY_HEIGHT = 1400;
const INDEX_STUDY_VARIANT_WIDTHS = [480, 768];
const INDEX_STUDY_HERO_SIZES =
  "(max-width: 48rem) min(88vw, 34rem), min(46vw, 45rem)";
const INDEX_STUDY_CARD_SIZES =
  "(max-width: 39.99rem) calc(100vw - 2rem), (max-width: 79.99rem) calc(50vw - 1.5rem), calc(33.333vw - 1.5rem)";

const dataPath = path.join(rootDir, "data", "projects.json");
const projectTemplatePath = path.join(
  rootDir,
  "projects",
  "_project-template.html"
);
const indexTemplatePath = path.join(
  rootDir,
  "projects",
  "_projects-index-template.html"
);

const fail = (message) => {
  throw new Error(`Project generation failed: ${message}`);
};

const parseOutputRoot = () => {
  const args = process.argv.slice(2);
  if (args.length === 0) return rootDir;
  if (args.length !== 2 || args[0] !== "--output-root" || !args[1]) {
    fail("usage is node scripts/generate-projects.mjs [--output-root <directory>]");
  }

  const requested = args[1];
  if (requested.includes("\0")) fail("output root contains an invalid character");
  return path.isAbsolute(requested)
    ? path.normalize(requested)
    : path.resolve(rootDir, requested);
};

const isWithin = (candidate, parent) => {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const validateOutputRoot = (requestedRoot) => {
  const resolved = path.resolve(requestedRoot);
  if (resolved === path.parse(resolved).root) {
    fail("output root cannot be a filesystem root");
  }
  if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) {
    fail("output root must be a directory");
  }

  fs.mkdirSync(resolved, { recursive: true });
  const realRoot = fs.realpathSync(resolved);
  const protectedSources = ["data", "scripts", "assets", "projects", ".agent"].map(
    (segment) => fs.realpathSync(path.join(rootDir, segment))
  );
  if (
    realRoot !== fs.realpathSync(rootDir) &&
    protectedSources.some((sourcePath) => isWithin(realRoot, sourcePath))
  ) {
    fail("output root cannot be inside a protected source directory");
  }
  return realRoot;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toPublicPath = (filePath) => `/${filePath.replaceAll("\\", "/")}`;
const toAbsoluteUrl = (filePath) => `${CANONICAL_ORIGIN}${toPublicPath(filePath)}`;
const toIndexStudyPath = (project) =>
  path.join("assets", "projects", project.slug, INDEX_STUDY_FILENAME);
const toIndexStudyVariantPath = (project, width) =>
  `assets/generated/images/project-${project.slug}-index-study-${width}.webp`;
const toIndexStudySrcset = (project) =>
  [
    ...INDEX_STUDY_VARIANT_WIDTHS.map(
      (width) => `${toPublicPath(toIndexStudyVariantPath(project, width))} ${width}w`
    ),
    `${toPublicPath(toIndexStudyPath(project))} ${INDEX_STUDY_WIDTH}w`
  ].join(", ");
const toIndexStudyAlt = (project) =>
  `AI-generated illustrative ${project.typology.toLowerCase()} visualization for the self-initiated ${project.title} study; not completed client work.`;

const assertExactKeys = (value, expected, context) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${context} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (
    actual.length !== allowed.length ||
    actual.some((key, index) => key !== allowed[index])
  ) {
    fail(`${context} must contain exactly: ${allowed.join(", ")}`);
  }
};

const assertString = (value, context, { min = 1, max = 1000 } = {}) => {
  if (typeof value !== "string") fail(`${context} must be a string`);
  const length = [...value].length;
  if (length < min || length > max) {
    fail(`${context} must be ${min}-${max} characters`);
  }
};

const assertStringList = (value, context) => {
  if (!Array.isArray(value) || value.length < 2 || value.length > 5) {
    fail(`${context} must contain 2-5 items`);
  }
  value.forEach((item, index) =>
    assertString(item, `${context}[${index}]`, { min: 12, max: 180 })
  );
};

const validatePng = (filePath, context) => {
  const bytes = fs.readFileSync(filePath);
  const pngSignature = "89504e470d0a1a0a";
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== pngSignature) {
    fail(`${context} must be a valid PNG`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== 1200 || height !== 630) {
    fail(`${context} must be exactly 1200x630`);
  }
};

const validateSvg = (filePath, context) => {
  const source = fs.readFileSync(filePath, "utf8");
  if (!/<svg\b/i.test(source) || !/viewBox="0 0 1200 630"/i.test(source)) {
    fail(`${context} must be an SVG with a 1200x630 viewBox`);
  }
  const unsafePattern =
    /<script\b|<foreignObject\b|<!DOCTYPE|<!ENTITY|\son[a-z]+\s*=|(?:href|src)\s*=\s*["'](?:https?:|\/\/)|url\(\s*["']?(?:https?:|\/\/)/i;
  if (unsafePattern.test(source)) {
    fail(`${context} contains unsafe or remote SVG content`);
  }
};

const validateLocalAsset = (project, key, expectedExtension) => {
  const relativePath = project.visual[key];
  if (
    typeof relativePath !== "string" ||
    path.isAbsolute(relativePath) ||
    path.extname(relativePath).toLowerCase() !== expectedExtension
  ) {
    fail(
      `${project.slug}.visual.${key} must be a local ${expectedExtension} path`
    );
  }
  const absolutePath = path.resolve(rootDir, relativePath);
  const approvedDir = path.resolve(rootDir, "assets", "projects", project.slug);
  if (!isWithin(absolutePath, approvedDir) || !fs.existsSync(absolutePath)) {
    fail(`${project.slug}.visual.${key} must resolve to an existing local asset`);
  }
  if (key === "source") validateSvg(absolutePath, `${project.slug}.visual.${key}`);
  if (key === "og") validatePng(absolutePath, `${project.slug}.visual.${key}`);
};

const validateIndexStudyAsset = (project) => {
  const relativePath = toIndexStudyPath(project);
  const absolutePath = path.resolve(rootDir, relativePath);
  const approvedDir = path.resolve(rootDir, "assets", "projects", project.slug);
  if (!isWithin(absolutePath, approvedDir) || !fs.existsSync(absolutePath)) {
    fail(`${project.slug} index study must resolve to an existing local asset`);
  }
  const bytes = fs.readFileSync(absolutePath);
  if (
    bytes.length < 12 ||
    bytes.subarray(0, 4).toString("ascii") !== "RIFF" ||
    bytes.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    fail(`${project.slug} index study must be a valid WebP`);
  }
};

const validateProject = (project, expectedSlug, index) => {
  const context = `projects[${index}]`;
  assertExactKeys(
    project,
    [
      "slug",
      "title",
      "typology",
      "disclosure",
      "studyFocus",
      "referenceMarket",
      "programAssumptions",
      "designQuestions",
      "proposedDirection",
      "meta",
      "visual"
    ],
    context
  );
  assertExactKeys(project.meta, ["title", "description"], `${context}.meta`);
  assertExactKeys(
    project.visual,
    ["source", "og", "alt", "caption", "width", "height"],
    `${context}.visual`
  );

  if (project.slug !== expectedSlug) {
    fail(`${context}.slug must be ${expectedSlug}`);
  }
  assertString(project.title, `${context}.title`, { min: 4, max: 60 });
  assertString(project.typology, `${context}.typology`, { min: 4, max: 30 });
  if (project.disclosure !== DISCLOSURE) {
    fail(`${context}.disclosure must use the approved disclosure exactly`);
  }
  assertString(project.studyFocus, `${context}.studyFocus`, {
    min: 60,
    max: 220
  });
  assertString(project.referenceMarket, `${context}.referenceMarket`, {
    min: 20,
    max: 80
  });
  if (!project.referenceMarket.startsWith("Hypothetical ")) {
    fail(`${context}.referenceMarket must be explicitly hypothetical`);
  }
  assertStringList(project.programAssumptions, `${context}.programAssumptions`);
  assertStringList(project.designQuestions, `${context}.designQuestions`);
  assertString(project.proposedDirection, `${context}.proposedDirection`, {
    min: 60,
    max: 240
  });
  assertString(project.meta.title, `${context}.meta.title`, { min: 30, max: 60 });
  assertString(project.meta.description, `${context}.meta.description`, {
    min: 120,
    max: 155
  });
  assertString(project.visual.alt, `${context}.visual.alt`, {
    min: 70,
    max: 180
  });
  assertString(project.visual.caption, `${context}.visual.caption`, {
    min: 80,
    max: 180
  });
  if (
    !/illustrative/i.test(project.visual.alt) ||
    !/self-initiated/i.test(project.visual.alt)
  ) {
    fail(`${context}.visual.alt must identify an illustrative self-initiated study`);
  }
  if (
    !/illustrative/i.test(project.visual.caption) ||
    !/not a photograph of completed client work/i.test(project.visual.caption)
  ) {
    fail(`${context}.visual.caption must make placeholder provenance explicit`);
  }
  if (project.visual.width !== 1200 || project.visual.height !== 630) {
    fail(`${context}.visual dimensions must be exactly 1200x630`);
  }

  validateLocalAsset(project, "source", ".svg");
  validateLocalAsset(project, "og", ".png");
  validateIndexStudyAsset(project);
};

const validateProvenance = (projects, templates) => {
  const serialized = JSON.stringify(projects);
  if (/https?:\/\/|images\.unsplash|unsplash\.com/i.test(serialized)) {
    fail("project data cannot contain remote URLs or Unsplash references");
  }
  const prohibitedClaimKeys =
    /"(?:year|client|location|timeline|area|testimonial|outcome|award|partner|metric)"\s*:/i;
  if (prohibitedClaimKeys.test(serialized)) {
    fail("project data contains a prohibited proof-claim field");
  }

  for (const [name, template] of Object.entries(templates)) {
    if (
      /supabase|https?:\/\/(?:www\.)?calendly\.com|google-analytics|googletagmanager|analytics\.js|images\.unsplash|unsplash\.com/i.test(
        template
      )
    ) {
      fail(`${name} contains a prohibited service or remote-image reference`);
    }
    if (/\son[a-z]+\s*=/i.test(template)) {
      fail(`${name} contains an inline event handler`);
    }
  }
};

const loadProjects = () => {
  const parsed = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  if (!Array.isArray(parsed) || parsed.length !== APPROVED_SLUGS.length) {
    fail(`projects.json must contain exactly ${APPROVED_SLUGS.length} projects`);
  }
  parsed.forEach((project, index) =>
    validateProject(project, APPROVED_SLUGS[index], index)
  );
  const imageSources = new Set(parsed.map((project) => project.visual.source));
  const ogSources = new Set(parsed.map((project) => project.visual.og));
  const imageHashes = new Set(
    parsed.map((project) =>
      createHash("sha256")
        .update(fs.readFileSync(path.join(rootDir, project.visual.source)))
        .digest("hex")
    )
  );
  const ogHashes = new Set(
    parsed.map((project) =>
      createHash("sha256")
        .update(fs.readFileSync(path.join(rootDir, project.visual.og)))
        .digest("hex")
    )
  );
  const metaTitles = new Set(parsed.map((project) => project.meta.title));
  const metaDescriptions = new Set(
    parsed.map((project) => project.meta.description)
  );
  if (
    imageSources.size !== APPROVED_SLUGS.length ||
    ogSources.size !== APPROVED_SLUGS.length ||
    imageHashes.size !== APPROVED_SLUGS.length ||
    ogHashes.size !== APPROVED_SLUGS.length
  ) {
    fail("every project must have uniquely hashed local visual and social assets");
  }
  if (
    metaTitles.size !== APPROVED_SLUGS.length ||
    metaDescriptions.size !== APPROVED_SLUGS.length
  ) {
    fail("every project must have unique metadata");
  }
  return parsed;
};

const fillTemplate = (template, replacements, context) => {
  const rendered = Object.entries(replacements).reduce(
    (result, [key, value]) =>
      result.replaceAll(`{{${key}}}`, String(value ?? "")),
    template
  );
  const unresolved = rendered.match(/{{[a-z0-9_]+}}/gi);
  if (unresolved) {
    fail(`${context} contains unresolved template values: ${unresolved.join(", ")}`);
  }
  return rendered;
};

const jsonLd = (value) =>
  JSON.stringify(value, null, 2).replace(/</g, "\\u003c");

const renderList = (items, className) =>
  `<ul class="${className}">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul>`;

const renderProjectCards = (projects) =>
  projects
    .map((project, index) => {
      const route = `/projects/${project.slug}/`;
      const projectCode = `P-${String(index + 1).padStart(2, "0")}`;
      const indexStudyPath = toIndexStudyPath(project);
      const indexStudyAlt = toIndexStudyAlt(project);
      const loading = index === 0 ? "eager" : "lazy";
      const fetchPriority = index === 0 ? "high" : "low";
      return `
        <article class="project-card">
          <a class="project-item" href="${route}" aria-label="${escapeHtml(
            `${project.title}. AI-generated illustrative concept visualization. ${project.disclosure}`
          )}">
            <img
              class="project-card__image"
              src="${toPublicPath(toIndexStudyVariantPath(project, 768))}"
              srcset="${toIndexStudySrcset(project)}"
              sizes="${INDEX_STUDY_CARD_SIZES}"
              alt="${escapeHtml(indexStudyAlt)}"
              width="${INDEX_STUDY_WIDTH}"
              height="${INDEX_STUDY_HEIGHT}"
              loading="${loading}"
              fetchpriority="${fetchPriority}"
              decoding="async"
            />
            <div class="project-card__content">
              <div class="project-card__heading">
                <h2 class="project-title">${escapeHtml(project.title)}</h2>
                <span class="project-card__code">${projectCode}</span>
              </div>
              <div class="project-card__tags">
                <span class="project-card__tag project-card__type">${escapeHtml(
                  project.typology
                )}</span>
                <span class="project-card__tag">AI visualization</span>
              </div>
              <p class="project-card__focus">${escapeHtml(
                project.studyFocus
              )}</p>
              <hr class="project-card__separator" aria-hidden="true" />
              <div class="project-card__footer">
                <div>
                  <span class="project-card__status">Self-initiated study</span>
                  <p class="project-disclosure">${escapeHtml(
                    project.disclosure
                  )}</p>
                </div>
                <span class="project-card__arrow" aria-hidden="true">↗</span>
              </div>
            </div>
          </a>
        </article>`;
    })
    .join("");

const renderProjectSchema = (project, canonicalUrl) => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CreativeWork",
      "@id": `${canonicalUrl}#concept-study`,
      name: project.title,
      url: canonicalUrl,
      description: project.meta.description,
      image: {
        "@type": "ImageObject",
        url: toAbsoluteUrl(project.visual.og),
        width: project.visual.width,
        height: project.visual.height,
        caption: project.visual.caption
      },
      creator: {
        "@type": "Organization",
        name: "JQ33 DESIGN",
        url: CANONICAL_ORIGIN
      },
      genre: `${project.typology} interior design concept study`,
      abstract: project.studyFocus,
      creativeWorkStatus: "Concept study",
      additionalProperty: [
        {
          "@type": "PropertyValue",
          name: "Provenance",
          value: "Self-initiated concept study"
        },
        {
          "@type": "PropertyValue",
          name: "Disclosure",
          value: DISCLOSURE
        }
      ]
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${CANONICAL_ORIGIN}/`
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Concept studies",
          item: `${CANONICAL_ORIGIN}/projects/`
        },
        {
          "@type": "ListItem",
          position: 3,
          name: project.title,
          item: canonicalUrl
        }
      ]
    }
  ]
});

const renderIndexSchema = (projects) => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": `${CANONICAL_ORIGIN}/projects/#page`,
      name: INDEX_META.title,
      url: `${CANONICAL_ORIGIN}/projects/`,
      description: INDEX_META.description,
      mainEntity: {
        "@type": "ItemList",
        itemListElement: projects.map((project, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: `${project.title} — self-initiated concept study`,
          url: `${CANONICAL_ORIGIN}/projects/${project.slug}/`
        }))
      }
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${CANONICAL_ORIGIN}/projects/#breadcrumb`,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${CANONICAL_ORIGIN}/`
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Concept studies",
          item: `${CANONICAL_ORIGIN}/projects/`
        }
      ]
    }
  ]
});

const renderProjectNavigation = (project, direction) => {
  if (!project) {
    return `<span class="project-nav disabled">${
      direction === "previous" ? "Previous" : "Next"
    }</span>`;
  }
  const arrow = direction === "previous" ? "←" : "→";
  const label =
    direction === "previous"
      ? `${arrow} ${project.title}`
      : `${project.title} ${arrow}`;
  return `<a class="project-nav" href="/projects/${project.slug}/" aria-label="${escapeHtml(
    `${label}. Self-initiated concept study; not completed client work.`
  )}">${escapeHtml(label)}</a>`;
};

const generate = () => {
  assertString(INDEX_META.title, "index metadata title", { min: 30, max: 60 });
  assertString(INDEX_META.description, "index metadata description", {
    min: 120,
    max: 155
  });

  const outputRoot = validateOutputRoot(parseOutputRoot());
  const projectTemplate = fs.readFileSync(projectTemplatePath, "utf8");
  const indexTemplate = fs.readFileSync(indexTemplatePath, "utf8");
  const projects = loadProjects();
  validateProvenance(projects, {
    "_project-template.html": projectTemplate,
    "_projects-index-template.html": indexTemplate
  });

  const projectsOutput = path.join(outputRoot, "projects");
  fs.mkdirSync(projectsOutput, { recursive: true });

  const indexOg = projects[0].visual.og;
  const indexHtml = fillTemplate(
    indexTemplate,
    {
      meta_title: escapeHtml(INDEX_META.title),
      meta_description: escapeHtml(INDEX_META.description),
      og_image: toAbsoluteUrl(indexOg),
      hero_image: toPublicPath(toIndexStudyVariantPath(projects[0], 768)),
      hero_srcset: toIndexStudySrcset(projects[0]),
      hero_sizes: INDEX_STUDY_HERO_SIZES,
      hero_alt: escapeHtml(toIndexStudyAlt(projects[0])),
      project_list: renderProjectCards(projects),
      structured_data: jsonLd(renderIndexSchema(projects))
    },
    "projects index"
  );
  fs.writeFileSync(path.join(projectsOutput, "index.html"), indexHtml, "utf8");

  projects.forEach((project, index) => {
    const canonicalUrl = `${CANONICAL_ORIGIN}/projects/${project.slug}/`;
    const outputDir = path.join(projectsOutput, project.slug);
    fs.mkdirSync(outputDir, { recursive: true });
    const html = fillTemplate(
      projectTemplate,
      {
        meta_title: escapeHtml(project.meta.title),
        meta_description: escapeHtml(project.meta.description),
        canonical_url: canonicalUrl,
        og_image: toAbsoluteUrl(project.visual.og),
        structured_data: jsonLd(renderProjectSchema(project, canonicalUrl)),
        title: escapeHtml(project.title),
        typology: escapeHtml(project.typology),
        disclosure: escapeHtml(project.disclosure),
        hero_image: toPublicPath(project.visual.source),
        hero_alt: escapeHtml(project.visual.alt),
        hero_caption: escapeHtml(project.visual.caption),
        study_focus: escapeHtml(project.studyFocus),
        reference_market: escapeHtml(project.referenceMarket),
        program_assumptions: renderList(
          project.programAssumptions,
          "study-list"
        ),
        design_questions: renderList(project.designQuestions, "study-list"),
        proposed_direction: escapeHtml(project.proposedDirection),
        previous_project: renderProjectNavigation(
          index > 0 ? projects[index - 1] : null,
          "previous"
        ),
        next_project: renderProjectNavigation(
          index < projects.length - 1 ? projects[index + 1] : null,
          "next"
        )
      },
      project.slug
    );
    fs.writeFileSync(path.join(outputDir, "index.html"), html, "utf8");
  });

  console.log(
    `Generated projects index and ${projects.length} concept studies in ${outputRoot}`
  );
};

generate();
