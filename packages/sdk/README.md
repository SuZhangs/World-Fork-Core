# @worldfork/sdk

TypeScript SDK for WorldFork Core API. It ships with OpenAPI-derived types and a lightweight fetch client.

## Install

```bash
npm install @worldfork/sdk
```

## Usage (full loop example)

```ts
import { createClient } from "@worldfork/sdk";

const client = createClient({ baseUrl: "http://localhost:3000" });

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

await client.commit(world.id, {
  branchName: "main",
  message: "Add Captain Vela"
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

const merge = await client.mergeApply(world.id, {
  oursBranch: "main",
  theirsBranch: branch.name,
  resolutions: (preview.conflicts ?? []).map((conflict) => ({
    unitId: conflict.unitId,
    path: conflict.path,
    choice: "ours"
  }))
});

console.log("Merge commit:", merge.mergeCommitId);
```

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
WORLDFORK_BASE_URL=http://localhost:3000 npm run smoke
```
