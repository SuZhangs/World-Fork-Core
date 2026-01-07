import Fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { nanoid } from "nanoid";
import { createWorld, getWorld, getWorldWithBranches, listWorlds } from "../repo/worldRepo.js";
import { createBranch, getBranch, listBranches, updateBranchHead } from "../repo/branchRepo.js";
import { createCommit, findCommonAncestor, getCommit, listCommitsByBranchHead } from "../repo/commitRepo.js";
import {
  getBranchUnitStates,
  getCommitUnitSnapshots,
  getUnitByBranch,
  getUnitByCommit,
  listUnitsByBranch,
  listUnitsByCommit,
  upsertUnitState
} from "../repo/unitRepo.js";
import { diffUnits } from "../core/diff.js";
import { mergeUnits } from "../core/merge.js";
import { prisma } from "../repo/prisma.js";
import { UnitContent } from "../core/types.js";
import { errorResponse } from "./errors.js";
import { parseRef } from "./ref.js";

const app = Fastify({
  logger: true,
  ajv: {
    customOptions: {
      keywords: ["example"]
    }
  }
});

const toSchema = (schema: z.ZodTypeAny) => zodToJsonSchema(schema, { target: "openApi3" });
const withExample = <T extends Record<string, unknown>>(schema: T, example: unknown) => ({
  ...schema,
  example
});

const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
  })
});

const worldSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  createdAt: z.string().datetime()
});

const branchSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  name: z.string(),
  headCommitId: z.string().nullable().optional(),
  createdAt: z.string().datetime()
});

const unitSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  fields: z.record(z.unknown()),
  refs: z.record(z.unknown()).optional(),
  meta: z.record(z.unknown()).optional()
});

const branchSummarySchema = z.object({
  name: z.string(),
  headCommitId: z.string().nullable().optional(),
  updatedAt: z.string().datetime()
});

const commitSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  message: z.string(),
  parentCommitId: z.string().nullable().optional(),
  parentCommitId2: z.string().nullable().optional(),
  createdAt: z.string().datetime()
});

const worldListResponseSchema = z.object({
  worlds: z.array(worldSchema)
});

const worldDetailResponseSchema = worldSchema.extend({
  branches: z.array(branchSummarySchema)
});

const branchListResponseSchema = z.object({
  branches: z.array(branchSummarySchema)
});

const commitListResponseSchema = z.object({
  commits: z.array(commitSchema),
  nextCursor: z.string().nullable().optional()
});

const unitListResponseSchema = z.object({
  units: z.array(unitSchema)
});

const diffChangeSchema = z.object({
  unitId: z.string(),
  path: z.string(),
  from: z.unknown(),
  to: z.unknown()
});

const mergeConflictSchema = z.object({
  unitId: z.string(),
  path: z.string(),
  base: z.unknown(),
  ours: z.unknown(),
  theirs: z.unknown()
});

const diffResponseSchema = z.object({
  changes: z.array(diffChangeSchema)
});

const mergePreviewResponseSchema = z.object({
  conflicts: z.array(mergeConflictSchema),
  previewMergedUnits: z.record(unitSchema)
});

const mergeSuccessResponseSchema = z.object({
  mergeCommitId: z.string()
});

const createWorldBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional()
});

const createBranchBodySchema = z.object({
  name: z.string().min(1),
  sourceBranch: z.string().optional(),
  sourceCommitId: z.string().optional()
});

const createUnitBodySchema = z.object({
  branchName: z.string().min(1),
  unit: unitSchema.extend({
    id: z.string().optional()
  })
});

const createCommitBodySchema = z.object({
  branchName: z.string().min(1),
  message: z.string().min(1)
});

const diffQuerySchema = z.object({
  from: z.string(),
  to: z.string()
});

const branchListQuerySchema = z.object({
  name: z.string().optional()
});

const commitListQuerySchema = z.object({
  branchName: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional()
});

