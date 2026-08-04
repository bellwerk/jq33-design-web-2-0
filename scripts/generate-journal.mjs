import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const canonicalOrigin = "https://jq33.design";

const outputRootIndex = process.argv.indexOf("--output-root");
if (outputRootIndex === -1 || !process.argv[outputRootIndex + 1]) {
  throw new Error("generate-journal.mjs requires --output-root <directory>.");
}
const outputRoot = path.resolve(process.argv[outputRootIndex + 1]);
const dataPath = path.join(rootDir, "data", "posts.json");
const postTemplatePath = path.join(rootDir, "journal", "_journal-template.html");
const indexTemplatePath = path.join(rootDir, "journal", "_journal-index-template.html");
const defaultOgImage = `${canonicalOrigin}/og/jq33-design-commercial-interior-montreal.png`;
const journalCardWidths = [640, 960, 1280];
const journalCardSizes =
  "(max-width: 900px) calc(100vw - 32px), (max-width: 1024px) calc(100vw - 48px), 580px";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const joinLinesWithBreaks = (lines) =>
  (lines ?? []).map((line) => escapeHtml(line)).join("<br />");

const requireLocalImage = (image, context) => {
  const local = String(image?.local || "").replace(/^\/+/, "");
  if (!local || local.includes("..") || path.isAbsolute(local)) {
    throw new Error(`${context} requires a safe local image path.`);
  }
  const absolute = path.join(rootDir, local);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(`${context} references a missing local image: ${local}`);
  }
  return `/${local.split(path.sep).join("/")}`;
};

const loadPosts = () => {
  const parsed = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("posts.json must be an array.");
  for (const post of parsed) {
    const media = JSON.stringify({
      card: post?.card?.image,
      images: post?.images,
    });
    if (/https?:\/\/|unsplash/i.test(media)) {
      throw new Error(`Journal post ${post?.slug || "(missing slug)"} contains remote media.`);
    }
    if (post?.status === "published") {
      const title = String(post?.meta?.title || post?.title || "").trim();
      const description = String(post?.meta?.description || "").trim();
      if (title.length < 30 || title.length > 60) {
        throw new Error(
          `Journal post ${post.slug} metadata title must be 30-60 characters; found ${title.length}.`,
        );
      }
      if (description.length < 120 || description.length > 155) {
        throw new Error(
          `Journal post ${post.slug} metadata description must be 120-155 characters; found ${description.length}.`,
        );
      }
    }
  }
  return parsed;
};

const fillTemplate = (template, replacements) =>
  Object.entries(replacements).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value ?? ""),
    template,
  );

