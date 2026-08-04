import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  defaultRawRoot,
  repositoryRoot,
} from "../tests/helpers/site.mjs";

const cli = path.join(
  repositoryRoot,
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);
const metadataCanary = `jq33-metadata-${crypto.randomBytes(24).toString("hex")}`;

if (!fs.existsSync(cli)) {
  console.error(
    "@playwright/test is required. Install the pinned devDependency before running responsive checks.",
  );
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  [
    cli,
    "test",
    "tests/responsive.spec.mjs",
    "tests/hallmark-responsive-continuum.spec.mjs",
    "tests/accessibility.spec.mjs",
    "tests/interactions.spec.mjs",
    "tests/forms.spec.mjs",
    "tests/browser-contract.spec.mjs",
    "tests/calendly-contract.spec.mjs",
    "tests/runtime-audit.spec.mjs",
    "tests/native-forms.spec.mjs",
    "tests/keyboard-navigation.spec.mjs",
    "tests/media-layout.spec.mjs",
    ...process.argv.slice(2),
  ],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      JQ33_PLAYWRIGHT_METADATA_CANARY: metadataCanary,
    },
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(`Unable to launch Playwright: ${result.error.message}`);
  process.exit(2);
}

const outputRoot = path.resolve(
  process.env.PLAYWRIGHT_ARTIFACT_DIR || path.join(defaultRawRoot, "playwright"),
);
const metadataResult = spawnSync(
  process.execPath,
  [
    path.join(repositoryRoot, "scripts", "check-playwright-metadata.mjs"),
    "--root",
    outputRoot,
    "--canary",
    metadataCanary,
  ],
  {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  },
);
if (metadataResult.error) {
  console.error(`Unable to audit Playwright reporter metadata: ${metadataResult.error.message}`);
  process.exit(2);
}

const testStatus = Number.isInteger(result.status) ? result.status : 1;
const metadataStatus = Number.isInteger(metadataResult.status)
  ? metadataResult.status
  : 1;
process.exit(testStatus !== 0 ? testStatus : metadataStatus);
