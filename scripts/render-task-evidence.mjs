import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TASK_ID, TASK_ROOT, isSha256, sha256 } from "./ci-proof-utils.mjs";

export const EVIDENCE_MARKDOWN_PATH = `${TASK_ROOT}/evidence.md`;
export const PROBLEMS_PATH = `${TASK_ROOT}/problems.md`;
export const RESOLVED_PROBLEMS_TEXT = `# Problems

Status: RESOLVED

No unresolved blocker remains in the current sealed evidence scope. Any new
FAIL, PARTIAL, UNKNOWN, BLOCKED, PENDING, or unverified result must replace this
file before another release action is attempted.
`;

const fail = (message) => {
  throw new Error(message);
};

const escapeCell = (value) =>
  String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");

const referenceList = (references) =>
  [...(Array.isArray(references) ? references : [])]
    .map((reference) => `${reference.path} @ ${reference.sha256}`)
    .sort((left, right) => left.localeCompare(right))
    .join("<br>");

const criterionNumber = (id) => Number(String(id).replace(/^AC/, ""));

const identityRows = (evidence) => {
  const rows = [
    ["Task", evidence.taskId],
    ["Scope", evidence.scope],
    ["Generated", evidence.generatedAt],
    ["Candidate run", evidence.candidateRunId],
    ["Source commit", evidence.source?.commit],
    ["Source tree", evidence.source?.sourceTreeSha256],
    ["Artifact", evidence.artifact?.sha256],
  ];
  if (evidence.scope === "pre-promotion") {
    rows.push(
      ["Preview", evidence.preview?.url],
      ["Preview deployment", evidence.preview?.deploymentId],
    );
  } else if (evidence.scope === "post-production-finalization") {
    rows.push(
      ["Production run", evidence.productionRunId],
      ["Production", evidence.production?.url],
      ["Production deployment", evidence.production?.deploymentId],
      ["Production parity", evidence.production?.parityAttestationSha256],
    );
  }
  return rows;
};

export const renderEvidenceMarkdown = (
  evidence,
  { sourcePath, sourceSha256 },
) => {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    fail("evidence must be an object.");
  }
  if (evidence.taskId !== TASK_ID) fail(`evidence taskId must be ${TASK_ID}.`);
  if (
    !["pre-promotion", "post-production-finalization"].includes(evidence.scope)
  ) {
    fail("evidence scope is not renderable.");
  }
  if (!isSha256(sourceSha256)) {
    fail("sourceSha256 must be a lowercase SHA-256.");
  }
  if (!Array.isArray(evidence.criteria) || evidence.criteria.length !== 13) {
    fail("evidence must contain exactly 13 criteria.");
  }
  const title =
    evidence.scope === "pre-promotion"
      ? "JQ33 pre-promotion evidence"
      : "JQ33 production finalization evidence";
  const lines = [
    `# ${title}`,
    "",
    "> Generated deterministically from the sealed structured evidence. Do not edit by hand.",
    "",
    `- Structured source: \`${sourcePath}\``,
    `- Structured source SHA-256: \`${sourceSha256}\``,
    "",
    "## Identity",
    "",
    "| Field | Value |",
    "| --- | --- |",
    ...identityRows(evidence).map(
      ([label, value]) => `| ${escapeCell(label)} | ${escapeCell(value)} |`,
    ),
    "",
    "## Verifier",
    "",
    `- Verdict: **${escapeCell(evidence.verifier?.verdict)}**`,
    `- Verified: ${escapeCell(evidence.verifier?.verifiedAt)}`,
    `- Proof: ${referenceList(evidence.verifier?.evidence)}`,
    "",
    "## Acceptance criteria",
    "",
    "| Criterion | Status | Scope | Hashed evidence |",
    "| --- | --- | --- | --- |",
    ...[...evidence.criteria]
      .sort((left, right) => criterionNumber(left.id) - criterionNumber(right.id))
      .map(
        (entry) =>
          `| ${escapeCell(entry.id)} | ${escapeCell(entry.status)} | ${escapeCell(entry.scope)} | ${referenceList(entry.evidence)} |`,
      ),
  ];
  if (evidence.scope === "pre-promotion") {
    if (
      !Array.isArray(evidence.externalGates) ||
      evidence.externalGates.length !== 13
    ) {
      fail("pre-promotion evidence must contain exactly 13 external gates.");
    }
    lines.push(
      "",
      "## External and manual gates",
      "",
      "| Gate | Status | Hashed evidence |",
      "| --- | --- | --- |",
      ...[...evidence.externalGates]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(
          (entry) =>
            `| ${escapeCell(entry.id)} | ${escapeCell(entry.status)} | ${referenceList(entry.evidence)} |`,
        ),
    );
  }
  lines.push(
    "",
    "## Blocker state",
    "",
    "`problems.md` must exactly contain the generated RESOLVED sentinel for this",
    "evidence to authorize the corresponding release action.",
    "",
  );
  return `${lines.join("\n")}\n`;
};

