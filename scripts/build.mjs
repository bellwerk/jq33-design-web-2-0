import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const run = (args) => {
  const result = spawnSync("node", args, {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run(["scripts/generate-projects.mjs"]);
run(["scripts/generate-journal.mjs"]);
run(["scripts/generate-sitemap.mjs"]);
run(["scripts/generate-runtime-config.mjs"]);

console.log("Build completed.");
