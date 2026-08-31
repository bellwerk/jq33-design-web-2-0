import fs from "node:fs";
import path from "node:path";
import {
  canonicalOrigin,
  elements,
  getAttribute,
  htmlDocuments,
  imageDimensions,
  linkHref,
  localPathFromUrl,
  metaContent,
  publicRoutes,
  repositoryRoot,
  reportFailures,
  requireDirectory,
  resolveDistRoot,
  safeJsonParse,
  tags,
} from "../tests/helpers/site.mjs";

const distRoot = resolveDistRoot();
const failures = [];
const seenTitles = new Map();
const seenDescriptions = new Map();
const projectsTitle = "Commercial Interior Design Concept Studies | JQ33 DESIGN";
const allowedSchemaTypes = new Set([
  "AboutPage",
  "Article",
  "BreadcrumbList",
  "City",
  "CollectionPage",
  "ContactPage",
  "CreativeWork",
  "ImageObject",
  "ItemList",
  "ListItem",
  "Organization",
  "Person",
  "PostalAddress",
  "ProfessionalService",
  "PropertyValue",
  "FAQPage",
  "Question",
  "Answer",
  "Service",
  "WebPage",
  "WebSite",
]);

const flattenSchema = (value, output = []) => {
  if (!value || typeof value !== "object") return output;
  output.push(value);
  if (Array.isArray(value)) {
    for (const child of value) flattenSchema(child, output);
  } else {
    for (const child of Object.values(value)) flattenSchema(child, output);
  }
  return output;
};

