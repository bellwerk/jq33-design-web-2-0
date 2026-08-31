import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_HTML_FILES = ["index.html", "404.html"];
const PUBLIC_HTML_DIRECTORIES = [
  "commercial-interior-design-montreal",
  "contact",
  "inquiry",
  "privacy",
  "terms",
  "journal",
  "projects",
];
const EXCLUDED_PUBLIC_SOURCES = new Set([
  // Deprecated redirect targets are deliberately not copied by scripts/build.mjs.
  "home-page.html",
  "projects/project.html",
]);
const SPACING_PROPERTY =
  "(?:margin|padding)(?:-(?:top|right|bottom|left|inline|inline-start|inline-end|block|block-start|block-end))?|gap|row-gap|column-gap|top|right|bottom|left|inset(?:-(?:inline|block)(?:-(?:start|end))?)?";
const SPACING_DECLARATION = new RegExp(
  `(?<prefix>^|[;{])(?<indent>\\s*)(?<property>${SPACING_PROPERTY})(?<separator>\\s*:\\s*)(?<value>[^;{}]+?)(?=\\s*(?:;|}|$))`,
  "gim",
);
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const RAW_LENGTH = /(?<![a-z0-9_.-])(?<number>-?(?:\d+(?:\.\d*)?|\.\d+))(?<unit>px|rem|em)\b/gi;
const ROOT_FONT_SIZE_PX = 16;
const EPSILON = 1e-8;

const normalizeRelative = (value) => value.split(path.sep).join("/");

const parseArgs = (argv) => {
  const options = {
    rootDir: path.resolve(__dirname, ".."),
    mode: "dry-run",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--write") {
      options.mode = "write";
      continue;
    }
    if (argument === "--check") {
      options.mode = "check";
      continue;
    }
    if (argument === "--dry-run") {
      options.mode = "dry-run";
      continue;
    }
    if (argument === "--root") {
      const value = argv[index + 1];
      if (!value) throw new Error("--root requires a directory.");
      options.rootDir = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
};

const walk = (directory, predicate, output = []) => {
  if (!fs.existsSync(directory)) return output;
  const entries = fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      walk(fullPath, predicate, output);
      continue;
    }
    if (entry.isFile() && predicate(fullPath)) output.push(fullPath);
  }
  return output;
};