const unitListQuerySchema = z.object({
  ref: z.string().min(1),
  type: z.string().optional()
});

const unitDetailQuerySchema = z.object({
  ref: z.string().min(1)
});

const mergeBodySchema = z.object({
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

const worldParamsSchema = z.object({ worldId: z.string().min(1) });
const unitParamsSchema = z.object({ worldId: z.string().min(1), unitId: z.string().min(1) });

const examples = {
  world: {
    id: "world_123",
    name: "Eldoria",
    description: "Shared universe for lore",
    createdAt: "2024-01-01T00:00:00.000Z"
  },
  branch: {
    id: "branch_123",
    worldId: "world_123",
    name: "feature/quests",
    headCommitId: null,
    createdAt: "2024-01-01T00:00:00.000Z"
  },
  unit: {
    id: "unit_123",
    type: "character",
    title: "Captain Vela",
    fields: {
      role: "Explorer",
      level: 4
    },
    refs: {
      factionId: "unit_faction_1"
    },
    meta: {
      tags: ["hero"]
    }
  },
  commit: {
    id: "commit_123",
    worldId: "world_123",
    message: "Add new storyline",
    parentCommitId: null,
    parentCommitId2: null,
    createdAt: "2024-01-01T00:00:00.000Z"
  },
  diff: {
    changes: [
      {
        unitId: "unit_123",
        path: "/fields/level",
        from: 3,
        to: 4
      }
    ]
  },
  mergePreview: {
    conflicts: [
      {
        unitId: "unit_123",
        path: "/fields/role",
        base: "Explorer",
        ours: "Scout",
        theirs: "Navigator"
      }
    ],
    previewMergedUnits: {
      unit_123: {
        id: "unit_123",
        type: "character",
        title: "Captain Vela",
        fields: {
          role: "Explorer",
          level: 4
        }
      }
    }
  },
  mergeSuccess: {
    mergeCommitId: "commit_merge_456"
  },
  errorInvalid: {
    error: {
      code: "INVALID_INPUT",
      message: "Invalid request"
    }
  },
  errorWorldNotFound: {
    error: {
      code: "WORLD_NOT_FOUND",
      message: "World not found"
    }
  },
  errorBranchNotFound: {
    error: {
      code: "BRANCH_NOT_FOUND",
      message: "Branch not found"
    }
  },
  errorCommitNotFound: {
    error: {
      code: "COMMIT_NOT_FOUND",
      message: "Commit not found"
    }
  },
  errorUnitNotFound: {
    error: {
      code: "UNIT_NOT_FOUND",
      message: "Unit not found"
    }
  },
  errorInvalidRef: {
    error: {
      code: "INVALID_REF",
      message: "Invalid ref"
    }
  }
};

await app.register(swagger, {
  openapi: {
    openapi: "3.0.3",
    info: {
      title: "WorldFork Core API",
      version: "0.1.0",
      description: "WorldFork Core API for worlds, branches, units, commits, diff, and merge."
    },
    servers: [{ url: "http://localhost:3000" }]
  }
});

await app.register(swaggerUi, {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "list"
  }
});

app.get("/openapi.json", async (_request, reply) => reply.send(app.swagger()));

const loadUnitsByRef = async (worldId: string, ref: { type: "branch" | "commit"; id: string }) => {
  if (ref.type === "branch") {
    const branch = await getBranch(worldId, ref.id);
    if (!branch) {
      throw errorResponse("BRANCH_NOT_FOUND", "Branch not found");
    }
    return getBranchUnitStates(branch.id);
  }
  const commit = await getCommit(ref.id);
  if (!commit || commit.worldId !== worldId) {
    throw errorResponse("COMMIT_NOT_FOUND", "Commit not found");
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

app.get(
  "/v1/worlds",
  {
    schema: {
      tags: ["Worlds"],
      summary: "List worlds",
      response: {
        200: withExample(toSchema(worldListResponseSchema), { worlds: [examples.world] })
      }
    }
  },
  async (_request, reply) => {
    const worlds = await listWorlds();
    return reply.send({ worlds });
  }
);

app.get(
  "/v1/worlds/:worldId",
  {
    schema: {
      tags: ["Worlds"],
      summary: "Get a world with branches",
      params: toSchema(worldParamsSchema),
      response: {
        200: withExample(toSchema(worldDetailResponseSchema), {
          ...examples.world,
          branches: [
            {
              name: "main",
              headCommitId: "commit_123",
              updatedAt: "2024-01-02T00:00:00.000Z"
            }
          ]
        }),
        400: withExample(toSchema(errorSchema), examples.errorInvalid),
        404: withExample(toSchema(errorSchema), examples.errorWorldNotFound)
      }
    }
  },
  async (request, reply) => {
    const params = worldParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
    }

    const world = await getWorldWithBranches(params.data.worldId);
    if (!world) {
      return reply.status(404).send(errorResponse("WORLD_NOT_FOUND", "World not found"));
    }

    const branches = world.branches.map((branch) => ({
      name: branch.name,
      headCommitId: branch.headCommitId ?? null,
      updatedAt: (branch.headCommit?.createdAt ?? branch.createdAt).toISOString()
    }));

    return reply.send({
      id: world.id,
      name: world.name,
      description: world.description,
      createdAt: world.createdAt.toISOString(),
      branches
    });
  }
);

app.get(
  "/v1/worlds/:worldId/branches",
  {
    schema: {
      tags: ["Branches"],
      summary: "List branches",
      params: toSchema(worldParamsSchema),
      querystring: withExample(toSchema(branchListQuerySchema), { name: "main" }),
      response: {
        200: withExample(toSchema(branchListResponseSchema), {
          branches: [
            {
              name: "main",
              headCommitId: "commit_123",
              updatedAt: "2024-01-02T00:00:00.000Z"
            }
          ]
        }),
        400: withExample(toSchema(errorSchema), examples.errorInvalid),
        404: withExample(toSchema(errorSchema), examples.errorWorldNotFound)
      }
    }
  },
  async (request, reply) => {
    const params = worldParamsSchema.safeParse(request.params);
    const query = branchListQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
    }

    const world = await getWorld(params.data.worldId);
    if (!world) {
      return reply.status(404).send(errorResponse("WORLD_NOT_FOUND", "World not found"));
    }

    const branches = await listBranches(world.id, query.data.name);
    return reply.send({
      branches: branches.map((branch) => ({
        name: branch.name,
        headCommitId: branch.headCommitId ?? null,
        updatedAt: (branch.headCommit?.createdAt ?? branch.createdAt).toISOString()
      }))
    });
  }
);

app.get(
  "/v1/worlds/:worldId/commits",
  {
    schema: {
      tags: ["Commits"],
      summary: "List commits for a branch",
      params: toSchema(worldParamsSchema),
      querystring: withExample(toSchema(commitListQuerySchema), {
        branchName: "main",
        limit: 20
      }),
      response: {
        200: withExample(toSchema(commitListResponseSchema), {
          commits: [examples.commit],
          nextCursor: null
        }),
        400: withExample(toSchema(errorSchema), examples.errorInvalid),
        404: withExample(toSchema(errorSchema), examples.errorBranchNotFound)
      }
    }
  },
  async (request, reply) => {
    const params = worldParamsSchema.safeParse(request.params);
    const query = commitListQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
    }

    const world = await getWorld(params.data.worldId);
    if (!world) {
      return reply.status(404).send(errorResponse("WORLD_NOT_FOUND", "World not found"));
    }

    const branch = await getBranch(world.id, query.data.branchName);
    if (!branch) {
      return reply.status(404).send(errorResponse("BRANCH_NOT_FOUND", "Branch not found"));
    }

    const limit = query.data.limit ?? 50;
    const { commits, nextCursor } = await listCommitsByBranchHead(
      branch.headCommitId,
      limit,
      query.data.cursor
    );

    return reply.send({ commits, nextCursor });
  }
);

