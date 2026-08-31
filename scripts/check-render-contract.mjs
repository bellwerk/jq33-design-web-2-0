import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const failures = [];

const publicSamples = [
  { route: "/", file: "index.html", expectFooter: true },
  { route: "/projects/", file: "projects/index.html", expectFooter: true },
  {
    route: "/projects/vortex-showroom/",
    file: "projects/vortex-showroom/index.html",
    expectFooter: true,
    projectDetail: true
  },
  { route: "/journal/", file: "journal/index.html", expectFooter: true },
  {
    route: "/journal/reduction-as-creation/",
    file: "journal/reduction-as-creation/index.html",
    expectFooter: true
  },
  { route: "/inquiry/", file: "inquiry/index.html", expectFooter: true },
  { route: "/contact/", file: "contact/index.html", expectFooter: true },
  { route: "/privacy/", file: "privacy/index.html", expectFooter: true },
  { route: "/404.html", file: "404.html", expectFooter: true },
  {
    route: "/commercial-interior-design-montreal/",
    file: "commercial-interior-design-montreal/index.html",
    expectFooter: true
  },
  { route: "/admin/portfolio/", file: "admin/portfolio/index.html", expectFooter: false }
];

const read = (relativePath) =>
  fs.readFileSync(path.join(rootDir, relativePath), "utf8");

const stripTags = (value) =>
  value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const getTags = (html, tagName) =>
  [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "gi"))].map(
    (match) => match[0]
  );

const getAttr = (tag, name) => {
  const doubleQuoted = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
  if (doubleQuoted) return doubleQuoted[1];
  const singleQuoted = new RegExp(`${name}\\s*=\\s*'([^']*)'`, "i").exec(tag);
  return singleQuoted ? singleQuoted[1] : "";
};

const visibleH1 = (h1Tag) => {
  const className = getAttr(h1Tag, "class");
  return !/\b(sr-only|visually-hidden)\b/.test(className);
};

const siteCss = read("assets/css/site.css");
if (/body,\s*body \*\s*\{[\s\S]*?color:\s*var\(--cobalt-base\)\s*!important/i.test(siteCss)) {
  failures.push("assets/css/site.css still contains the broad body/body-* cobalt !important color override.");
}

for (const token of ["--text-primary", "--text-secondary", "--text-tertiary", "--text-accent"]) {
  if (!siteCss.includes(token)) {
    failures.push(`assets/css/site.css is missing scoped color token ${token}.`);
  }
}

for (const sample of publicSamples) {
  const html = read(sample.file);
  const h1s = getTags(html, "h1");
  if (h1s.length !== 1) {
    failures.push(`${sample.file} should have exactly one h1; found ${h1s.length}.`);
  } else if (!visibleH1(h1s[0])) {
    failures.push(`${sample.file} h1 is hidden with sr-only/visually-hidden.`);
  } else if (!stripTags(h1s[0])) {
    failures.push(`${sample.file} h1 is empty.`);
  }

  if (!/data-component=["']header-nav["']/.test(html)) {
    failures.push(`${sample.file} is missing shared header mount.`);
  }
  if (!/assets\/js\/components\/header-nav\.js/.test(html)) {
    failures.push(`${sample.file} is missing shared header script.`);
  }
  if (sample.expectFooter && !/data-component=["']footer["']/.test(html)) {
    failures.push(`${sample.file} is missing shared footer mount.`);
  }
  if (sample.expectFooter && !/assets\/js\/components\/footer\.js/.test(html)) {
    failures.push(`${sample.file} is missing shared footer script.`);
  }
  if (sample.projectDetail) {
    if (!/<body[^>]*class=["'][^"']*project-detail-page/.test(html)) {
      failures.push(`${sample.file} is missing project-detail-page body class.`);
    }
    if (/<style\b/i.test(html)) {
      failures.push(`${sample.file} should use shared project detail CSS instead of inline style blocks.`);
    }
  }
}

const projectTemplate = read("projects/_project-template.html");
if (/<style\b/i.test(projectTemplate)) {
  failures.push("projects/_project-template.html still contains an inline style block.");
}
if (!/<body[^>]*class=["'][^"']*project-detail-page/.test(projectTemplate)) {
  failures.push("projects/_project-template.html is missing project-detail-page body class.");
}

if (failures.length) {
  console.error("Render/component contract check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Render/component contracts passed.");
}
