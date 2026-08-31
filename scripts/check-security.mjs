import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  htmlDocuments,
  reportFailures,
  repositoryRoot,
  requireDirectory,
  resolveDistRoot,
  walkFiles,
} from "../tests/helpers/site.mjs";

const distRoot = resolveDistRoot();
const failures = [];

const textExtensions = new Set([
  "",
  ".css",
  ".cjs",
  ".example",
  ".html",
  ".js",
  ".json",
  ".log",
  ".md",
  ".mjs",
  ".sql",
  ".svg",
  ".toml",
  ".txt",
  ".ts",
  ".tsx",
  ".xml",
  ".yaml",
  ".yml",
]);

const parseHeaderBlocks = (source) => {
  const blocks = [];
  let current = null;
  for (const line of source.split(/\r?\n/)) {
    if (line.trim() && !/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: new Map() };
      blocks.push(current);
      continue;
    }
    const match = /^\s+([^:]+):\s*(.+)$/.exec(line);
    if (current && match) current.headers.set(match[1].toLowerCase(), match[2].trim());
  }
  return blocks;
};

try {
  requireDirectory(distRoot, "Distribution directory");
  const distFiles = walkFiles(distRoot);
  const textFiles = distFiles.filter((file) => textExtensions.has(path.extname(file).toLowerCase()));

  const prohibitedDistPatterns = [
    { pattern: /{{[^{}\r\n]+}}|__(?:SUPABASE|FORM|CALENDLY|SOCIAL|PUBLIC|RUNTIME)[A-Z0-9_]*__/, label: "unresolved build/config token" },
    { pattern: /\bsupabase\b|supabase\.co|createClient\s*\(/i, label: "dead Supabase integration" },
    { pattern: /googletagmanager|google-analytics|googleanalytics|gtag\s*\(/i, label: "Google Analytics integration" },
    { pattern: /\b(?:UA-\d{4,}-\d+|G-[A-Z0-9]{8,12})\b/, label: "Google Analytics measurement identifier" },
    { pattern: /\/(?:admin|functions|supabase)(?:\/|["'?#])|portfolio-admin|lead-intake|admin-portfolio-upload/i, label: "dead admin/backend URL" },
    { pattern: /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::\d+)?/i, label: "local development URL" },
    { pattern: /https?:\/\/(?:www\.)?(?:example\.(?:com|org|net)|placeholder\.[A-Za-z]+|[^/\s]+\.invalid)\b/i, label: "placeholder/dead URL" },
    { pattern: /sourceMappingURL\s*=|sourcesContent|"sources"\s*:\s*\[/i, label: "source-map content/reference" },
    { pattern: /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|SUPABASE_SERVICE_ROLE_KEY/i, label: "secret material" },
    { pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/, label: "GitHub token" },
    { pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/, label: "JWT-like credential" },
  ];

  for (const file of textFiles) {
    const relative = path.relative(distRoot, file).split(path.sep).join("/");
    const source = fs.readFileSync(file, "utf8");
    for (const { pattern, label } of prohibitedDistPatterns) {
      if (pattern.test(source)) failures.push(`${relative} contains ${label}.`);
    }
  }
  for (const file of distFiles) {
    const relative = path.relative(distRoot, file).split(path.sep).join("/");
    if (/\.map$/i.test(relative)) failures.push(`${relative} is a forbidden source map.`);
    if (/^\.env(?:\.|$)/i.test(path.basename(relative))) {
      failures.push(`${relative} is a forbidden environment file.`);
    }
  }

  let repositorySourceFiles = [];
  try {
    repositorySourceFiles = execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      {
      cwd: repositoryRoot,
      encoding: "utf8",
      },
    )
      .split("\0")
      .filter(Boolean)
      .filter(
        (relative) =>
          !/^(?:\.agent|\.git|\.hallmark|\.playwright-mcp|dist|node_modules|test-results)(?:\/|\\)/i.test(
            relative,
          ),
      );
  } catch (error) {
    failures.push(`Unable to enumerate repository source files for secret scanning: ${error.message}`);
  }
  const trackedSecretPatterns = [
    /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,
    /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/,
    /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/,
    /\bCF_API_TOKEN\s*=\s*["']?[A-Za-z0-9_-]{20,}/i,
    /\bSUPABASE_SERVICE_ROLE_KEY\s*=\s*["']?(?!your|example|placeholder)[A-Za-z0-9._-]{20,}/i,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
    /https:\/\/[a-z0-9]{12,}\.supabase\.co\b/i,
    /\bqa\+[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i,
  ];
  for (const relative of repositorySourceFiles) {
    const file = path.join(repositoryRoot, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
    const stat = fs.statSync(file);
    if (stat.size > 2_000_000) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const pattern of trackedSecretPatterns) {
      if (pattern.test(source)) {
        failures.push(`Repository source file ${relative} contains secret-like material.`);
      }
    }
  }

  const retiredAnalyticsPath = path.join(repositoryRoot, "assets", "js", "analytics.js");
  if (fs.existsSync(retiredAnalyticsPath)) {
    const retiredAnalytics = fs.readFileSync(retiredAnalyticsPath, "utf8");
    if (
      new RegExp(["google", "tagmanager"].join(""), "i").test(retiredAnalytics) ||
      new RegExp(["google", "-analytics"].join(""), "i").test(retiredAnalytics) ||
      /\bgtag\s*\(/i.test(retiredAnalytics)
    ) {
      failures.push("Retired assets/js/analytics.js still contains a non-Cloudflare analytics runtime.");
    }
  }

  const headersPath = path.join(distRoot, "_headers");
  if (!fs.existsSync(headersPath)) {
    failures.push("dist/_headers is missing.");
  } else {
    const source = fs.readFileSync(headersPath, "utf8");
    const global = parseHeaderBlocks(source).find((block) => block.pattern === "/*");
    if (!global) {
      failures.push("_headers lacks a global /* header block.");
    } else {
      const csp = global.headers.get("content-security-policy") || "";
      const directives = new Map(
        csp
          .split(";")
          .map((part) => part.trim().split(/\s+/))
          .filter((parts) => parts[0])
          .map(([name, ...values]) => [name.toLowerCase(), values]),
      );
      for (const directive of [
        "default-src",
        "base-uri",
        "object-src",
        "frame-ancestors",
        "form-action",
        "script-src",
        "style-src",
        "connect-src",
        "img-src",
        "font-src",
      ]) {
        if (!directives.has(directive)) failures.push(`CSP is missing ${directive}.`);
      }
      if (/'unsafe-inline'|'unsafe-eval'/i.test(csp)) {
        failures.push("CSP contains unsafe-inline or unsafe-eval.");
      }
      for (const [directive, expected] of [
        ["base-uri", "'none'"],
        ["object-src", "'none'"],
        ["frame-ancestors", "'none'"],
      ]) {
        if (!directives.get(directive)?.includes(expected)) {
          failures.push(`CSP ${directive} must be ${expected}.`);
        }
      }
      if (!directives.get("default-src")?.includes("'self'")) {
        failures.push("CSP default-src must include self.");
      }
      if (/\*/.test(csp)) failures.push("CSP may not contain wildcard sources.");
      if (/{{|}}/.test(csp)) failures.push("Built CSP contains unresolved tokens.");

      const hsts = global.headers.get("strict-transport-security") || "";
      const maxAge = Number(/max-age=(\d+)/i.exec(hsts)?.[1] || 0);
      if (maxAge < 31_536_000 || !/\bincludeSubDomains\b/i.test(hsts)) {
        failures.push("HSTS must cover at least one year and include subdomains.");
      }
      if (/\bpreload\b/i.test(hsts)) failures.push("HSTS must not request preload.");
      if (global.headers.get("x-content-type-options")?.toLowerCase() !== "nosniff") {
        failures.push("X-Content-Type-Options must be nosniff.");
      }
      if (global.headers.get("x-frame-options")?.toUpperCase() !== "DENY") {
        failures.push("X-Frame-Options must be DENY.");
      }
      if (
        !/^(?:no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin)$/i.test(
          global.headers.get("referrer-policy") || "",
        )
      ) {
        failures.push("Referrer-Policy is missing or insufficiently restrictive.");
      }
      const permissions = global.headers.get("permissions-policy") || "";
      for (const capability of [
        "camera=()",
        "geolocation=()",
        "microphone=()",
        "payment=()",
      ]) {
        if (!permissions.includes(capability)) {
          failures.push(`Permissions-Policy must deny ${capability.slice(0, -3)}.`);
        }
      }
    }
  }

  const privacy = htmlDocuments(distRoot).find((document) => document.route === "/privacy/")?.html || "";
  if (!/(?:up to|maximum of|no longer than)\s+12\s+months?/i.test(privacy)) {
    failures.push("Privacy disclosure must state a maximum 12-month lead retention period.");
  }
  if (!/(?:delet|erasure|remove).{0,100}(?:request|contact)|(?:request|contact).{0,100}(?:delet|erasure|remove)/is.test(privacy)) {
    failures.push("Privacy disclosure must explain the deletion-request process.");
  }
} catch (error) {
  failures.push(error.message);
}

reportFailures("Security and privacy static validation", failures, "Security and privacy static validation passed.");