app.get(
  "/v1/worlds/:worldId/units",
  {
    schema: {
      tags: ["Units"],
      summary: "List units for a ref",
      params: toSchema(worldParamsSchema),
      querystring: withExample(toSchema(unitListQuerySchema), {
        ref: "branch:main",
        type: "character"
      }),
      response: {
        200: withExample(toSchema(unitListResponseSchema), { units: [examples.unit] }),
        400: withExample(toSchema(errorSchema), examples.errorInvalidRef),
        404: withExample(toSchema(errorSchema), examples.errorBranchNotFound)
      }
    }
  },
  async (request, reply) => {
    const params = worldParamsSchema.safeParse(request.params);
    const query = unitListQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
    }

    const ref = parseRef(query.data.ref);
    if (!ref) {
      return reply.status(400).send(errorResponse("INVALID_REF", "Invalid ref"));
    }

    if (ref.type === "branch") {
      const branch = await getBranch(params.data.worldId, ref.id);
      if (!branch) {
        return reply.status(404).send(errorResponse("BRANCH_NOT_FOUND", "Branch not found"));
      }
      const units = await listUnitsByBranch(branch.id, query.data.type);
      return reply.send({ units });
    }

    const commit = await getCommit(ref.id);
    if (!commit || commit.worldId !== params.data.worldId) {
      return reply.status(404).send(errorResponse("COMMIT_NOT_FOUND", "Commit not found"));
    }

    const units = await listUnitsByCommit(commit.id, query.data.type);
    return reply.send({ units });
  }
);

