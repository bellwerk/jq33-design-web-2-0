import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import {
  repositoryRoot,
  resolveDistRoot,
} from "./helpers/site.mjs";

const distRoot = resolveDistRoot();
const cliValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
};
const port = Number(cliValue("--port") || process.env.PORT || 4173);
const host = cliValue("--host") || process.env.HOST || "127.0.0.1";
const parentPid = Number(cliValue("--parent-pid") || 0);

if (!fs.existsSync(distRoot)) {
  console.error(`Static preview cannot start because dist is missing: ${distRoot}`);
  process.exit(1);
}

const redirectRules = fs
  .readFileSync(path.join(distRoot, "_redirects"), "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => line.split(/\s+/))
  .filter(([source]) => source?.startsWith("/") && !source.includes("*"));

const globalHeaders = {};
const headersPath = path.join(distRoot, "_headers");
if (fs.existsSync(headersPath)) {
  let inGlobalBlock = false;
  for (const line of fs.readFileSync(headersPath, "utf8").split(/\r?\n/)) {
    if (line && !/^\s/.test(line)) {
      inGlobalBlock = line.trim() === "/*";
      continue;
    }
    if (!inGlobalBlock) continue;
    const match = /^\s+([^:]+):\s*(.+)$/.exec(line);
    if (match && !match[2].includes("{{")) globalHeaders[match[1]] = match[2];
  }
}

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};
const compressibleExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".svg",
  ".txt",
  ".xml",
]);

const server = http.createServer((request, response) => {
  const parsed = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }

  if (pathname === "/__jq33-playwright-shutdown__") {
    const remoteAddress = request.socket.remoteAddress || "";
    const isLoopback =
      remoteAddress === "127.0.0.1" ||
      remoteAddress === "::1" ||
      remoteAddress === "::ffff:127.0.0.1";
    if (request.method !== "POST" || !isLoopback) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    response.writeHead(204, { Connection: "close" }).end();
    const stopAfterFlush = setTimeout(() => shutdown(), 25);
    stopAfterFlush.unref();
    return;
  }

  const redirect = redirectRules.find(([source]) => source === pathname);
  if (redirect) {
    response.writeHead(Number(redirect[2] || 301), { Location: redirect[1] }).end();
    return;
  }

  const relative = pathname.replace(/^\/+/, "");
  const hostControlRequest = ["_headers", "_redirects"].includes(relative);
  const candidates =
    hostControlRequest
      ? []
      : pathname === "/"
      ? ["index.html"]
      : pathname.endsWith("/")
        ? [path.join(relative, "index.html")]
        : [relative, path.join(relative, "index.html")];
  let target = candidates
    .map((candidate) => path.resolve(distRoot, candidate))
    .find(
      (candidate) =>
        (candidate === distRoot || candidate.startsWith(`${distRoot}${path.sep}`)) &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile(),
    );
  let status = 200;
  if (!target) {
    target = path.join(distRoot, "404.html");
    status = 404;
  }

  const contentType = mime[path.extname(target).toLowerCase()] || "application/octet-stream";
  const extension = path.extname(target).toLowerCase();
  const responseHeaders = {
    ...globalHeaders,
    "Content-Type": contentType,
  };
  let body;
  if (compressibleExtensions.has(extension)) {
    const source = fs.readFileSync(target);
    const acceptedEncodings = request.headers["accept-encoding"] || "";
    responseHeaders.Vary = "Accept-Encoding";
    if (/\bbr\b/.test(acceptedEncodings)) {
      body = brotliCompressSync(source);
      responseHeaders["Content-Encoding"] = "br";
    } else if (/\bgzip\b/.test(acceptedEncodings)) {
      body = gzipSync(source);
      responseHeaders["Content-Encoding"] = "gzip";
    } else {
      body = source;
    }
    responseHeaders["Content-Length"] = String(body.length);
  }
  response.writeHead(status, responseHeaders);
  if (request.method === "HEAD") response.end();
  else if (body) response.end(body);
  else fs.createReadStream(target).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Serving ${path.relative(repositoryRoot, distRoot)} at http://${host}:${port}`);
});

let isShuttingDown = false;
let parentWatch;
const shutdown = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  clearInterval(parentWatch);
  server.closeAllConnections?.();
  server.close(() => process.exit(0));
  const hardExit = setTimeout(() => process.exit(0), 1_000);
  hardExit.unref();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("disconnect", shutdown);

if (Number.isInteger(parentPid) && parentPid > 0 && parentPid !== process.pid) {
  parentWatch = setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch (error) {
      if (error?.code === "ESRCH") shutdown();
    }
  }, 1_000);
  parentWatch.unref();
}
