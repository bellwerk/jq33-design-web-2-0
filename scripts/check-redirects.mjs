import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const redirectsPath = path.join(rootDir, "_redirects");

if (!fs.existsSync(redirectsPath)) {
  console.error("Missing _redirects file.");
  process.exit(1);
}

const lines = fs
  .readFileSync(redirectsPath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

const parsed = lines.map((line) => {
  const [from = "", to = "", status = ""] = line.split(/\s+/);
  return { from, to, status };
});

const projectsFallback = parsed.find(
  (entry) => entry.from === "/projects/*" && entry.to === "/projects/project.html"
);

if (!projectsFallback) {
  console.error(
    "Expected projects fallback route is missing: /projects/* /projects/project.html 200"
  );
  process.exit(1);
}

if (projectsFallback.status && projectsFallback.status !== "200") {
  console.error("Projects fallback should use status 200.");
  process.exit(1);
}

const fallbackTargetPath = path.join(
  rootDir,
  projectsFallback.to.replace(/^\/+/, "")
);

if (!fs.existsSync(fallbackTargetPath)) {
  console.error(`Fallback target is missing: ${projectsFallback.to}`);
  process.exit(1);
}

console.log("Redirect fallback checks passed.");