app.get(
  "/v1/worlds/:worldId/units/:unitId",
  {
    schema: {
      tags: ["Units"],
      summary: "Get a unit by ref",
      params: toSchema(unitParamsSchema),
      querystring: withExample(toSchema(unitDetailQuerySchema), {
        ref: "branch:main"
      }),
      response: {
        200: withExample(toSchema(unitSchema), examples.unit),
        400: withExample(toSchema(errorSchema), examples.errorInvalidRef),
        404: withExample(toSchema(errorSchema), examples.errorUnitNotFound)
      }
    }
  },
  async (request, reply) => {
    const params = unitParamsSchema.safeParse(request.params);
    const query = unitDetailQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
    }

    const ref = parseRef(query.data.ref);
    if (!ref) {
      return reply.status(400).send(errorResponse("INVALID_REF", "Invalid ref"));
    }

    if (ref.type === "branch") {
      const branch = await getBranch(params.data.worldId, ref.id);
      if (!branch) {
        return reply.status(404).send(errorResponse("BRANCH_NOT_FOUND", "Branch not found"));
      }
      const unit = await getUnitByBranch(branch.id, params.data.unitId);
      if (!unit) {
        return reply.status(404).send(errorResponse("UNIT_NOT_FOUND", "Unit not found"));
      }
      return reply.send(unit);
    }

    const commit = await getCommit(ref.id);
    if (!commit || commit.worldId !== params.data.worldId) {
      return reply.status(404).send(errorResponse("COMMIT_NOT_FOUND", "Commit not found"));
    }
    const unit = await getUnitByCommit(commit.id, params.data.unitId);
    if (!unit) {
      return reply.status(404).send(errorResponse("UNIT_NOT_FOUND", "Unit not found"));
    }
    return reply.send(unit);
  }
);

