import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectSpacingDeclarations,
  discoverPublicStyleSources,
  extractHtmlCssFragments,
  rawSpacingLengths,
  readSpacingScale,
  tokenForLength,
} from "./tokenize-design-spacing.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ALLOWED_NEGATIVE_A11Y_MARGIN = -1;

const normalizeRelative = (value) => value.split(path.sep).join("/");

const parseArgs = (argv) => {
  const options = {
    rootDir: path.resolve(__dirname, ".."),
    maxErrors: 100,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      const value = argv[index + 1];
      if (!value) throw new Error("--root requires a directory.");
      options.rootDir = path.resolve(value);
      index += 1;
      continue;
    }
    if (argument === "--max-errors") {
      const value = Number.parseInt(argv[index + 1], 10);
      if (!Number.isInteger(value) || value < 0) {
        throw new Error("--max-errors requires a non-negative integer (0 means unlimited).");
      }
      options.maxErrors = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
};

const lineAndColumn = (source, offset) => {
  const before = source.slice(0, offset);
  const line = before.split(/\r?\n/).length;
  const lastLineBreak = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r"));
  return { line, column: offset - lastLineBreak };
};

const isAllowedNegative = (property, length) =>
  property.startsWith("margin") &&
  length.unit === "px" &&
  length.number === ALLOWED_NEGATIVE_A11Y_MARGIN;

const issueForLength = (property, length, tokens) => {
  if (length.inString || length.functions.includes("url") || length.functions.includes("var")) {
    return null;
  }
  if (length.number === 0) return null;
  if (length.number < 0) {
    if (isAllowedNegative(property, length)) return null;
    return {
      code: "negative-spacing",
      message:
        `${property} uses raw negative spacing ${length.literal}; express intentional overlap ` +
        "with calc(var(--space-*) * -1).",
    };
  }
  if (length.unit === "em") {
    return {
      code: "raw-font-relative-spacing",
      message:
        `${property} uses ${length.literal}; spacing must use a named --space-* token ` +
        "(font-relative em values are not part of the site scale).",
    };
  }

  const token = tokenForLength(length.number, length.unit, tokens);
  if (token) {
    return {
      code: "scale-bypass",
      message: `${property} uses ${length.literal}; replace it with var(${token.name}).`,
    };
  }

  const pixels = length.unit === "rem" ? length.number * 16 : length.number;
  const gridNote =
    Math.abs(pixels / 4 - Math.round(pixels / 4)) < 1e-8
      ? "It is on the 4px grid but has no named token in tokens.css."
      : "It is not on the 4px spacing grid.";
  return {
    code: "unnamed-spacing",
    message:
      `${property} uses raw spacing ${length.literal}. ${gridNote} ` +
      "Add a semantic --space-* token or choose an existing scale step.",
  };
};

const inspectCss = ({
  css,
  fragmentStart,
  filePath,
  fileSource,
  rootDir,
  tokens,
  issues,
}) => {
  for (const declaration of collectSpacingDeclarations(css)) {
    for (const length of rawSpacingLengths(declaration.value)) {
      const issue = issueForLength(declaration.property, length, tokens);
      if (!issue) continue;
      const absoluteOffset =
        fragmentStart + declaration.valueOffset + length.index;
      const location = lineAndColumn(fileSource, absoluteOffset);
      issues.push({
        ...issue,
        file: normalizeRelative(path.relative(rootDir, filePath)),
        line: location.line,
        column: location.column,
        literal: length.literal,
      });
    }
  }
};

const main = () => {
  const { rootDir, maxErrors } = parseArgs(process.argv.slice(2));
  const tokens = readSpacingScale(rootDir);
  const sources = discoverPublicStyleSources(rootDir);
  const issues = [];
  const tokenSource = fs.readFileSync(path.join(rootDir, "tokens.css"), "utf8");

  for (const token of tokens) {
    if (Math.abs(token.px / 4 - Math.round(token.px / 4)) < 1e-8) continue;
    const offset = tokenSource.search(
      new RegExp(`^\\s*${token.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`, "m"),
    );
    const location = lineAndColumn(tokenSource, Math.max(0, offset));
    issues.push({
      code: "off-grid-token",
      message: `${token.name} resolves to ${token.value} (${token.px}px), which is not on the 4px spacing grid.`,
      file: "tokens.css",
      line: location.line,
      column: location.column,
      literal: token.value,
    });
  }

  for (const filePath of sources) {
    const source = fs.readFileSync(filePath, "utf8");
    if (filePath.toLowerCase().endsWith(".html")) {
      for (const fragment of extractHtmlCssFragments(source)) {
        inspectCss({
          css: fragment.css,
          fragmentStart: fragment.startIndex,
          filePath,
          fileSource: source,
          rootDir,
          tokens,
          issues,
        });
      }
      continue;
    }
    inspectCss({
      css: source,
      fragmentStart: 0,
      filePath,
      fileSource: source,
      rootDir,
      tokens,
      issues,
    });
  }

  issues.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column ||
      left.code.localeCompare(right.code),
  );

  if (issues.length) {
    const counts = new Map();
    for (const issue of issues) counts.set(issue.code, (counts.get(issue.code) || 0) + 1);
    console.error(
      `Design spacing validation failed with ${issues.length} raw spacing value(s) across ${sources.length} public style sources.`,
    );
    console.error(
      "Allowed without a token: unitless zero; auto/intrinsic keywords; percentages; viewport/container units; env() safe-area values; var() fallbacks; and margin:-1px for visually-hidden content.",
    );
    console.error(
      `Categories: ${[...counts]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([code, count]) => `${code}=${count}`)
        .join(", ")}.`,
    );
    const visible = maxErrors === 0 ? issues : issues.slice(0, maxErrors);
    for (const issue of visible) {
      console.error(
        `- ${issue.file}:${issue.line}:${issue.column} [${issue.code}] ${issue.message}`,
      );
    }
    if (visible.length < issues.length) {
      console.error(
        `- ... ${issues.length - visible.length} more; rerun with --max-errors 0 for the complete list.`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Design spacing validation passed across ${sources.length} public style sources: padding, margin, gap, inset, and positional offsets use the named --space-* scale.`,
  );
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
