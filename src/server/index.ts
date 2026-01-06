import Fastify from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { createWorld, getWorld } from "../repo/worldRepo.js";
import { createBranch, getBranch, updateBranchHead } from "../repo/branchRepo.js";
import { createCommit, findCommonAncestor } from "../repo/commitRepo.js";
import { getBranchUnitStates, getCommitUnitSnapshots, upsertUnitState } from "../repo/unitRepo.js";
import { diffUnits } from "../core/diff.js";
import { mergeUnits } from "../core/merge.js";
import { prisma } from "../repo/prisma.js";
import { UnitContent } from "../core/types.js";

const app = Fastify({ logger: true });

const errorResponse = (code: string, message: string, details?: unknown) => ({
  error: {
    code,
    message,
    details
  }
});

const parseRef = (value: string | undefined) => {
  if (!value) {
    return null;
  }
  const [type, id] = value.split(":");
  if (!type || !id) {
    return null;
  }
  if (type !== "branch" && type !== "commit") {
    return null;
  }
  return { type, id } as { type: "branch" | "commit"; id: string };
};

const loadUnitsByRef = async (worldId: string, ref: { type: "branch" | "commit"; id: string }) => {
  if (ref.type === "branch") {
    const branch = await getBranch(worldId, ref.id);
    if (!branch) {
      throw errorResponse("NOT_FOUND", "Branch not found");
    }
    return getBranchUnitStates(branch.id);
  }
  return getCommitUnitSnapshots(ref.id);
};