app.post(
  "/v1/worlds",
  {
    schema: {
      tags: ["Worlds"],
      summary: "Create a world",
      body: withExample(toSchema(createWorldBodySchema), {
        name: "Eldoria",
        description: "Shared universe for lore"
      }),
      response: {
        201: withExample(toSchema(worldSchema), examples.world),
        400: withExample(toSchema(errorSchema), examples.errorInvalid)
      }
    }
  },
  async (request, reply) => {
    const parsed = createWorldBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request", parsed.error.format()));
    }

    const world = await createWorld(parsed.data.name, parsed.data.description);
    return reply.status(201).send(world);
  }
);

app.post(
  "/v1/worlds/:worldId/branches",
  {
    schema: {
      tags: ["Branches"],
      summary: "Create a branch",
      params: toSchema(worldParamsSchema),
      body: withExample(toSchema(createBranchBodySchema), {
        name: "feature/quests",
        sourceBranch: "main"
      }),
      response: {
        201: withExample(toSchema(branchSchema), examples.branch),
        400: withExample(toSchema(errorSchema), examples.errorInvalid),
        404: withExample(toSchema(errorSchema), examples.errorWorldNotFound)
      }
    }
  },
  async (request, reply) => {
    const params = worldParamsSchema.safeParse(request.params);
    const parsed = createBranchBodySchema.safeParse(request.body);
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
      return reply.status(404).send(errorResponse("WORLD_NOT_FOUND", "World not found"));
    }

    let sourceCommitId: string | null | undefined = null;
    if (parsed.data.sourceCommitId) {
      sourceCommitId = parsed.data.sourceCommitId;
    } else {
      const sourceBranchName = parsed.data.sourceBranch ?? "main";
      const sourceBranch = await getBranch(world.id, sourceBranchName);
      if (!sourceBranch) {
        return reply.status(404).send(errorResponse("BRANCH_NOT_FOUND", "Source branch not found"));
      }
      sourceCommitId = sourceBranch.headCommitId ?? null;
    }

    const branch = await createBranch(world.id, parsed.data.name, sourceCommitId);
    return reply.status(201).send(branch);
  }
);

app.post(
  "/v1/worlds/:worldId/units",
  {
    schema: {
      tags: ["Units"],
      summary: "Create or update a unit",
      params: toSchema(worldParamsSchema),
      body: withExample(toSchema(createUnitBodySchema), {
        branchName: "main",
        unit: examples.unit
      }),
      response: {
        201: withExample(toSchema(unitSchema), examples.unit),
        400: withExample(toSchema(errorSchema), examples.errorInvalid),
        404: withExample(toSchema(errorSchema), examples.errorWorldNotFound)
      }
    }
  },
  async (request, reply) => {
    const params = worldParamsSchema.safeParse(request.params);
    const parsed = createUnitBodySchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
    }

    const world = await getWorld(params.data.worldId);
    if (!world) {
      return reply.status(404).send(errorResponse("WORLD_NOT_FOUND", "World not found"));
    }

    const branch = await getBranch(world.id, parsed.data.branchName);
    if (!branch) {
      return reply.status(404).send(errorResponse("BRANCH_NOT_FOUND", "Branch not found"));
    }

    const unit: UnitContent = {
      ...parsed.data.unit,
      id: parsed.data.unit.id ?? nanoid()
    };

    await upsertUnitState(world.id, branch.id, unit);
    return reply.status(201).send(unit);
  }
);

app.post(
  "/v1/worlds/:worldId/commits",
  {
    schema: {
      tags: ["Commits"],
      summary: "Create a commit from a branch",
      params: toSchema(worldParamsSchema),
      body: withExample(toSchema(createCommitBodySchema), {
        branchName: "main",
        message: "Add new storyline"
      }),
      response: {
        201: withExample(toSchema(commitSchema), examples.commit),
        400: withExample(toSchema(errorSchema), examples.errorInvalid),
        404: withExample(toSchema(errorSchema), examples.errorWorldNotFound)
      }
    }
  },
  async (request, reply) => {
    const params = worldParamsSchema.safeParse(request.params);
    const parsed = createCommitBodySchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
    }

    const world = await getWorld(params.data.worldId);
    if (!world) {
      return reply.status(404).send(errorResponse("WORLD_NOT_FOUND", "World not found"));
    }

    const branch = await getBranch(world.id, parsed.data.branchName);
    if (!branch) {
      return reply.status(404).send(errorResponse("BRANCH_NOT_FOUND", "Branch not found"));
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
  }
);