try {
  requireDirectory(distRoot, "Distribution directory");
  const documents = htmlDocuments(distRoot);

  for (const document of documents) {
    const htmlTag = tags(document.html, "html")[0] || "";
    if (getAttribute(htmlTag, "lang") !== "en-CA") {
      failures.push(`${document.relativePath} must declare lang="en-CA".`);
    }

    if (document.notFound) {
      const robots = metaContent(document.html, "name", "robots");
      if (robots.length !== 1 || !/\bnoindex\b/i.test(robots[0])) {
        failures.push("404.html must contain exactly one noindex robots directive.");
      }
      continue;
    }

    const titleMatches = [...document.html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
    const title = (titleMatches[0]?.[1] || "").replace(/\s+/g, " ").trim();
    if (titleMatches.length !== 1) failures.push(`${document.relativePath} must contain one title.`);
    if (title.length < 30 || title.length > 60) {
      failures.push(`${document.relativePath} title length is ${title.length}; expected 30-60.`);
    }
    if (seenTitles.has(title)) {
      failures.push(`${document.relativePath} duplicates the title from ${seenTitles.get(title)}.`);
    } else seenTitles.set(title, document.relativePath);
    if (document.route === "/projects/" && title !== projectsTitle) {
      failures.push(`projects/index.html title must be exactly "${projectsTitle}".`);
    }

    const descriptions = metaContent(document.html, "name", "description");
    const description = descriptions[0] || "";
    if (descriptions.length !== 1) failures.push(`${document.relativePath} must contain one meta description.`);
    if (description.length < 120 || description.length > 155) {
      failures.push(
        `${document.relativePath} description length is ${description.length}; expected 120-155.`,
      );
    }
    if (seenDescriptions.has(description)) {
      failures.push(
        `${document.relativePath} duplicates the description from ${seenDescriptions.get(description)}.`,
      );
    } else seenDescriptions.set(description, document.relativePath);

    const expectedCanonical = `${canonicalOrigin}${document.route}`;
    const canonicals = linkHref(document.html, "canonical");
    if (canonicals.length !== 1 || canonicals[0] !== expectedCanonical) {
      failures.push(`${document.relativePath} canonical must be exactly ${expectedCanonical}.`);
    }

    const ogUrl = metaContent(document.html, "property", "og:url");
    const ogLocale = metaContent(document.html, "property", "og:locale");
    if (ogUrl.length !== 1 || ogUrl[0] !== expectedCanonical) {
      failures.push(`${document.relativePath} og:url must match its canonical.`);
    }
    if (ogLocale.length !== 1 || ogLocale[0] !== "en_CA") {
      failures.push(`${document.relativePath} must declare og:locale en_CA.`);
    }
    for (const [attribute, name] of [
      ["property", "og:title"],
      ["property", "og:description"],
      ["property", "og:image"],
      ["property", "og:image:width"],
      ["property", "og:image:height"],
      ["property", "og:image:alt"],
      ["name", "twitter:card"],
      ["name", "twitter:title"],
      ["name", "twitter:description"],
      ["name", "twitter:image"],
    ]) {
      const values = metaContent(document.html, attribute, name);
      if (values.length !== 1 || !values[0].trim()) {
        failures.push(`${document.relativePath} must contain one populated ${name} meta tag.`);
      }
    }
    if (metaContent(document.html, "property", "og:image:width")[0] !== "1200") {
      failures.push(`${document.relativePath} og:image:width must be 1200.`);
    }
    if (metaContent(document.html, "property", "og:image:height")[0] !== "630") {
      failures.push(`${document.relativePath} og:image:height must be 630.`);
    }

    const socialImages = new Set([
      ...metaContent(document.html, "property", "og:image"),
      ...metaContent(document.html, "name", "twitter:image"),
    ]);
    for (const value of socialImages) {
      const target = localPathFromUrl(value, distRoot);
      if (!target || !fs.existsSync(target)) {
        failures.push(`${document.relativePath} social image must resolve locally: ${value}`);
        continue;
      }
      if (!/\.(?:jpe?g|png|webp)$/i.test(target)) {
        failures.push(`${document.relativePath} social image must be raster: ${value}`);
        continue;
      }
      const dimensions = imageDimensions(target);
      if (!dimensions || dimensions.width !== 1200 || dimensions.height !== 630) {
        failures.push(`${document.relativePath} social image is not physically 1200x630: ${value}`);
      }
    }

    if (/<link\b[^>]*\brel=["'][^"']*alternate/i.test(document.html) || /\bhreflang\s*=/i.test(document.html)) {
      failures.push(`${document.relativePath} contains an unsupported alternate-locale claim.`);
    }

    const schemaScripts = elements(document.html, "script").filter(
      ({ tag }) => getAttribute(tag, "type").toLowerCase() === "application/ld+json",
    );
    for (const [index, script] of schemaScripts.entries()) {
      const parsed = safeJsonParse(
        script.content,
        `${document.relativePath} JSON-LD block ${index + 1}`,
        failures,
      );
      if (!parsed) continue;
      const objects = flattenSchema(parsed);
      for (const object of objects) {
        const types = Array.isArray(object?.["@type"])
          ? object["@type"]
          : object?.["@type"]
            ? [object["@type"]]
            : [];
        for (const type of types) {
          if (type === "SearchAction") failures.push(`${document.relativePath} schema contains SearchAction.`);
          else if (!allowedSchemaTypes.has(type)) {
            failures.push(`${document.relativePath} schema uses unsupported type "${type}".`);
          }
        }
        for (const prohibited of [
          "award",
          "aggregateRating",
          "review",
          "client",
          "dateCreated",
          "temporalCoverage",
          "locationCreated",
        ]) {
          if (Object.hasOwn(object, prohibited)) {
            failures.push(`${document.relativePath} schema contains unsupported "${prohibited}" proof.`);
          }
        }
      }
      if (/potentialAction[\s\S]*SearchAction/i.test(script.content)) {
        failures.push(`${document.relativePath} schema contains a SearchAction.`);
      }
    }
  }

  const sitemapPath = path.join(distRoot, "sitemap.xml");
  const sitemap = fs.readFileSync(sitemapPath, "utf8");
  const urlBlocks = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/gi)].map((match) => match[1]);
  const actualUrls = urlBlocks.map((block) => /<loc>([^<]+)<\/loc>/i.exec(block)?.[1] || "");
  const expectedUrls = publicRoutes.map((route) => `${canonicalOrigin}${route}`);
  if (
    actualUrls.length !== expectedUrls.length ||
    new Set(actualUrls).size !== actualUrls.length ||
    !expectedUrls.every((url) => actualUrls.includes(url)) ||
    !actualUrls.every((url) => expectedUrls.includes(url))
  ) {
    failures.push("sitemap.xml must have exact, duplicate-free parity with indexable routes.");
  }
  for (const block of urlBlocks) {
    const loc = /<loc>([^<]+)<\/loc>/i.exec(block)?.[1] || "(missing loc)";
    const lastmods = [...block.matchAll(/<lastmod>([^<]+)<\/lastmod>/gi)].map((match) => match[1]);
    if (lastmods.length !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(lastmods[0])) {
      failures.push(`Sitemap entry ${loc} needs one ISO calendar-date lastmod.`);
      continue;
    }
    const timestamp = Date.parse(`${lastmods[0]}T23:59:59Z`);
    if (!Number.isFinite(timestamp) || timestamp > Date.now() + 24 * 60 * 60 * 1000) {
      failures.push(`Sitemap entry ${loc} has an invalid/future lastmod.`);
    }
  }

  const posts = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, "data", "posts.json"), "utf8"),
  );
  for (const post of posts.filter((entry) => entry?.status === "published")) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(post.modified || "")) {
      failures.push(`Published journal entry ${post.slug || "(missing slug)"} needs a traceable modified date.`);
      continue;
    }
    const expectedLoc = `${canonicalOrigin}/journal/${post.slug}/`;
    const block = urlBlocks.find(
      (candidate) => /<loc>([^<]+)<\/loc>/i.exec(candidate)?.[1] === expectedLoc,
    );
    const actualLastmod = block
      ? /<lastmod>([^<]+)<\/lastmod>/i.exec(block)?.[1] || ""
      : "";
    if (actualLastmod !== post.modified) {
      failures.push(
        `Sitemap entry ${expectedLoc} lastmod must equal data/posts.json modified (${post.modified}).`,
      );
    }
  }

  const robots = fs.readFileSync(path.join(distRoot, "robots.txt"), "utf8");
  if (!/^User-agent:\s*\*/im.test(robots) || !/^Allow:\s*\/\s*$/im.test(robots)) {
    failures.push("robots.txt must explicitly permit intended crawling.");
  }
  const sitemapLines = [...robots.matchAll(/^Sitemap:\s*(\S+)\s*$/gim)].map((match) => match[1]);
  if (sitemapLines.length !== 1 || sitemapLines[0] !== `${canonicalOrigin}/sitemap.xml`) {
    failures.push("robots.txt must reference exactly the canonical sitemap.");
  }
  if (/^Disallow:\s*\/(?:\.|admin|data|scripts|supabase|functions)/im.test(robots)) {
    failures.push("robots.txt must not advertise or protect source-only paths.");
  }

  const notFoundUrl = `${canonicalOrigin}/404.html`;
  if (actualUrls.includes(notFoundUrl)) failures.push("404.html must be excluded from the sitemap.");
} catch (error) {
  failures.push(error.message);
}

reportFailures("SEO and crawl validation", failures, "SEO and crawl validation passed.");
