import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const dataPath = path.join(rootDir, "data", "posts.json");
const postTemplatePath = path.join(rootDir, "journal", "_journal-template.html");
const indexTemplatePath = path.join(
  rootDir,
  "journal",
  "_journal-index-template.html"
);

const baseUrl = (process.env.PUBLIC_SITE_URL || "https://jq33.design").replace(/\/+$/, "");
const defaultOgImage = `${baseUrl}/og/jq33-design-commercial-interior-montreal.png`;

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
    throw new Error("posts.json must be an array");
  }
  return parsed;
};

const fillTemplate = (template, replacements) =>
  Object.entries(replacements).reduce(
    (result, [key, value]) =>
      result.replaceAll(`{{${key}}}`, value ?? ""),
    template
  );

const renderParagraphs = (paragraphs) =>
  (paragraphs ?? []).map((para) => `<p>${escapeHtml(para)}</p>`).join("");

const renderKeyConcepts = (items) =>
  (items ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");

const renderClosingBlocks = (paragraphs) =>
  (paragraphs ?? [])
    .map(
      (para) => `
        <div class="body-text">
          <p>${escapeHtml(para)}</p>
        </div>`
    )
    .join("");

const renderCards = (posts) =>
  posts
    .map((post) => {
      const imageSrc = pickImage(post.card?.image);
      const titleLines = joinLinesWithBreaks(post.title_lines);
      const meta = escapeHtml(post.card?.meta ?? "");
      const number = escapeHtml(post.card?.number ?? "");
      const alt = escapeHtml(post.card?.alt ?? post.title ?? "Journal post");
      const tag = post.status === "published" ? "a" : "div";
      const href =
        post.status === "published" ? `href="/journal/${post.slug}/"` : "";
      return `
        <${tag}
          ${href}
          class="project-card"
          onmouseenter="hoverCursor()"
          onmouseleave="leaveCursor()"
        >
          <img
            src="${imageSrc}"
            class="project-image"
            alt="${alt}"
            width="2400"
            height="1600"
            loading="lazy"
            decoding="async"
          />
          <div class="project-number">${number}</div>
          <div class="project-overlay">
            <div class="project-meta">${meta}</div>
            <h2 class="project-title">${titleLines}</h2>
          </div>
        </${tag}>`;
    })
    .join("");

const upperLines = (lines) => (lines ?? []).map((line) => String(line).toUpperCase());

const generate = () => {
  const posts = loadJson(dataPath);
  const postTemplate = fs.readFileSync(postTemplatePath, "utf8");
  const indexTemplate = fs.readFileSync(indexTemplatePath, "utf8");

  const indexHtml = fillTemplate(indexTemplate, {
    post_cards: renderCards(posts)
  });

  fs.writeFileSync(path.join(rootDir, "journal", "index.html"), indexHtml, "utf8");

  const findNextPublished = (startIndex) => {
    for (let i = startIndex + 1; i < posts.length; i += 1) {
      if (posts[i]?.status === "published") return posts[i];
    }
    return null;
  };

  posts
    .filter((post) => post.status === "published")
    .forEach((post) => {
      const postIndex = posts.findIndex((entry) => entry.slug === post.slug);
      const nextPost = postIndex >= 0 ? findNextPublished(postIndex) : null;
      const nextHref = nextPost ? `/journal/${nextPost.slug}/` : "/journal/";
      const nextLabelLines = nextPost?.title_lines ?? ["Back", "to Journal"];
      const nextLabel = joinLinesWithBreaks(upperLines(nextLabelLines));

      const metaTitle = escapeHtml(post.meta?.title || post.title);
      const metaDescription = escapeHtml(post.meta?.description || "");
      const schemaHeadline = escapeHtml(post.title || post.meta?.title || "");
      const canonicalUrl = `${baseUrl}/journal/${post.slug}/`;
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
        twitter_title: metaTitle,
        twitter_description: metaDescription,
        twitter_image: ogImage,
        schema_headline: schemaHeadline,
        schema_description: metaDescription,
        schema_image: schemaImage,
        schema_date_published: post.published || "",
        schema_page_url: canonicalUrl,
        published_display: escapeHtml(post.published_display || ""),
        category: escapeHtml(post.category || ""),
        author: escapeHtml(post.author || ""),
        hero_title: joinLinesWithBreaks(post.hero_title_lines || post.title_lines),
        lead: escapeHtml(post.lead || ""),
        intro_paragraphs: renderParagraphs(post.intro_paragraphs),
        image_one_src: pickImage(post.images?.feature_one),
        image_one_alt: escapeHtml(post.images?.feature_one?.alt || post.title || ""),
        image_one_label: escapeHtml(post.images?.feature_one?.label || ""),
        image_one_width: post.images?.feature_one?.width || 2070,
        image_one_height: post.images?.feature_one?.height || 1380,
        key_concepts: renderKeyConcepts(post.key_concepts),
        image_two_src: pickImage(post.images?.feature_two),
        image_two_alt: escapeHtml(post.images?.feature_two?.alt || post.title || ""),
        image_two_label: escapeHtml(post.images?.feature_two?.label || ""),
        image_two_width: post.images?.feature_two?.width || 1964,
        image_two_height: post.images?.feature_two?.height || 1309,
        pull_quote: escapeHtml(post.pull_quote || ""),
        image_three_src: pickImage(post.images?.feature_three),
        image_three_alt: escapeHtml(post.images?.feature_three?.alt || post.title || ""),
        image_three_label: escapeHtml(post.images?.feature_three?.label || ""),
        image_three_width: post.images?.feature_three?.width || 2070,
        image_three_height: post.images?.feature_three?.height || 1380,
        closing_blocks: renderClosingBlocks(post.closing_paragraphs),
        next_href: nextHref,
        next_label: nextLabel
      });

      const postDir = path.join(rootDir, "journal", post.slug);
      fs.mkdirSync(postDir, { recursive: true });
      fs.writeFileSync(path.join(postDir, "index.html"), html, "utf8");
    });
};

generate();
console.log("Journal generated.");
