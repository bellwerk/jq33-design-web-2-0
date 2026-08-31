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
const redirectsPath = path.join(artifactRoot, "_redirects");
const failures = [];

if (!fs.existsSync(redirectsPath)) {
  console.error(`Missing _redirects in ${artifactRoot}.`);
  process.exit(1);
}

const rules = fs
  .readFileSync(redirectsPath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line, index) => {
    const parts = line.split(/\s+/);
    if (parts.length !== 3) {
      failures.push(`Line ${index + 1} must contain source, target, and status.`);
    }
    const [from = "", to = "", status = ""] = parts;
    return { from, to, status, line: index + 1 };
  });

const duplicateSources = new Set();
const seenSources = new Set();
for (const rule of rules) {
  if (seenSources.has(rule.from)) duplicateSources.add(rule.from);
  seenSources.add(rule.from);
  if (rule.status !== "301") failures.push(`${rule.from} must be a permanent 301 redirect.`);
  if (rule.from === rule.to) failures.push(`${rule.from} redirects to itself.`);
  if (/^\/projects\/(?:\*|:)/.test(rule.from)) {
    failures.push(`${rule.from} is a forbidden dynamic project fallback.`);
  }
  if (rule.status === "200") failures.push(`${rule.from} is a forbidden rewrite.`);
}
for (const source of duplicateSources) failures.push(`Duplicate redirect source: ${source}`);

const requiredRules = new Map([
  ["/home-page", "/"],
  ["/home-page/", "/"],
  ["/home-page.html", "/"],
]);
for (const [from, to] of requiredRules) {
  const matches = rules.filter((rule) => rule.from === from && rule.to === to && rule.status === "301");
  if (matches.length !== 1) failures.push(`Expected exactly one canonical redirect: ${from} ${to} 301`);
}

const localRules = new Map(
  rules.filter((rule) => rule.from.startsWith("/")).map((rule) => [rule.from, rule.to]),
);
for (const rule of rules) {
  if (!rule.from.startsWith("/") || !rule.to.startsWith("/")) continue;
  if (localRules.has(rule.to)) {
    failures.push(`${rule.from} forms a redirect chain through ${rule.to}.`);
  }

  const visited = new Set();
  let current = rule.from;
  while (localRules.has(current)) {
    if (visited.has(current)) {
      failures.push(`${rule.from} participates in a redirect loop.`);
      break;
    }
    visited.add(current);
    current = localRules.get(current);
  }
}

if (fs.existsSync(path.join(artifactRoot, "functions"))) {
  failures.push("The deployable artifact may not contain a Pages Functions directory.");
}
if (fs.existsSync(path.join(artifactRoot, "projects", "project.html"))) {
  failures.push("The deployable artifact may not contain the dynamic project shell.");
}

if (failures.length) {
  console.error("Redirect safety checks failed:");
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Redirect safety checks passed for ${rules.length} one-hop 301 rules.`);
