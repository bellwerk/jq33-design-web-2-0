import fs from "node:fs";
import path from "node:path";

const argumentValue = (name, fallback = "") => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const fail = (message) => {
  console.error(`Cloudflare deployment resolution failed: ${message}`);
  process.exit(1);
};
const appendOutput = (name, value) => {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, "utf8");
};

const expectedCommit = argumentValue(
  "--commit",
  process.env.EXPECTED_SOURCE_COMMIT || "",
).toLowerCase();
const expectedBranch = argumentValue(
  "--branch",
  process.env.EXPECTED_DEPLOYMENT_BRANCH || "",
);
const expectedEnvironment = argumentValue(
  "--environment",
  process.env.EXPECTED_DEPLOYMENT_ENVIRONMENT || "",
);
const expectedUrl = argumentValue(
  "--expected-url",
  process.env.EXPECTED_DEPLOYMENT_URL || "",
);
const fixturePath = argumentValue("--fixture", "");
const outputPath = path.resolve(
  argumentValue("--output", "cloudflare-deployment.json"),
);
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const projectName = process.env.CLOUDFLARE_PAGES_PROJECT || "";
const token = process.env.CLOUDFLARE_API_TOKEN || "";

if (!/^[a-f0-9]{40}$/.test(expectedCommit)) {
  fail("--commit must be a full lowercase commit SHA.");
}
if (!expectedBranch) fail("--branch is required.");
if (!["preview", "production"].includes(expectedEnvironment)) {
  fail("--environment must be preview or production.");
}
let normalizedExpectedUrl = "";
if (expectedUrl) {
  try {
    const parsed = new URL(expectedUrl);
    if (parsed.protocol !== "https:" || parsed.pathname !== "/") {
      fail("--expected-url must be an HTTPS origin.");
    }
    normalizedExpectedUrl = parsed.origin;
  } catch {
    fail("--expected-url must be a valid URL.");
  }
}

let responseBody;
if (fixturePath) {
  responseBody = JSON.parse(fs.readFileSync(path.resolve(fixturePath), "utf8"));
} else {
  if (!accountId || !projectName || !token) {
    fail("Cloudflare account, project, and API token variables are required.");
  }
  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}` +
    `/pages/projects/${encodeURIComponent(projectName)}/deployments?page=1&per_page=100`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "jq33-production-readiness/1.0",
    },
  });
  if (!response.ok) fail(`Cloudflare API returned ${response.status}.`);
  responseBody = await response.json();
}
if (responseBody.success !== true || !Array.isArray(responseBody.result)) {
  fail("Cloudflare response is not a successful deployments result.");
}

const candidates = responseBody.result.filter((entry) => {
  const metadata = entry?.deployment_trigger?.metadata || {};
  const url = (() => {
    try {
      return new URL(entry.url).origin;
    } catch {
      return "";
    }
  })();
  return (
    String(metadata.commit_hash || "").toLowerCase() === expectedCommit &&
    metadata.branch === expectedBranch &&
    entry.environment === expectedEnvironment &&
    (!normalizedExpectedUrl || url === normalizedExpectedUrl)
  );
});
if (candidates.length !== 1) {
  fail(
    `expected exactly one matching deployment, found ${candidates.length}.`,
  );
}
const deployment = candidates[0];
if (
  typeof deployment.id !== "string" ||
  deployment.id.length < 8 ||
  typeof deployment.url !== "string"
) {
  fail("matching deployment lacks an id or URL.");
}
const terminalStage = deployment.latest_stage;
if (
  !terminalStage ||
  typeof terminalStage !== "object" ||
  terminalStage.name !== "deploy" ||
  terminalStage.status !== "success" ||
  typeof terminalStage.ended_on !== "string" ||
  !Number.isFinite(Date.parse(terminalStage.ended_on))
) {
  fail(
    "matching deployment has not reached a terminal successful deploy stage with ended_on.",
  );
}
const deploymentUrl = new URL(deployment.url).origin;
const report = {
  schemaVersion: 1,
  resolvedAt: new Date().toISOString(),
  result: "PASS",
  deploymentId: deployment.id,
  url: deploymentUrl,
  environment: deployment.environment,
  projectName: deployment.project_name || projectName || null,
  source: {
    commit: expectedCommit,
    branch: expectedBranch,
  },
  createdOn: deployment.created_on || null,
  latestStage: {
    name: terminalStage.name,
    status: terminalStage.status,
    endedOn: terminalStage.ended_on,
  },
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
appendOutput("deployment_id", report.deploymentId);
appendOutput("deployment_url", report.url);
console.log(
  `Resolved Cloudflare ${expectedEnvironment} deployment ${report.deploymentId}: ${report.url}`,
);
