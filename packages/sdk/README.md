# @worldfork/sdk

TypeScript SDK for WorldFork Core API. It ships with OpenAPI-derived types and a lightweight fetch client.

## Install

```bash
npm install @worldfork/sdk
```

## Usage (full loop example)

```ts
import { createClient } from "@worldfork/sdk";

const client = createClient({
  baseUrl: "http://localhost:3000",
  apiKey: process.env.WF_API_KEY
});

const world = await client.createWorld({
  name: "Demo World",
  description: "SDK walkthrough"
});

const branch = await client.createBranch(world.id, {
  name: "feature/quests",
  sourceBranch: "main"
});

const unit = await client.upsertUnit(world.id, {
  branchName: "main",
  unit: {
    type: "character",
    title: "Captain Vela",
    fields: { role: "Explorer", level: 4 }
  }
});

const mainBranch = await client.listBranches(world.id, { name: "main" });
const mainHead = mainBranch.items[0]?.headCommitId ?? null;

await client.commit(world.id, {
  branchName: "main",
  message: "Add Captain Vela",
  expectedHeadCommitId: mainHead
});

await client.upsertUnit(world.id, {
  branchName: branch.name,
  unit: {
    id: unit.id,
    type: "character",
    title: "Captain Vela (Alt)",
    fields: { role: "Navigator", level: 4 }
  }
});

await client.commit(world.id, {
  branchName: branch.name,
  message: "Alternate storyline"
});

const diff = await client.diff(world.id, {
  from: "branch:main",
  to: `branch:${branch.name}`
});

console.log("Diff:", diff);

const preview = await client.mergePreview(world.id, {
  oursBranch: "main",
  theirsBranch: branch.name
});

console.log("Merge preview:", preview);

const refreshedMain = await client.listBranches(world.id, { name: "main" });
const refreshedHead = refreshedMain.items[0]?.headCommitId ?? null;

const merge = await client.mergeApply(world.id, {
  oursBranch: "main",
  theirsBranch: branch.name,
  expectedHeadCommitId: refreshedHead,
  resolutions: (preview.conflicts ?? []).map((conflict) => ({
    unitId: conflict.unitId,
    path: conflict.path,
    choice: "ours"
  }))
});

console.log("Merge commit:", merge.mergeCommitId);
```

## Conflict payload details

- `conflicts[].path` uses standard JSON Pointer encoding (RFC 6901). Tokens escape `~` as `~0` and `/` as `~1`.
- `conflicts[].unit` provides a small summary `{ id, type, title }` for UI display.
- `conflicts[].refContext` exposes `{ baseCommitId, oursCommitId, theirsCommitId }` for traceability.
- `conflicts[].pathTokens` (optional) is the decoded token array for the `path`.

## OpenAPI type generation

```bash
npm run gen
```

## Build

```bash
npm run build
```

## Smoke test

The smoke test expects a running WorldFork Core server:

```bash
WORLDFORK_BASE_URL=http://localhost:3000 WF_API_KEY=wf_live_xxx npm run smoke
```