const renderParagraphs = (paragraphs) =>
  (paragraphs ?? []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");

const renderKeyConcepts = (items) =>
  (items ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");

const renderClosingBlocks = (paragraphs) =>
  (paragraphs ?? [])
    .map(
      (paragraph) => `
        <div class="body-text">
          <p>${escapeHtml(paragraph)}</p>
        </div>`,
    )
    .join("");

const journalCardVariant = (slug, width) =>
  `/assets/generated/images/journal-${slug}-${width}.webp`;

const journalCardSrcset = (slug) =>
  journalCardWidths.map((width) => `${journalCardVariant(slug, width)} ${width}w`).join(", ");

const renderCardPreload = (post) =>
  post
    ? `<link
      rel="preload"
      as="image"
      href="${journalCardVariant(post.slug, journalCardWidths.at(-1))}"
      imagesrcset="${journalCardSrcset(post.slug)}"
      imagesizes="${journalCardSizes}"
      fetchpriority="high"
    />`
    : "";

const renderCards = (posts) =>
  posts
    .map((post, index) => {
      requireLocalImage(post.card?.image, `Journal card ${post.slug}`);
      const imageSrc = journalCardVariant(post.slug, journalCardWidths.at(-1));
      const titleLines = joinLinesWithBreaks(post.title_lines);
      const tag = post.status === "published" ? "a" : "div";
      const href = post.status === "published" ? `href="/journal/${post.slug}/"` : "";
      const loading = index === 0 ? "eager" : "lazy";
      const fetchPriority = index === 0 ? "high" : "low";
      return `
        <${tag}
          ${href}
          class="project-card"
        >
          <img
            src="${imageSrc}"
            srcset="${journalCardSrcset(post.slug)}"
            sizes="${journalCardSizes}"
            class="project-image"
            alt="${escapeHtml(post.card?.alt ?? post.title ?? "Journal post")}"
            width="2400"
            height="1600"
            loading="${loading}"
            fetchpriority="${fetchPriority}"
            decoding="async"
          />
          <div class="project-number">${escapeHtml(post.card?.number ?? "")}</div>
          <div class="project-overlay">
            <div class="project-meta">${escapeHtml(post.card?.meta ?? "")}</div>
            <h2 class="project-title">${titleLines}</h2>
          </div>
        </${tag}>`;
    })
    .join("");

const upperLines = (lines) => (lines ?? []).map((line) => String(line).toUpperCase());

const generate = () => {
  const posts = loadPosts();
  const postTemplate = fs.readFileSync(postTemplatePath, "utf8");
  const indexTemplate = fs.readFileSync(indexTemplatePath, "utf8");
  const journalRoot = path.join(outputRoot, "journal");
  fs.mkdirSync(journalRoot, { recursive: true });

  const indexHtml = fillTemplate(indexTemplate, {
    card_preload: renderCardPreload(posts[0]),
    post_cards: renderCards(posts),
  });
  fs.writeFileSync(path.join(journalRoot, "index.html"), indexHtml, "utf8");

  const findNextPublished = (startIndex) => {
    for (let index = startIndex + 1; index < posts.length; index += 1) {
      if (posts[index]?.status === "published") return posts[index];
    }
    return null;
  };

  posts
    .filter((post) => post.status === "published")
    .forEach((post) => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug || "")) {
        throw new Error(`Invalid journal slug: ${post.slug}`);
      }
      const postIndex = posts.findIndex((entry) => entry.slug === post.slug);
      const nextPost = postIndex >= 0 ? findNextPublished(postIndex) : null;
      const nextHref = nextPost ? `/journal/${nextPost.slug}/` : "/journal/";
      const nextLabel = joinLinesWithBreaks(
        upperLines(nextPost?.title_lines ?? ["Back to Journal"]),
      );
      const metaTitle = escapeHtml(post.meta?.title || post.title);
      const metaDescription = escapeHtml(post.meta?.description || "");
      const canonicalUrl = `${canonicalOrigin}/journal/${post.slug}/`;
      const ogImage = post.og_image || defaultOgImage;
      const schemaImage = post.schema_image || ogImage;

      const html = fillTemplate(postTemplate, {
        meta_title: metaTitle,
        meta_description: metaDescription,
        canonical_url: canonicalUrl,
        og_title: metaTitle,
        og_description: metaDescription,
        og_url: canonicalUrl,
        og_image: ogImage,
        og_image_alt: escapeHtml(
          post.images?.feature_one?.alt || post.card?.alt || `${post.title} journal illustration`,
        ),
        twitter_title: metaTitle,
        twitter_description: metaDescription,
        twitter_image: ogImage,
        schema_headline: escapeHtml(post.title || post.meta?.title || ""),
        schema_description: metaDescription,
        schema_image: schemaImage,
        schema_date_published: post.published || "",
        schema_date_modified: escapeHtml(post.modified || post.published || ""),
        schema_page_url: canonicalUrl,
        published_display: escapeHtml(post.published_display || ""),
        category: escapeHtml(post.category || ""),
        author: escapeHtml(post.author || ""),
        hero_title: joinLinesWithBreaks(post.hero_title_lines || post.title_lines),
        lead: escapeHtml(post.lead || ""),
        intro_paragraphs: renderParagraphs(post.intro_paragraphs),
        image_one_src: requireLocalImage(
          post.images?.feature_one,
          `Journal post ${post.slug} feature one`,
        ),
        image_one_alt: escapeHtml(post.images?.feature_one?.alt || post.title || ""),
        image_one_label: escapeHtml(post.images?.feature_one?.label || ""),
        image_one_width: post.images?.feature_one?.width || 2070,
        image_one_height: post.images?.feature_one?.height || 1380,
        key_concepts: renderKeyConcepts(post.key_concepts),
        image_two_src: requireLocalImage(
          post.images?.feature_two,
          `Journal post ${post.slug} feature two`,
        ),
        image_two_alt: escapeHtml(post.images?.feature_two?.alt || post.title || ""),
        image_two_label: escapeHtml(post.images?.feature_two?.label || ""),
        image_two_width: post.images?.feature_two?.width || 1964,
        image_two_height: post.images?.feature_two?.height || 1309,
        pull_quote: escapeHtml(post.pull_quote || ""),
        image_three_src: requireLocalImage(
          post.images?.feature_three,
          `Journal post ${post.slug} feature three`,
        ),
        image_three_alt: escapeHtml(post.images?.feature_three?.alt || post.title || ""),
        image_three_label: escapeHtml(post.images?.feature_three?.label || ""),
        image_three_width: post.images?.feature_three?.width || 2070,
        image_three_height: post.images?.feature_three?.height || 1380,
        closing_blocks: renderClosingBlocks(post.closing_paragraphs),
        next_href: nextHref,
        next_label: nextLabel,
      });

      const postDir = path.join(journalRoot, post.slug);
      fs.mkdirSync(postDir, { recursive: true });
      fs.writeFileSync(path.join(postDir, "index.html"), html, "utf8");
    });
};

generate();
console.log(`Journal generated in ${outputRoot}.`);
