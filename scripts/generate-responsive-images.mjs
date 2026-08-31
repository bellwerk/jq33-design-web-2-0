import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const outputRootIndex = process.argv.indexOf("--output-root");
if (outputRootIndex === -1 || !process.argv[outputRootIndex + 1]) {
  throw new Error("generate-responsive-images.mjs requires --output-root <directory>.");
}

const outputRoot = path.resolve(process.argv[outputRootIndex + 1]);
if (
  outputRoot !== path.join(rootDir, "dist") ||
  path.dirname(outputRoot) !== rootDir ||
  path.basename(outputRoot) !== "dist"
) {
  throw new Error(`Refusing to write responsive images outside the clean dist tree: ${outputRoot}`);
}
if (!fs.existsSync(outputRoot) || !fs.statSync(outputRoot).isDirectory()) {
  throw new Error(`Responsive-image output root does not exist: ${outputRoot}`);
}

const generatedDirectory = path.join(outputRoot, "assets", "generated", "images");
fs.mkdirSync(generatedDirectory, { recursive: true });

const sources = [
  {
    source: "assets/home page images/commercial hairsaloon interior.webp",
    prefix: "commercial-hairsaloon-interior",
    widths: [640, 960, 1280, 1536],
    quality: 74,
  },
  {
    source: "assets/home page images/footer reno.webp",
    prefix: "footer-reno",
    widths: [640, 960, 1280, 1536],
    quality: 80,
  },
  ...[
    ["customer-path", "the-customer-path"],
    ["durable-materials", "durable-premium-materials"],
    ["lighting-that-sells", "lighting-that-sells"],
    ["reduction-as-creation", "reduction-as-creation"],
    ["small-shop-big-impact", "small-shop-big-impact"],
    ["spend-where-it-shows", "spend-where-it-shows"],
  ].map(([sourceSlug, routeSlug]) => ({
    source: `assets/journal/cards/${sourceSlug}.webp`,
    prefix: `journal-${routeSlug}`,
    widths: [640, 768, 960, 1280],
    quality: 76,
  })),
  ...[
    "bruton-place-iv",
    "ethereal-gallery",
    "obsidian-lounge",
    "vortex-showroom",
    "canvas-studios",
  ].map((slug) => ({
    source: `assets/projects/${slug}/index-study-20260823.webp`,
    prefix: `project-${slug}-index-study`,
    widths: [480, 768],
    quality: 76,
  })),
];

const generated = [];
for (const definition of sources) {
  const sourcePath = path.join(rootDir, definition.source);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new Error(`Responsive-image source is missing: ${definition.source}`);
  }
  const sourceMetadata = await sharp(sourcePath).metadata();
  if (!sourceMetadata.width || !sourceMetadata.height) {
    throw new Error(`Unable to determine image dimensions: ${definition.source}`);
  }

  for (const requestedWidth of definition.widths) {
    const targetWidth = Math.min(requestedWidth, sourceMetadata.width);
    const targetName = `${definition.prefix}-${targetWidth}.webp`;
    const targetPath = path.join(generatedDirectory, targetName);
    const outputInfo = await sharp(sourcePath)
      .toColourspace("srgb")
      .resize({
        width: targetWidth,
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: true,
      })
      .webp({
        quality: definition.quality,
        effort: 6,
        smartSubsample: true,
      })
      .toFile(targetPath);

    if (outputInfo.width !== targetWidth || outputInfo.format !== "webp") {
      throw new Error(
        `Responsive image has unexpected output metadata: ${targetName} (${outputInfo.width}px ${outputInfo.format})`,
      );
    }
    if (outputInfo.size >= fs.statSync(sourcePath).size) {
      throw new Error(`Responsive image is not smaller than its source: ${targetName}`);
    }
    generated.push({
      file: `assets/generated/images/${targetName}`,
      width: outputInfo.width,
      height: outputInfo.height,
      bytes: outputInfo.size,
    });
  }
}

console.log(
  `Generated ${generated.length} responsive WebP derivatives (${generated.reduce(
    (sum, image) => sum + image.bytes,
    0,
  )} bytes) in ${generatedDirectory}.`,
);
