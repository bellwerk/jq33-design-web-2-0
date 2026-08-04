import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { repositoryRoot } from "./site.mjs";

const sha256Pattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;

function browserHarnessFiles() {
  const files = [
    path.join(repositoryRoot, "playwright.config.mjs"),
    path.join(repositoryRoot, "scripts", "check-responsive.mjs"),
    path.join(repositoryRoot, "scripts", "check-playwright-metadata.mjs"),
  ];
  const testsRoot = path.join(repositoryRoot, "tests");
  const queue = [testsRoot];
  while (queue.length) {
    const directory = queue.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      else if (entry.isFile() && entry.name.endsWith(".mjs")) files.push(fullPath);
    }
  }
  return [...new Set(files)].sort((left, right) => left.localeCompare(right));
}

export function currentSourceCommit() {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (!commitPattern.test(revision)) {
    throw new Error(`Unable to bind browser proof to a full source commit: ${revision}`);
  }
  return revision;
}

export function currentArtifactBinding() {
  const manifestPath = path.join(repositoryRoot, "dist-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Browser proof requires the checked artifact manifest: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.root !== "dist" || !sha256Pattern.test(manifest.artifactSha256 || "")) {
    throw new Error("dist-manifest.json does not contain a valid dist artifact hash");
  }
  if (!commitPattern.test(manifest.sourceRevision || "")) {
    throw new Error("dist-manifest.json does not contain a valid source revision");
  }
  return {
    artifactSha256: manifest.artifactSha256,
    artifactSourceRevision: manifest.sourceRevision,
  };
}

export function currentBrowserHarnessSha256() {
  const hash = crypto.createHash("sha256");
  for (const filePath of browserHarnessFiles()) {
    const relativePath = path.relative(repositoryRoot, filePath).replaceAll("\\", "/");
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function currentBrowserEvidenceBinding() {
  const sourceCommit = currentSourceCommit();
  const artifact = currentArtifactBinding();
  if (artifact.artifactSourceRevision !== sourceCommit) {
    throw new Error(
      `Artifact source revision ${artifact.artifactSourceRevision} does not match current source commit ${sourceCommit}`,
    );
  }
  return {
    sourceCommit,
    ...artifact,
    browserHarnessSha256: currentBrowserHarnessSha256(),
  };
}
