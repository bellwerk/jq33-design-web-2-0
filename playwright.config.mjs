import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { currentBrowserEvidenceBinding } from "./tests/helpers/evidence.mjs";
import { defaultRawRoot } from "./tests/helpers/site.mjs";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173";
const outputRoot = path.resolve(
  process.env.PLAYWRIGHT_ARTIFACT_DIR || path.join(defaultRawRoot, "playwright"),
);
fs.mkdirSync(outputRoot, { recursive: true });

const parsedBase = new URL(baseURL);
const needsLocalServer = ["127.0.0.1", "localhost"].includes(parsedBase.hostname);
const usesExternallyManagedServer =
  process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1" ||
  process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";
const localServerPort =
  parsedBase.port || (parsedBase.protocol === "https:" ? "443" : "80");
const proofBinding = currentBrowserEvidenceBinding();

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.mjs",
  outputDir: path.join(outputRoot, "results"),
  fullyParallel: true,
  failOnFlakyTests: true,
  forbidOnly: true,
  globalTeardown: "./tests/global-teardown.mjs",
  metadata: proofBinding,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(outputRoot, "results.json") }],
    ["html", { outputFolder: path.join(outputRoot, "report"), open: "never" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: needsLocalServer && !usesExternallyManagedServer
    ? {
        command: `node tests/serve-dist.mjs --host ${parsedBase.hostname} --port ${localServerPort} --parent-pid ${process.pid}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 15_000,
      }
    : undefined,
});