app.get(
  "/v1/worlds/:worldId/diff",
  {
    schema: {
      tags: ["Diff"],
      summary: "Compare two refs",
      params: toSchema(worldParamsSchema),
      querystring: withExample(toSchema(diffQuerySchema), {
        from: "branch:main",
        to: "branch:feature/quests"
      }),
      response: {
        200: withExample(toSchema(diffResponseSchema), examples.diff),
        400: withExample(toSchema(errorSchema), examples.errorInvalidRef),
        404: withExample(toSchema(errorSchema), examples.errorBranchNotFound)
      }
    }
  },
  async (request, reply) => {
    const params = worldParamsSchema.safeParse(request.params);
    const parsed = diffQuerySchema.safeParse(request.query);
    if (!params.success || !parsed.success) {
      return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
    }

    const fromRef = parseRef(parsed.data.from);
    const toRef = parseRef(parsed.data.to);
    if (!fromRef || !toRef) {
      return reply.status(400).send(errorResponse("INVALID_REF", "Invalid diff refs"));
    }

    try {
      const fromUnits = await loadUnitsByRef(params.data.worldId, fromRef);
      const toUnits = await loadUnitsByRef(params.data.worldId, toRef);
      const changes = diffUnits(fromUnits, toUnits);
      return reply.send({ changes });
    } catch (error) {
      return reply.status(404).send(error);
    }
  }
);

app.post(
  "/v1/worlds/:worldId/merge",
  {
    schema: {
      tags: ["Merge"],
      summary: "Merge one branch into another",
      params: toSchema(worldParamsSchema),
      body: withExample(toSchema(mergeBodySchema), {
        oursBranch: "main",
        theirsBranch: "feature/quests",
        resolutions: [
          {
            unitId: "unit_123",
            path: "/fields/role",
            choice: "manual",
            value: "Navigator"
          }
        ]
      }),
      response: {
        200: withExample(toSchema(mergePreviewResponseSchema), examples.mergePreview),
        201: withExample(toSchema(mergeSuccessResponseSchema), examples.mergeSuccess),
        400: withExample(toSchema(errorSchema), examples.errorInvalid),
        404: withExample(toSchema(errorSchema), examples.errorBranchNotFound)
      }
    }
  },
  async (request, reply) => {
    const params = worldParamsSchema.safeParse(request.params);
    const parsed = mergeBodySchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
    }

    const world = await getWorld(params.data.worldId);
    if (!world) {
      return reply.status(404).send(errorResponse("WORLD_NOT_FOUND", "World not found"));
    }

    const oursBranch = await getBranch(world.id, parsed.data.oursBranch);
    const theirsBranch = await getBranch(world.id, parsed.data.theirsBranch);
    if (!oursBranch || !theirsBranch) {
      return reply.status(404).send(errorResponse("BRANCH_NOT_FOUND", "Branch not found"));
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
          const updated = setValueAtPath(
            { ...(currentUnit as Record<string, unknown>) },
            resolution.path,
            resolvedValue
          );
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
      contentJson: JSON.stringify(unit)
    }));

    if (snapshotData.length > 0) {
      await prisma.unitSnapshot.createMany({ data: snapshotData });
    }

    for (const unit of Object.values(resolvedUnits)) {
      await upsertUnitState(world.id, oursBranch.id, unit);
    }

    await updateBranchHead(oursBranch.id, mergeCommit.id);

    return reply.status(201).send({ mergeCommitId: mergeCommit.id });
  }
);

const start = async () => {
  try {
    await app.listen({ port: 3000, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