export const discoverPublicStyleSources = (rootDir) => {
  const tokenPath = path.join(rootDir, "tokens.css");
  if (!fs.existsSync(tokenPath)) {
    throw new Error(`Missing spacing token source: ${tokenPath}`);
  }

  const files = new Set([tokenPath]);
  for (const cssPath of walk(
    path.join(rootDir, "assets", "css"),
    (candidate) => path.extname(candidate).toLowerCase() === ".css",
  )) {
    files.add(cssPath);
  }
  for (const relativePath of PUBLIC_HTML_FILES) {
    const filePath = path.join(rootDir, relativePath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing public HTML source: ${relativePath}`);
    }
    files.add(filePath);
  }
  for (const relativeDirectory of PUBLIC_HTML_DIRECTORIES) {
    for (const htmlPath of walk(
      path.join(rootDir, relativeDirectory),
      (candidate) => path.extname(candidate).toLowerCase() === ".html",
    )) {
      const relativePath = normalizeRelative(path.relative(rootDir, htmlPath));
      if (!EXCLUDED_PUBLIC_SOURCES.has(relativePath)) files.add(htmlPath);
    }
  }

  return [...files].sort((left, right) =>
    normalizeRelative(path.relative(rootDir, left)).localeCompare(
      normalizeRelative(path.relative(rootDir, right)),
    ),
  );
};

const scalarLength = (value) => {
  const match = /^\s*(?<number>\d+(?:\.\d*)?|\.\d+)(?<unit>px|rem)\s*$/i.exec(value);
  if (!match) return null;
  const number = Number.parseFloat(match.groups.number);
  return {
    number,
    unit: match.groups.unit.toLowerCase(),
    px: match.groups.unit.toLowerCase() === "rem" ? number * ROOT_FONT_SIZE_PX : number,
  };
};

export const readSpacingScale = (rootDir) => {
  const tokenPath = path.join(rootDir, "tokens.css");
  const source = fs.readFileSync(tokenPath, "utf8");
  const tokens = [];
  for (const match of source.matchAll(
    /^\s*(?<name>--space-[a-z0-9-]+)\s*:\s*(?<value>[^;]+);/gim,
  )) {
    const length = scalarLength(match.groups.value);
    if (!length) continue;
    tokens.push({
      name: match.groups.name,
      value: match.groups.value.trim(),
      px: length.px,
    });
  }
  if (!tokens.length) {
    throw new Error("tokens.css does not contain any scalar --space-* tokens.");
  }
  return tokens;
};

export const tokenForLength = (number, unit, tokens) => {
  if (!Number.isFinite(number) || number <= 0) return null;
  const px = unit.toLowerCase() === "rem" ? number * ROOT_FONT_SIZE_PX : number;
  return tokens.find((token) => Math.abs(token.px - px) < EPSILON) || null;
};

const functionContextAt = (value, targetIndex) => {
  const stack = [];
  let quote = "";
  let escaped = false;

  for (let index = 0; index < targetIndex; index += 1) {
    const character = value[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") {
      const before = value.slice(0, index);
      const name = /([a-z-]+)\s*$/i.exec(before)?.[1]?.toLowerCase() || "";
      stack.push(name);
      continue;
    }
    if (character === ")") stack.pop();
  }

  return { quote, stack };
};

export const rawSpacingLengths = (value) => {
  const lengths = [];
  for (const match of value.matchAll(RAW_LENGTH)) {
    const context = functionContextAt(value, match.index);
    lengths.push({
      literal: match[0],
      number: Number.parseFloat(match.groups.number),
      unit: match.groups.unit.toLowerCase(),
      index: match.index,
      inString: Boolean(context.quote),
      functions: context.stack,
    });
  }
  return lengths;
};

const tokenizeValue = (value, tokens) => {
  let replacements = 0;
  const output = value.replace(RAW_LENGTH, (literal, ...callbackArguments) => {
    const groups = callbackArguments.at(-1);
    const offset = callbackArguments.at(-3);
    const number = Number.parseFloat(groups.number);
    const unit = groups.unit.toLowerCase();
    const context = functionContextAt(value, offset);

    // Custom-property fallbacks and URL/string payloads are resilience/content,
    // not authored layout values. Rewriting a --space-* fallback can recurse.
    if (
      context.quote ||
      context.stack.includes("var") ||
      context.stack.includes("url") ||
      number <= 0 ||
      unit === "em"
    ) {
      return literal;
    }

    const token = tokenForLength(number, unit, tokens);
    if (!token) return literal;
    replacements += 1;
    return `var(${token.name})`;
  });
  return { output, replacements };
};

export const collectSpacingDeclarations = (css) => {
  const declarations = [];
  let cursor = 0;

  const collectSegment = (segment, segmentOffset) => {
    SPACING_DECLARATION.lastIndex = 0;
    for (const match of segment.matchAll(SPACING_DECLARATION)) {
      const groups = match.groups;
      const valueOffset =
        groups.prefix.length +
        groups.indent.length +
        groups.property.length +
        groups.separator.length;
      declarations.push({
        property: groups.property.toLowerCase(),
        value: groups.value.trimEnd(),
        offset: segmentOffset + match.index,
        valueOffset: segmentOffset + match.index + valueOffset,
      });
    }
  };

  CSS_COMMENT.lastIndex = 0;
  for (const comment of css.matchAll(CSS_COMMENT)) {
    collectSegment(css.slice(cursor, comment.index), cursor);
    cursor = comment.index + comment[0].length;
  }
  collectSegment(css.slice(cursor), cursor);
  return declarations;
};

export const transformCssSpacing = (css, tokens) => {
  let cursor = 0;
  let replacements = 0;
  let output = "";

  const transformSegment = (segment) => {
    SPACING_DECLARATION.lastIndex = 0;
    return segment.replace(SPACING_DECLARATION, (...callbackArguments) => {
      const groups = callbackArguments.at(-1);
      const transformed = tokenizeValue(groups.value, tokens);
      replacements += transformed.replacements;
      return `${groups.prefix}${groups.indent}${groups.property}${groups.separator}${transformed.output}`;
    });
  };

  CSS_COMMENT.lastIndex = 0;
  for (const comment of css.matchAll(CSS_COMMENT)) {
    output += transformSegment(css.slice(cursor, comment.index));
    output += comment[0];
    cursor = comment.index + comment[0].length;
  }
  output += transformSegment(css.slice(cursor));
  return { output, replacements };
};

export const extractHtmlCssFragments = (html) => {
  const fragments = [];
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const content = match[1];
    fragments.push({
      kind: "style element",
      css: content,
      startIndex: match.index + match[0].indexOf(content),
    });
  }
  for (const match of html.matchAll(/\sstyle\s*=\s*(["'])(.*?)\1/gi)) {
    const content = match[2];
    fragments.push({
      kind: "style attribute",
      css: content,
      startIndex: match.index + match[0].indexOf(content),
    });
  }
  return fragments.sort((left, right) => left.startIndex - right.startIndex);
};

export const transformHtmlSpacing = (html, tokens) => {
  let replacements = 0;
  let output = html.replace(
    /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
    (_match, attributes, css) => {
      const transformed = transformCssSpacing(css, tokens);
      replacements += transformed.replacements;
      return `<style${attributes}>${transformed.output}</style>`;
    },
  );
  output = output.replace(
    /\sstyle\s*=\s*(["'])(.*?)\1/gi,
    (_match, quote, css) => {
      const transformed = transformCssSpacing(css, tokens);
      replacements += transformed.replacements;
      return ` style=${quote}${transformed.output}${quote}`;
    },
  );
  return { output, replacements };
};

const main = () => {
  const { rootDir, mode } = parseArgs(process.argv.slice(2));
  const tokens = readSpacingScale(rootDir);
  const sources = discoverPublicStyleSources(rootDir);
  const changed = [];
  let replacementCount = 0;

  for (const filePath of sources) {
    const source = fs.readFileSync(filePath, "utf8");
    const transformed = filePath.toLowerCase().endsWith(".html")
      ? transformHtmlSpacing(source, tokens)
      : transformCssSpacing(source, tokens);
    const secondPass = filePath.toLowerCase().endsWith(".html")
      ? transformHtmlSpacing(transformed.output, tokens)
      : transformCssSpacing(transformed.output, tokens);
    if (secondPass.replacements !== 0 || secondPass.output !== transformed.output) {
      throw new Error(
        `Spacing tokenizer is not idempotent for ${normalizeRelative(
          path.relative(rootDir, filePath),
        )}.`,
      );
    }
    if (!transformed.replacements) continue;

    const relativePath = normalizeRelative(path.relative(rootDir, filePath));
    changed.push({ relativePath, replacements: transformed.replacements });
    replacementCount += transformed.replacements;
    if (mode === "write") fs.writeFileSync(filePath, transformed.output, "utf8");
  }

  const verb =
    mode === "write" ? "Tokenized" : mode === "check" ? "Checked" : "Would tokenize";
  console.log(
    `${verb} ${replacementCount} exact spacing-scale bypasses across ${changed.length}/${sources.length} public style sources.`,
  );
  console.log(
    `Scale: ${tokens.map((token) => `${token.name}=${token.value}`).join(", ")}.`,
  );
  for (const item of changed) {
    console.log(`- ${item.relativePath}: ${item.replacements}`);
  }
  console.log("Idempotence: PASS (every transformed source is stable on a second pass).");

  if (mode === "check" && replacementCount > 0) process.exitCode = 1;
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
