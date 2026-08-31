import {
  getAttribute,
  hasAttribute,
  htmlDocuments,
  reportFailures,
  requireDirectory,
  resolveDistRoot,
  tags,
} from "../tests/helpers/site.mjs";

const distRoot = resolveDistRoot();
const failures = [];

try {
  requireDirectory(distRoot, "Distribution directory");
  const documents = htmlDocuments(distRoot);

  let HtmlValidate;
  try {
    ({ HtmlValidate } = await import("html-validate"));
  } catch (error) {
    throw new Error(
      `html-validate is required for standards validation and could not be loaded: ${error.message}`,
    );
  }

  const validator = new HtmlValidate({
    extends: ["html-validate:recommended"],
    rules: {
      "no-inline-style": "off",
      "prefer-native-element": "off",
      "require-sri": "off",
      "svg-focusable": "off",
      "doctype-style": "off",
      "void-style": "off",
      "no-trailing-whitespace": "off",
    },
  });

  for (const document of documents) {
    const report = await validator.validateString(document.html, document.relativePath);
    if (!report.valid) {
      for (const result of report.results) {
        for (const message of result.messages.filter((entry) => entry.severity === 2)) {
          failures.push(
            `${document.relativePath}:${message.line}:${message.column} ${message.ruleId}: ${message.message}`,
          );
        }
      }
    }

    if (!/^\s*<!doctype html>/i.test(document.html)) {
      failures.push(`${document.relativePath} must begin with an HTML5 doctype.`);
    }
    for (const element of ["html", "head", "body", "main"]) {
      if (tags(document.html, element).length !== 1) {
        failures.push(`${document.relativePath} must contain exactly one <${element}>.`);
      }
    }
    if (tags(document.html, "h1").length !== 1) {
      failures.push(`${document.relativePath} must contain exactly one h1.`);
    }

    const idOwners = new Map();
    for (const tag of [...document.html.matchAll(/<[A-Za-z][^>]*>/g)].map((match) => match[0])) {
      const id = getAttribute(tag, "id");
      if (!id) continue;
      if (idOwners.has(id)) failures.push(`${document.relativePath} contains duplicate id "${id}".`);
      else idOwners.set(id, tag);
    }
    for (const tag of [...document.html.matchAll(/<[A-Za-z][^>]*>/g)].map((match) => match[0])) {
      for (const attribute of [
        "aria-controls",
        "aria-describedby",
        "aria-labelledby",
        "for",
      ]) {
        const references = getAttribute(tag, attribute).split(/\s+/).filter(Boolean);
        for (const reference of references) {
          if (!idOwners.has(reference)) {
            failures.push(
              `${document.relativePath} ${attribute} references missing id "${reference}".`,
            );
          }
        }
      }
      if (/\son[A-Za-z]+\s*=/.test(tag)) {
        failures.push(`${document.relativePath} contains an inline event-handler attribute.`);
      }
    }

    for (const image of tags(document.html, "img")) {
      if (!hasAttribute(image, "alt")) failures.push(`${document.relativePath} has an img without alt.`);
      if (!getAttribute(image, "width") || !getAttribute(image, "height")) {
        failures.push(`${document.relativePath} image lacks intrinsic width/height.`);
      }
    }
    for (const anchor of tags(document.html, "a")) {
      if (!getAttribute(anchor, "href").trim()) {
        failures.push(`${document.relativePath} contains an anchor without a non-empty href.`);
      }
    }
    for (const button of tags(document.html, "button")) {
      if (!getAttribute(button, "type")) {
        failures.push(`${document.relativePath} button must declare its type.`);
      }
    }
  }
} catch (error) {
  failures.push(error.message);
}

reportFailures("HTML standards validation", failures, "HTML standards validation passed.");