const setValueAtPath = (target: Record<string, unknown>, path: string, value: unknown) => {
  if (path === "") {
    return value as Record<string, unknown>;
  }
  const parts = path.replace(/^\//, "").split("/");
  let current: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (current[key] === undefined || typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value as unknown;
  return target;
};

const getValueAtPath = (target: Record<string, unknown> | undefined, path: string) => {
  if (!target) {
    return undefined;
  }
  if (path === "") {
    return target;
  }
  const parts = path.replace(/^\//, "").split("/");
  let current: unknown = target;
  for (const part of parts) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

app.post("/v1/worlds", async (request, reply) => {
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().optional()
  });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request", parsed.error.format()));
  }

  const world = await createWorld(parsed.data.name, parsed.data.description);
  return reply.status(201).send(world);
});

app.post("/v1/worlds/:worldId/branches", async (request, reply) => {
  const schema = z.object({
    name: z.string().min(1),
    sourceBranch: z.string().optional(),
    sourceCommitId: z.string().optional()
  });
  const paramsSchema = z.object({ worldId: z.string().min(1) });
  const params = paramsSchema.safeParse(request.params);
  const parsed = schema.safeParse(request.body);
  if (!params.success || !parsed.success) {
    return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
  }
  if (parsed.data.sourceBranch && parsed.data.sourceCommitId) {
    return reply
      .status(400)
      .send(errorResponse("INVALID_INPUT", "Provide either sourceBranch or sourceCommitId"));
  }

  const world = await getWorld(params.data.worldId);
  if (!world) {
    return reply.status(404).send(errorResponse("NOT_FOUND", "World not found"));
  }

  let sourceCommitId: string | null | undefined = null;
  if (parsed.data.sourceCommitId) {
    sourceCommitId = parsed.data.sourceCommitId;
  } else {
    const sourceBranchName = parsed.data.sourceBranch ?? "main";
    const sourceBranch = await getBranch(world.id, sourceBranchName);
    if (!sourceBranch) {
      return reply.status(404).send(errorResponse("NOT_FOUND", "Source branch not found"));
    }
    sourceCommitId = sourceBranch.headCommitId ?? null;
  }

  const branch = await createBranch(world.id, parsed.data.name, sourceCommitId);
  return reply.status(201).send(branch);
});

app.post("/v1/worlds/:worldId/units", async (request, reply) => {
  const schema = z.object({
    branchName: z.string().min(1),
    unit: z.object({
      id: z.string().optional(),
      type: z.string().min(1),
      title: z.string().min(1),
      fields: z.record(z.unknown()),
      refs: z.record(z.unknown()).optional()
    })
  });
  const paramsSchema = z.object({ worldId: z.string().min(1) });
  const params = paramsSchema.safeParse(request.params);
  const parsed = schema.safeParse(request.body);
  if (!params.success || !parsed.success) {
    return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
  }

  const world = await getWorld(params.data.worldId);
  if (!world) {
    return reply.status(404).send(errorResponse("NOT_FOUND", "World not found"));
  }

  const branch = await getBranch(world.id, parsed.data.branchName);
  if (!branch) {
    return reply.status(404).send(errorResponse("NOT_FOUND", "Branch not found"));
  }

  const unit: UnitContent = {
    ...parsed.data.unit,
    id: parsed.data.unit.id ?? nanoid()
  };

  await upsertUnitState(world.id, branch.id, unit);
  return reply.status(201).send(unit);
});

app.post("/v1/worlds/:worldId/commits", async (request, reply) => {
  const schema = z.object({
    branchName: z.string().min(1),
    message: z.string().min(1)
  });
  const paramsSchema = z.object({ worldId: z.string().min(1) });
  const params = paramsSchema.safeParse(request.params);
  const parsed = schema.safeParse(request.body);
  if (!params.success || !parsed.success) {
    return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
  }

  const world = await getWorld(params.data.worldId);
  if (!world) {
    return reply.status(404).send(errorResponse("NOT_FOUND", "World not found"));
  }

  const branch = await getBranch(world.id, parsed.data.branchName);
  if (!branch) {
    return reply.status(404).send(errorResponse("NOT_FOUND", "Branch not found"));
  }

  const commit = await createCommit(world.id, parsed.data.message, branch.headCommitId ?? null);
  const states = await prisma.unitState.findMany({ where: { branchId: branch.id } });

  if (states.length > 0) {
    await prisma.unitSnapshot.createMany({
      data: states.map((state) => ({
        id: nanoid(),
        commitId: commit.id,
        unitId: state.unitId,
        contentJson: state.contentJson
      }))
    });
  }

  await updateBranchHead(branch.id, commit.id);
  return reply.status(201).send(commit);
});

app.get("/v1/worlds/:worldId/diff", async (request, reply) => {
  const querySchema = z.object({ from: z.string(), to: z.string() });
  const paramsSchema = z.object({ worldId: z.string().min(1) });
  const params = paramsSchema.safeParse(request.params);
  const parsed = querySchema.safeParse(request.query);
  if (!params.success || !parsed.success) {
    return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
  }

  const fromRef = parseRef(parsed.data.from);
  const toRef = parseRef(parsed.data.to);
  if (!fromRef || !toRef) {
    return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid diff refs"));
  }

  try {
    const fromUnits = await loadUnitsByRef(params.data.worldId, fromRef);
    const toUnits = await loadUnitsByRef(params.data.worldId, toRef);
    const changes = diffUnits(fromUnits, toUnits);
    return reply.send({ changes });
  } catch (error) {
    return reply.status(404).send(error);
  }
});

app.post("/v1/worlds/:worldId/merge", async (request, reply) => {
  const schema = z.object({
    oursBranch: z.string().min(1),
    theirsBranch: z.string().min(1),
    resolutions: z
      .array(
        z.object({
          unitId: z.string().min(1),
          path: z.string(),
          choice: z.enum(["ours", "theirs", "manual"]),
          value: z.unknown().optional()
        })
      )
      .optional()
  });
  const paramsSchema = z.object({ worldId: z.string().min(1) });
  const params = paramsSchema.safeParse(request.params);
  const parsed = schema.safeParse(request.body);
  if (!params.success || !parsed.success) {
    return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
  }

  const world = await getWorld(params.data.worldId);
  if (!world) {
    return reply.status(404).send(errorResponse("NOT_FOUND", "World not found"));
  }

  const oursBranch = await getBranch(world.id, parsed.data.oursBranch);
  const theirsBranch = await getBranch(world.id, parsed.data.theirsBranch);
  if (!oursBranch || !theirsBranch) {
    return reply.status(404).send(errorResponse("NOT_FOUND", "Branch not found"));
  }

  const baseCommitId = await findCommonAncestor(oursBranch.headCommitId, theirsBranch.headCommitId);
  const baseUnits = baseCommitId ? await getCommitUnitSnapshots(baseCommitId) : {};
  const oursUnits = oursBranch.headCommitId
    ? await getCommitUnitSnapshots(oursBranch.headCommitId)
    : {};
  const theirsUnits = theirsBranch.headCommitId
    ? await getCommitUnitSnapshots(theirsBranch.headCommitId)
    : {};

  const mergeResult = mergeUnits(baseUnits, oursUnits, theirsUnits);

  if (mergeResult.conflicts.length > 0 && !parsed.data.resolutions) {
    return reply.send({ conflicts: mergeResult.conflicts, previewMergedUnits: mergeResult.mergedUnits });
  }

  let resolvedUnits = { ...mergeResult.mergedUnits };
  if (parsed.data.resolutions) {
    for (const resolution of parsed.data.resolutions) {
      const currentUnit = resolvedUnits[resolution.unitId] ?? ({} as UnitContent);
      const sourceUnit =
        resolution.choice === "ours"
          ? (oursUnits[resolution.unitId] as Record<string, unknown> | undefined)
          : resolution.choice === "theirs"
            ? (theirsUnits[resolution.unitId] as Record<string, unknown> | undefined)
            : (currentUnit as Record<string, unknown>);

      const resolvedValue =
        resolution.choice === "manual" ? resolution.value : getValueAtPath(sourceUnit, resolution.path);

      if (resolution.path === "") {
        resolvedUnits[resolution.unitId] = resolvedValue as UnitContent;
      } else {
        const updated = setValueAtPath({ ...(currentUnit as Record<string, unknown>) }, resolution.path, resolvedValue);
        resolvedUnits[resolution.unitId] = updated as UnitContent;
      }
    }
  }

  const mergeCommit = await createCommit(
    world.id,
    `Merge ${oursBranch.name} <- ${theirsBranch.name}`,
    oursBranch.headCommitId ?? null,
    theirsBranch.headCommitId ?? null
  );

  const snapshotData = Object.values(resolvedUnits).map((unit) => ({
    id: nanoid(),
    commitId: mergeCommit.id,
    unitId: unit.id,
    contentJson: unit
  }));

  if (snapshotData.length > 0) {
    await prisma.unitSnapshot.createMany({ data: snapshotData });
  }

  for (const unit of Object.values(resolvedUnits)) {
    await upsertUnitState(world.id, oursBranch.id, unit);
  }

  await updateBranchHead(oursBranch.id, mergeCommit.id);

  return reply.status(201).send({ mergeCommitId: mergeCommit.id });
});

const start = async () => {
  try {
    await app.listen({ port: 3000, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
