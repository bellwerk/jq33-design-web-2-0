import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  elements,
  getAttribute,
  htmlDocuments,
  projectSlugs,
  reportFailures,
  requireDirectory,
  resolveDistRoot,
  tags,
  walkFiles,
} from "../tests/helpers/site.mjs";

const distRoot = resolveDistRoot();
const failures = [];

try {
  requireDirectory(distRoot, "Distribution directory");
  const documents = htmlDocuments(distRoot);
  const textFiles = walkFiles(distRoot).filter((file) =>
    [".css", ".html", ".js", ".svg", ".xml"].includes(path.extname(file).toLowerCase()),
  );

  const remoteImagePattern =
    /(?:https?:)?\/\/[^"'()\s>]+\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#][^"'()\s>]*)?/gi;
  for (const file of textFiles) {
    const relative = path.relative(distRoot, file).split(path.sep).join("/");
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(remoteImagePattern)) {
      let parsed;
      try {
        parsed = new URL(match[0].startsWith("//") ? `https:${match[0]}` : match[0]);
      } catch {
        continue;
      }
      if (parsed.origin !== "https://jq33.design") {
        failures.push(`${relative} contains remote imagery: ${match[0]}`);
      }
    }
    if (/images\.unsplash\.com|(?:^|[./])unsplash\.com/i.test(source)) {
      failures.push(`${relative} contains an Unsplash reference.`);
    }
  }

  const localImageRefs = new Set();
  for (const document of documents) {
    for (const tagName of ["img", "source", "video"]) {
      for (const tag of tags(document.html, tagName)) {
        const values = [
          getAttribute(tag, "src"),
          getAttribute(tag, "poster"),
          ...getAttribute(tag, "srcset")
            .split(",")
            .map((candidate) => candidate.trim().split(/\s+/, 1)[0]),
        ].filter(Boolean);
        for (const value of values) {
          if (/^(?:data:|https?:\/\/)/i.test(value)) {
            if (!value.startsWith("https://jq33.design/")) continue;
          }
          let pathname = value;
          if (pathname.startsWith("https://jq33.design/")) pathname = new URL(pathname).pathname;
          if (!pathname.startsWith("/")) {
            failures.push(`${document.relativePath} uses a non-root-relative image reference: ${value}`);
            continue;
          }
          const clean = decodeURIComponent(pathname.split(/[?#]/, 1)[0]).replace(/^\/+/, "");
          const target = path.resolve(distRoot, clean);
          if (!target.startsWith(`${distRoot}${path.sep}`) || !fs.existsSync(target)) {
            failures.push(`${document.relativePath} references missing local imagery: ${pathname}`);
          } else {
            localImageRefs.add(clean);
          }
        }
      }
    }
  }

  const hashesByProject = new Map();
  for (const slug of projectSlugs) {
    const routeDocument = documents.find((document) => document.route === `/projects/${slug}/`);
    if (!routeDocument) {
      failures.push(`Project route is missing for ${slug}.`);
      continue;
    }
    const disclosure = /self[- ]initiated\s+concept\s+stud(?:y|ies)/i;
    if (!disclosure.test(routeDocument.html)) {
      failures.push(`${routeDocument.relativePath} lacks the self-initiated concept-study disclosure.`);
    }

    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(routeDocument.html)?.[1] || "";
    const descriptionTag = tags(routeDocument.html, "meta").find(
      (tag) => getAttribute(tag, "name").toLowerCase() === "description",
    );
    const description = descriptionTag ? getAttribute(descriptionTag, "content") : "";
    if (!/concept\s+stud(?:y|ies)/i.test(`${title} ${description}`)) {
      failures.push(`${routeDocument.relativePath} SEO title/description does not disclose a concept study.`);
    }

    const projectImages = tags(routeDocument.html, "img").filter((tag) =>
      getAttribute(tag, "src").includes(`/assets/projects/${slug}/`),
    );
    if (projectImages.length < 1) {
      failures.push(`${routeDocument.relativePath} must visibly use its local project visual.`);
    }
    for (const image of projectImages) {
      const alt = getAttribute(image, "alt");
      if (!/self[- ]initiated/i.test(alt) || !/\bstud(?:y|ies)\b/i.test(alt)) {
        failures.push(
          `${routeDocument.relativePath} project image alt text must identify concept-study context.`,
        );
      }
    }

    const assetDirectory = path.join(distRoot, "assets", "projects", slug);
    if (!fs.existsSync(assetDirectory)) {
      failures.push(`Missing local project asset directory: assets/projects/${slug}`);
      continue;
    }
    const hashes = [];
    for (const file of walkFiles(assetDirectory).filter((asset) =>
      /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(asset),
    )) {
      hashes.push({
        file,
        hash: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      });
    }
    if (hashes.length < 2) failures.push(`Project ${slug} has fewer than two local visual assets.`);
    hashesByProject.set(slug, hashes);
  }

  const hashOwner = new Map();
  for (const [slug, assets] of hashesByProject) {
    for (const asset of assets) {
      if (hashOwner.has(asset.hash) && hashOwner.get(asset.hash) !== slug) {
        failures.push(
          `Projects ${hashOwner.get(asset.hash)} and ${slug} share duplicate visual bytes (${path.basename(asset.file)}).`,
        );
      } else {
        hashOwner.set(asset.hash, slug);
      }
    }
  }

  for (const document of documents) {
    const mentionedSlugs = projectSlugs.filter((slug) =>
      document.html.includes(`/projects/${slug}/`),
    );
    if (mentionedSlugs.length && !/concept\s+stud(?:y|ies)/i.test(document.html)) {
      failures.push(
        `${document.relativePath} presents project content without a concept-study disclosure.`,
      );
    }
  }

  for (const document of documents) {
    for (const link of elements(document.html, "a")) {
      const href = getAttribute(link.tag, "href");
      if (!projectSlugs.some((slug) => href === `/projects/${slug}/`)) continue;
      const context = `${link.tag} ${link.source}`;
      if (
        !/self[- ]initiated\s+concept\s+stud(?:y|ies)/i.test(context) ||
        !/not\s+completed\s+client\s+work/i.test(context)
      ) {
        failures.push(
          `${document.relativePath} links to ${href} without a per-appearance self-initiated/not-completed disclosure.`,
        );
      }
    }
  }

  const projectDocuments = documents.filter(
    (document) => document.route === "/" || document.route.startsWith("/projects/"),
  );
  const prohibitedProof = [
    { pattern: /\b(?:client|location|year|timeline|area|testimonial|award|partner(?:ship)?)\s*:/i, label: "unsupported proof label" },
    { pattern: /"(?:client|location|dateCreated|temporalCoverage|award|review|aggregateRating)"\s*:/i, label: "unsupported schema fact" },
    { pattern: /\b(?:completed|delivered|built|opened)\s+(?:for|with)\s+(?:a|the|our)\s+client\b/i, label: "claimed client delivery" },
    { pattern: /\b(?:increased|improved|grew|reduced)\s+(?:sales|revenue|traffic|conversion|costs?)\s+by\s+\d/i, label: "unsupported outcome metric" },
    { pattern: /<blockquote\b|class=["'][^"']*testimonial/i, label: "testimonial or quotation proof" },
  ];
  for (const document of projectDocuments) {
    for (const { pattern, label } of prohibitedProof) {
      if (pattern.test(document.html)) failures.push(`${document.relativePath} contains ${label}.`);
    }
  }

  if (!localImageRefs.size) failures.push("No local image references were found in launch HTML.");
} catch (error) {
  failures.push(error.message);
}

reportFailures(
  "Content and local-asset validation",
  failures,
  "Content and local-asset validation passed.",
);