const replaceFile = (filePath, bytes) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const pendingPath = `${filePath}.pending-${process.pid}-${Date.now()}`;
  fs.writeFileSync(pendingPath, bytes, "utf8");
  if (!fs.existsSync(filePath)) {
    fs.renameSync(pendingPath, filePath);
    return;
  }
  const backupPath = `${filePath}.backup-${process.pid}-${Date.now()}`;
  fs.renameSync(filePath, backupPath);
  try {
    fs.renameSync(pendingPath, filePath);
    fs.rmSync(backupPath, { force: true });
  } catch (error) {
    fs.rmSync(pendingPath, { force: true });
    if (!fs.existsSync(filePath) && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, filePath);
    }
    throw error;
  }
};

export const commitFileBundle = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    fail("file bundle must contain at least one staged output.");
  }
  const token = `${process.pid}-${Date.now()}`;
  const prepared = entries.map(({ pendingPath, outputPath }, index) => {
    const pending = path.resolve(pendingPath);
    const output = path.resolve(outputPath);
    if (!fs.existsSync(pending) || !fs.statSync(pending).isFile()) {
      fail(`file bundle staged output ${index + 1} does not exist.`);
    }
    return {
      pending,
      output,
      backup: `${output}.bundle-backup-${token}-${index}`,
      hadOutput: fs.existsSync(output),
      committed: false,
    };
  });
  if (new Set(prepared.map((entry) => entry.output)).size !== prepared.length) {
    fail("file bundle output paths must be unique.");
  }
  try {
    for (const entry of prepared) {
      fs.mkdirSync(path.dirname(entry.output), { recursive: true });
      if (entry.hadOutput) fs.renameSync(entry.output, entry.backup);
    }
    for (const entry of prepared) {
      fs.renameSync(entry.pending, entry.output);
      entry.committed = true;
    }
  } catch (error) {
    for (const entry of [...prepared].reverse()) {
      if (entry.committed) fs.rmSync(entry.output, { force: true });
      if (entry.hadOutput && fs.existsSync(entry.backup)) {
        fs.renameSync(entry.backup, entry.output);
      }
    }
    throw error;
  }
  for (const entry of prepared) fs.rmSync(entry.backup, { force: true });
};

export const writeEvidenceCompanions = ({
  evidence,
  evidencePath,
  evidenceSha256,
  markdownPath,
  problemsPath,
}) => {
  const markdown = renderEvidenceMarkdown(evidence, {
    sourcePath: evidencePath,
    sourceSha256: evidenceSha256,
  });
  replaceFile(markdownPath, markdown);
  replaceFile(problemsPath, RESOLVED_PROBLEMS_TEXT);
  return { markdown, problems: RESOLVED_PROBLEMS_TEXT };
};

export const checkEvidenceCompanions = ({
  evidence,
  evidencePath,
  evidenceSha256,
  markdownPath,
  problemsPath,
}) => {
  const expectedMarkdown = renderEvidenceMarkdown(evidence, {
    sourcePath: evidencePath,
    sourceSha256: evidenceSha256,
  });
  if (!fs.existsSync(markdownPath)) fail(`missing generated ${EVIDENCE_MARKDOWN_PATH}.`);
  if (fs.readFileSync(markdownPath, "utf8") !== expectedMarkdown) {
    fail(`${EVIDENCE_MARKDOWN_PATH} is stale or was edited by hand.`);
  }
  if (!fs.existsSync(problemsPath)) fail(`missing generated ${PROBLEMS_PATH}.`);
  if (fs.readFileSync(problemsPath, "utf8") !== RESOLVED_PROBLEMS_TEXT) {
    fail(`${PROBLEMS_PATH} contains unresolved or non-canonical blocker text.`);
  }
};

