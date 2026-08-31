import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { currentBrowserEvidenceBinding } from "../tests/helpers/evidence.mjs";
import { repositoryRoot } from "../tests/helpers/site.mjs";

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
};

const root = path.resolve(argumentValue("--root") || "");
const canary = argumentValue("--canary");
const canaryKey = "JQ33_PLAYWRIGHT_METADATA_CANARY";
const failures = [];

if (!argumentValue("--root") || !fs.existsSync(root)) {
  failures.push(`Playwright artifact root does not exist: ${root}`);
}
if (!canary) failures.push("Metadata hygiene canary is required");

const reporterPath = path.join(root, "results.json");
let reporter;
if (!fs.existsSync(reporterPath)) {
  failures.push(`Playwright JSON reporter output is missing: ${reporterPath}`);
} else {
  try {
    reporter = JSON.parse(fs.readFileSync(reporterPath, "utf8"));
  } catch (error) {
    failures.push(`Playwright JSON reporter output is invalid: ${error.message}`);
  }
}

if (reporter?.config) {
  const environmentMetadata = [];
  const visit = (value, pointer = "config") => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${pointer}[${index}]`));
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      const nextPointer = `${pointer}.${key}`;
      if (/^(?:env|environment)$/i.test(key)) environmentMetadata.push(nextPointer);
      visit(entry, nextPointer);
    }
  };
  visit(reporter.config);
  if (environmentMetadata.length) {
    failures.push(
      `Reporter config contains serialized environment metadata: ${environmentMetadata.join(", ")}`,
    );
  }

  if (reporter.config.failOnFlakyTests !== true) {
    failures.push("Reporter config does not prove failOnFlakyTests=true");
  }

  let currentBinding;
  try {
    currentBinding = currentBrowserEvidenceBinding();
  } catch (error) {
    failures.push(`Unable to recompute current browser evidence binding: ${error.message}`);
  }
  if (currentBinding) {
    for (const [key, expected] of Object.entries(currentBinding)) {
      if (reporter.config.metadata?.[key] !== expected) {
        failures.push(
          `Reporter binding ${key} does not match current source/artifact state`,
        );
      }
    }
  }
}

const reportedTests = [];
const reportedSpecs = [];
const collectSuites = (suites = []) => {
  for (const suite of suites) {
    for (const spec of suite.specs || []) {
      reportedSpecs.push(spec);
      for (const reportedTest of spec.tests || []) {
        reportedTests.push({ spec, test: reportedTest });
      }
    }
    collectSuites(suite.suites || []);
  }
};
collectSuites(reporter?.suites);

if (!reporter?.stats || reportedTests.length === 0) {
  failures.push("Reporter outcome is incomplete: no finalized tests/stats were recorded");
} else {
  for (const field of ["skipped", "unexpected", "flaky"]) {
    if (reporter.stats[field] !== 0) {
      failures.push(`Reporter outcome includes ${reporter.stats[field]} ${field} test(s)`);
    }
  }
  if (reporter.stats.expected !== reportedTests.length) {
    failures.push(
      `Reporter expected count ${reporter.stats.expected} does not equal ${reportedTests.length} finalized test record(s)`,
    );
  }
  if (!Number.isFinite(reporter.stats.duration) || reporter.stats.duration <= 0) {
    failures.push("Reporter outcome has no positive finalized duration");
  }
}
if ((reporter?.errors || []).length) {
  failures.push(`Reporter contains ${reporter.errors.length} top-level error(s)`);
}
for (const spec of reportedSpecs) {
  if (spec.ok !== true) failures.push(`Spec did not finalize successfully: ${spec.title}`);
}
for (const { spec, test: reportedTest } of reportedTests) {
  const label = `${spec.file}:${spec.line} ${spec.title}`;
  if (reportedTest.expectedStatus !== "passed" || reportedTest.status !== "expected") {
    failures.push(`Skipped, unexpected, or incomplete test outcome: ${label}`);
  }
  if (reportedTest.results?.length !== 1) {
    failures.push(`Test retried or did not produce exactly one final result: ${label}`);
    continue;
  }
  const [result] = reportedTest.results;
  if (result.status !== "passed" || result.retry !== 0 || result.errors?.length) {
    failures.push(`Test result is failed, flaky, retried, or incomplete: ${label}`);
  }
}

const reporterExtensions = new Set([".html", ".json", ".txt", ".xml"]);
const reporterArtifacts = [];
if (fs.existsSync(root)) {
  const queue = [root];
  while (queue.length) {
    const directory = queue.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      else if (entry.isFile() && reporterExtensions.has(path.extname(entry.name).toLowerCase())) {
        reporterArtifacts.push(fullPath);
      }
    }
  }
}

for (const filePath of reporterArtifacts) {
  const source = fs.readFileSync(filePath, "utf8");
  if (source.includes(canary) || source.includes(canaryKey)) {
    failures.push(
      `Process-environment canary leaked into ${path.relative(root, filePath)}`,
    );
  }
}

const replacementRoots = [
  [repositoryRoot, "<REPOSITORY_ROOT>"],
  [root, "<PLAYWRIGHT_ARTIFACT_ROOT>"],
  [os.homedir(), "<USER_HOME>"],
  [os.tmpdir(), "<TEMP_DIR>"],
  [process.execPath, "<NODE_EXECUTABLE>"],
  [process.env.LOCALAPPDATA, "<LOCAL_APP_DATA>"],
  [process.env.APPDATA, "<APP_DATA>"],
  [process.env.ProgramFiles, "<PROGRAM_FILES>"],
  [process.env["ProgramFiles(x86)"], "<PROGRAM_FILES_X86>"],
  [process.env.ProgramData, "<PROGRAM_DATA>"],
  [process.env.SystemRoot, "<SYSTEM_ROOT>"],
]
  .filter(([value]) => typeof value === "string" && value.length > 2)
  .sort(([left], [right]) => right.length - left.length);
const username = process.env.USERNAME || process.env.USER || "";
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const replaceEveryCase = (source, needle, replacement) =>
  source.replace(new RegExp(escapePattern(needle), "gi"), replacement);

const sanitizeString = (source) => {
  let sanitized = source;
  for (const [machinePath, token] of replacementRoots) {
    sanitized = replaceEveryCase(sanitized, machinePath, token);
    sanitized = replaceEveryCase(sanitized, machinePath.replaceAll("\\", "/"), token);
  }
  if (username) sanitized = replaceEveryCase(sanitized, username, "<USER>");
  return sanitized;
};

const sanitizeValue = (value) => {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry)]),
  );
};

const sanitizedReporter = reporter ? sanitizeValue(reporter) : null;
const sanitizedPath = path.join(root, "results.sanitized.json");
if (sanitizedReporter) {
  fs.writeFileSync(sanitizedPath, `${JSON.stringify(sanitizedReporter, null, 2)}\n`);
  const residualMachineStrings = [];
  const inspectSanitized = (value, pointer = "report") => {
    if (typeof value === "string") {
      const hasDrivePath = /(?:^|[\s('"=])(?:[A-Za-z]:[\\/]|file:\/\/\/[A-Za-z]:)/.test(
        value,
      );
      const hasUncPath = /(?:^|[\s('"=])\\\\[^\\\s]+\\/.test(value);
      const hasUsername = username && value.toLowerCase().includes(username.toLowerCase());
      if (hasDrivePath || hasUncPath || hasUsername) residualMachineStrings.push(pointer);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => inspectSanitized(entry, `${pointer}[${index}]`));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      inspectSanitized(entry, `${pointer}.${key}`);
    }
  };
  inspectSanitized(JSON.parse(fs.readFileSync(sanitizedPath, "utf8")));
  if (residualMachineStrings.length) {
    failures.push(
      `Sanitized reporter still contains username or absolute machine paths at: ${residualMachineStrings.slice(0, 10).join(", ")}`,
    );
  }
}

if (failures.length) {
  console.error("Playwright reporter metadata hygiene failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Playwright reporter evidence passed (${reportedTests.length} expected, non-flaky test(s); portable copy ${path.basename(sanitizedPath)}; no serialized environment, canary, username, or absolute machine paths).`,
);
