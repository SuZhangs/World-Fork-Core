import { execSync } from "node:child_process";

const run = (command) => execSync(command, { encoding: "utf8" }).trim();

const resolveBaseRef = () => {
  if (process.env.GITHUB_BASE_REF) {
    return `origin/${process.env.GITHUB_BASE_REF}`;
  }
  if (process.env.GITHUB_REF_NAME) {
    return "origin/main";
  }
  return "origin/main";
};

const refExists = (ref) => {
  try {
    run(`git rev-parse --verify ${ref}`);
    return true;
  } catch {
    return false;
  }
};

const baseRef = resolveBaseRef();
const compareRef = refExists(baseRef) ? `${baseRef}...HEAD` : "HEAD~1...HEAD";

let diffOutput = "";
try {
  diffOutput = run(`git diff --name-only ${compareRef}`);
} catch {
  diffOutput = "";
}

const changedFiles = diffOutput ? diffOutput.split("\n").filter(Boolean) : [];

const triggerPrefixes = [
  "src/core/",
  "src/repo/",
  "src/server/",
  "prisma/migrations/",
  "packages/sdk/",
  ".github/workflows/"
];

const triggerExact = ["prisma/schema.prisma", "openapi/openapi.json"];

const roadmapTriggerPrefixes = ["src/server/", "packages/sdk/"];
const roadmapTriggerExact = ["openapi/openapi.json"];

const isTriggered = (file) =>
  triggerExact.includes(file) || triggerPrefixes.some((prefix) => file.startsWith(prefix));

const isRoadmapTriggered = (file) =>
  roadmapTriggerExact.includes(file) || roadmapTriggerPrefixes.some((prefix) => file.startsWith(prefix));

const requiresAudit = changedFiles.some(isTriggered);
const requiresRoadmap = changedFiles.some(isRoadmapTriggered);

const hasLatestAudit = changedFiles.includes("docs/audit/LATEST.md");
const hasRoadmap = changedFiles.includes("docs/roadmap.md");

const errors = [];

if (requiresAudit && !hasLatestAudit) {
  errors.push(
    "Core/Contract changed but docs/audit/LATEST.md not updated. Please update audit & roadmap."
  );
}

if (requiresRoadmap && !hasRoadmap) {
  errors.push(
    "Core/Contract changed but docs/audit/LATEST.md not updated. Please update audit & roadmap."
  );
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