const argumentValue = (name, fallback = "") => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};

const runSelfTest = () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jq33-evidence-render-"));
  try {
    const evidencePath = `${TASK_ROOT}/final-evidence.json`;
    const evidence = {
      taskId: TASK_ID,
      scope: "post-production-finalization",
      generatedAt: "2026-08-04T12:00:00.000Z",
      candidateRunId: "123",
      productionRunId: "456",
      source: { commit: "1".repeat(40), sourceTreeSha256: "2".repeat(64) },
      artifact: { sha256: "3".repeat(64) },
      production: {
        url: "https://jq33.design",
        deploymentId: "deployment-123",
        parityAttestationSha256: "4".repeat(64),
      },
      verifier: { verdict: "PASS", verifiedAt: "2026-08-04T12:00:00.000Z", evidence: [] },
      criteria: Array.from({ length: 13 }, (_, index) => ({
        id: `AC${index + 1}`,
        status: "PASS",
        scope: "complete",
        evidence: [],
      })),
    };
    const bytes = `${JSON.stringify(evidence, null, 2)}\n`;
    const markdownPath = path.join(temporaryRoot, "evidence.md");
    const problemsPath = path.join(temporaryRoot, "problems.md");
    writeEvidenceCompanions({
      evidence,
      evidencePath,
      evidenceSha256: sha256(bytes),
      markdownPath,
      problemsPath,
    });
    checkEvidenceCompanions({
      evidence,
      evidencePath,
      evidenceSha256: sha256(bytes),
      markdownPath,
      problemsPath,
    });
    fs.appendFileSync(markdownPath, "manual edit\n", "utf8");
    assert.throws(
      () =>
        checkEvidenceCompanions({
          evidence,
          evidencePath,
          evidenceSha256: sha256(bytes),
          markdownPath,
          problemsPath,
        }),
      /stale or was edited/,
    );

    const bundleOld = path.join(temporaryRoot, "bundle-old.txt");
    const bundlePending = path.join(temporaryRoot, "bundle-pending.txt");
    const blockedParent = path.join(temporaryRoot, "blocked-parent");
    const secondPending = path.join(temporaryRoot, "second-pending.txt");
    fs.writeFileSync(bundleOld, "old", "utf8");
    fs.writeFileSync(bundlePending, "new", "utf8");
    fs.writeFileSync(blockedParent, "not-a-directory", "utf8");
    fs.writeFileSync(secondPending, "second", "utf8");
    assert.throws(
      () =>
        commitFileBundle([
          { pendingPath: bundlePending, outputPath: bundleOld },
          {
            pendingPath: secondPending,
            outputPath: path.join(blockedParent, "cannot-write.txt"),
          },
        ]),
      /EEXIST|ENOTDIR/,
    );
    assert.equal(fs.readFileSync(bundleOld, "utf8"), "old");
    console.log(
      "Deterministic task-evidence renderer self-test passed, including bundle rollback.",
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
};

const main = () => {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }
  const repoRoot = process.cwd();
  const evidencePath = path.resolve(
    repoRoot,
    argumentValue("--evidence", `${TASK_ROOT}/evidence.json`),
  );
  const markdownPath = path.resolve(
    repoRoot,
    argumentValue("--output", EVIDENCE_MARKDOWN_PATH),
  );
  const problemsPath = path.resolve(
    repoRoot,
    argumentValue("--problems", PROBLEMS_PATH),
  );
  if (!fs.existsSync(evidencePath)) fail(`evidence file does not exist: ${evidencePath}`);
  const bytes = fs.readFileSync(evidencePath);
  let evidence;
  try {
    evidence = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`evidence is not valid JSON: ${error.message}`);
  }
  const evidenceRelative = path
    .relative(repoRoot, evidencePath)
    .split(path.sep)
    .join("/");
  const options = {
    evidence,
    evidencePath: evidenceRelative,
    evidenceSha256: sha256(bytes),
    markdownPath,
    problemsPath,
  };
  if (process.argv.includes("--check")) {
    checkEvidenceCompanions(options);
    console.log("Task evidence summary and blocker sentinel are current.");
  } else {
    writeEvidenceCompanions(options);
    console.log("Task evidence summary and resolved blocker sentinel rendered.");
  }
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(`Task evidence rendering failed: ${error.message}`);
    process.exitCode = 1;
  }
}
