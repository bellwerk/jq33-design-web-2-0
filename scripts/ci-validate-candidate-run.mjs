import fs from "node:fs";
import path from "node:path";
import { WORKFLOW_PATH } from "./ci-proof-utils.mjs";

const argumentValue = (name, fallback = "") => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const fail = (message) => {
  console.error(`Candidate workflow-run validation failed: ${message}`);
  process.exit(1);
};

const runId = String(
  argumentValue("--run-id", process.env.CANDIDATE_RUN_ID || ""),
);
const expectedCommit = argumentValue(
  "--commit",
  process.env.CANDIDATE_COMMIT_SHA || "",
).toLowerCase();
const repository = argumentValue(
  "--repository",
  process.env.GITHUB_REPOSITORY || "",
);
const token = process.env.GITHUB_TOKEN || "";
const fixturePath = argumentValue("--fixture", "");
const workflowFixturePath = argumentValue("--workflow-fixture", "");
const expectedWorkflowPath = argumentValue("--workflow-path", WORKFLOW_PATH);
const outputPath = path.resolve(
  argumentValue("--output", "candidate-run-validation.json"),
);

if (!/^[1-9]\d*$/.test(runId)) fail("--run-id must be a positive integer.");
if (!/^[a-f0-9]{40}$/.test(expectedCommit)) {
  fail("--commit must be a full lowercase commit SHA.");
}
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  fail("--repository must be owner/name.");
}

let run;
let workflow;
if (fixturePath) {
  run = JSON.parse(fs.readFileSync(path.resolve(fixturePath), "utf8"));
  if (!workflowFixturePath) {
    fail("--workflow-fixture is required with --fixture.");
  }
  workflow = JSON.parse(
    fs.readFileSync(path.resolve(workflowFixturePath), "utf8"),
  );
} else {
  if (!token) fail("GITHUB_TOKEN is required when no fixture is supplied.");
  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/runs/${runId}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "jq33-production-readiness/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) {
    fail(`GitHub Actions API returned ${response.status}.`);
  }
  run = await response.json();
  const workflowResponse = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(path.posix.basename(expectedWorkflowPath))}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "jq33-production-readiness/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!workflowResponse.ok) {
    fail(`GitHub workflow API returned ${workflowResponse.status}.`);
  }
  workflow = await workflowResponse.json();
}

const failures = [];
if (String(run.id) !== runId) failures.push("run id does not match.");
if (run.status !== "completed") failures.push("run is not completed.");
if (run.conclusion !== "success") failures.push("run conclusion is not success.");
if (String(run.head_sha || "").toLowerCase() !== expectedCommit) {
  failures.push("run head SHA does not match the candidate commit.");
}
if (run.head_branch !== "main") failures.push("run head branch is not main.");
if (!["push", "workflow_dispatch"].includes(run.event)) {
  failures.push("run event is not an approved main candidate event.");
}
if (run.name !== "Production readiness") {
  failures.push("run is not from the Production readiness workflow.");
}
if (run.repository?.full_name !== repository) {
  failures.push("run repository does not match.");
}
const runWorkflowPath = String(run.path || "").split("@")[0];
if (runWorkflowPath !== expectedWorkflowPath) {
  failures.push("run workflow path does not match the required workflow.");
}
if (!Number.isSafeInteger(Number(run.workflow_id)) || Number(run.workflow_id) <= 0) {
  failures.push("run lacks a valid workflow id.");
}
if (
  !workflow ||
  Number(workflow.id) !== Number(run.workflow_id) ||
  workflow.path !== expectedWorkflowPath ||
  workflow.name !== "Production readiness" ||
  workflow.state !== "active"
) {
  failures.push("run workflow id/path/name is not bound to the active repository workflow.");
}
if (failures.length) fail(failures.join(" "));

const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  result: "PASS",
  runId,
  workflowName: run.name,
  workflowId: Number(run.workflow_id),
  workflowPath: expectedWorkflowPath,
  event: run.event,
  source: {
    repository,
    branch: run.head_branch,
    commit: expectedCommit,
  },
  runUrl: run.html_url || null,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  `Candidate workflow-run validation passed: run ${runId}, commit ${expectedCommit}.`,
);
