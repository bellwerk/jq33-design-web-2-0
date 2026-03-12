import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const walk = (dir, files = []) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["assets", "supabase"].includes(entry.name)) continue;
      walk(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(fullPath);
    }
  }
  return files;
};

const imgRegex = /<img\b[^>]*>/gi;
const altRegex = /\balt\s*=\s*["']([^"']*)["']/i;

const htmlFiles = walk(rootDir);
const missing = [];

for (const filePath of htmlFiles) {
  const content = fs.readFileSync(filePath, "utf8");
  let match;
  while ((match = imgRegex.exec(content)) !== null) {
    const tag = match[0];
    const altMatch = tag.match(altRegex);
    if (!altMatch) {
      missing.push({ filePath, tag });
      continue;
    }
    const altText = altMatch[1].trim();
    if (!altText) {
      missing.push({ filePath, tag });
    }
  }
}

if (missing.length) {
  console.error("Images missing alt text:");
  for (const item of missing) {
    const rel = path.relative(rootDir, item.filePath);
    console.error(`- ${rel}: ${item.tag}`);
  }
  process.exitCode = 1;
} else {
  console.log("All images include alt text.");
}
