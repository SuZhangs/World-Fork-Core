import Fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { nanoid } from "nanoid";
import { createWorld, getWorld, getWorldWithBranches, listWorldsPaged } from "../repo/worldRepo.js";
import { createBranch, getBranch, listBranches } from "../repo/branchRepo.js";
import { findCommonAncestor, getCommit, listCommitsByBranchHead } from "../repo/commitRepo.js";
import {
  getBranchUnitStates,
  getCommitUnitSnapshots,
  getUnitByBranchWithMeta,
  getUnitByCommitWithMeta,
  listUnitsPagedByBranch,
  listUnitsPagedByCommit,
  upsertUnitState
} from "../repo/unitRepo.js";
import { diffUnits } from "../core/diff.js";
import { mergeUnits } from "../core/merge.js";
import { prisma } from "../repo/prisma.js";
import { UnitContent } from "../core/types.js";
import { fromPointer } from "../core/jsonPointer.js";
import { errorResponse } from "./errors.js";
import { parseRef } from "./ref.js";
import { registerAuth } from "./plugins/auth.js";

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

const isErrorResponse = (value: unknown): value is { error: { code: string } } =>
  typeof value === "object" && value !== null && "error" in value;

const apiKeySecurity = [{ ApiKeyAuth: [] }];

const worldSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  createdAt: z.string().datetime()
});

const worldSummarySchema = worldSchema.extend({
  updatedAt: z.string().datetime()
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
  worldId: z.string(),
  headCommitId: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
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

const commitSummarySchema = z.object({
  id: z.string(),
  message: z.string(),
  parents: z.array(z.string()),
  createdAt: z.string().datetime()
});

const commitDetailSchema = commitSummarySchema.extend({
  worldId: z.string()
});

const unitSummarySchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  updatedAt: z.string().datetime().optional()
});

const unitFullSchema = unitSchema.extend({
  updatedAt: z.string().datetime().optional()
});

const worldListResponseSchema = z.object({
  items: z.array(worldSummarySchema),
  nextCursor: z.string().nullable()
});

const worldDetailResponseSchema = worldSchema.extend({
  updatedAt: z.string().datetime(),
  branches: z.array(branchSummarySchema)
});

const branchListResponseSchema = z.object({
  items: z.array(branchSummarySchema)
});

const commitListResponseSchema = z.object({
  items: z.array(commitSummarySchema),
  nextCursor: z.string().nullable()
});

const unitListResponseSchema = z.object({
  items: z.array(z.union([unitSummarySchema, unitFullSchema])),
  nextCursor: z.string().nullable()
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
  theirs: z.unknown(),
  unit: z.object({
    id: z.string(),
    type: z.string(),
    title: z.string()
  }),
  refContext: z.object({
    baseCommitId: z.string().nullable(),
    oursCommitId: z.string().nullable(),
    theirsCommitId: z.string().nullable()
  }),
  pathTokens: z.array(z.string()).optional()
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
  message: z.string().min(1),
  expectedHeadCommitId: z.string().nullable().optional()
});

const diffQuerySchema = z.object({
  from: z.string(),
  to: z.string()
});

const worldListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => (Array.isArray(value) ? value[0] : value))
});

const branchListQuerySchema = z.object({
  name: z.string().optional()
});

const commitListQuerySchema = z.object({
  branchName: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional()
});

const unitListQuerySchema = z.object({
  ref: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  includeContent: z.coerce.boolean().optional()
});

const unitDetailQuerySchema = z.object({
  ref: z.string().min(1)
});

const mergeBodySchema = z.object({
  oursBranch: z.string().min(1),
  theirsBranch: z.string().min(1),
  expectedHeadCommitId: z.string().nullable().optional(),
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
const commitParamsSchema = z.object({ worldId: z.string().min(1), commitId: z.string().min(1) });
const unitParamsSchema = z.object({ worldId: z.string().min(1), unitId: z.string().min(1) });

const examples = {
  world: {
    id: "world_123",
    name: "Eldoria",
    description: "Shared universe for lore",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z"
  },
  worldCreate: {
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
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z"
  },
  branchCreate: {
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
  commitSummary: {
    id: "commit_123",
    message: "Add new storyline",
    parents: [],
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
        theirs: "Navigator",
        unit: {
          id: "unit_123",
          type: "character",
          title: "Captain Vela"
        },
        refContext: {
          baseCommitId: "commit_base_123",
          oursCommitId: "commit_ours_123",
          theirsCommitId: "commit_theirs_123"
        },
        pathTokens: ["fields", "role"]
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
  },
  errorHeadChanged: {
    error: {
      code: "HEAD_CHANGED",
      message: "Branch head changed",
      details: {
        branchName: "main",
        expected: "commit_123",
        actual: "commit_456"
      }
    }
  },
  errorAuthRequired: {
    error: {
      code: "AUTH_REQUIRED",
      message: "API key required"
    }
  },
  errorInvalidApiKey: {
    error: {
      code: "INVALID_API_KEY",
      message: "Invalid API key"
    }
  }
};

const headChangedError = (branchName: string, expected: string | null | undefined, actual: string | null) =>
  errorResponse("HEAD_CHANGED", "Branch head changed", {
    branchName,
    expected: expected ?? null,
    actual
  });

const authErrorResponseSchema = withExample(toSchema(errorSchema), examples.errorAuthRequired);

await app.register(swagger, {
  openapi: {
    openapi: "3.0.3",
    info: {
      title: "WorldFork Core API",
      version: "0.1.1",
      description: "WorldFork Core API for worlds, branches, units, commits, diff, and merge."
    },
    servers: [{ url: "http://localhost:3000" }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key"
        }
      }
    }
  }
});

await app.register(swaggerUi, {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "list"
  }
});

await registerAuth(app);

app.get(
  "/openapi.json",
  {
    schema: {
      security: []
    }
  },
  async (_request, reply) => reply.send(app.swagger())
);

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

const containsPointerEscapes = (path: string) => path.includes("~0") || path.includes("~1");

const parsePointerTokens = (path: string): string[] | null => {
  try {
    return fromPointer(path);
  } catch {
    return null;
  }
};

const legacySplitTokens = (path: string): string[] =>
  path === "" ? [] : path.replace(/^\//, "").split("/");

const isArrayIndex = (token: string) => token !== "" && String(Number(token)) === token;

const getValueAtTokens = (target: unknown, tokens: string[]): unknown => {
  let current: unknown = target;
  for (const token of tokens) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    if (Array.isArray(current) && isArrayIndex(token)) {
      current = current[Number(token)];
    } else {
      current = (current as Record<string, unknown>)[token];
    }
  }
  return current;
};

const getValueAtPath = (target: Record<string, unknown> | undefined, path: string) => {
  if (!target) {
    return undefined;
  }
  if (path === "") {
    return target;
  }
  const pointerTokens = parsePointerTokens(path);
  if (pointerTokens) {
    const value = getValueAtTokens(target, pointerTokens);
    if (value !== undefined || containsPointerEscapes(path)) {
      return value;
    }
  }
  return getValueAtTokens(target, legacySplitTokens(path));
};

const setValueAtTokens = (target: Record<string, unknown>, tokens: string[], value: unknown) => {
  if (tokens.length === 0) {
    return value as Record<string, unknown>;
  }
  let current: Record<string, unknown> | unknown[] = target;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    const nextToken = tokens[i + 1];
    if (Array.isArray(current) && isArrayIndex(token)) {
      const index = Number(token);
      if (
        current[index] === undefined ||
        current[index] === null ||
        typeof current[index] !== "object"
      ) {
        current[index] = isArrayIndex(nextToken) ? [] : {};
      }
      current = current[index] as Record<string, unknown> | unknown[];
      continue;
    }
    const record = current as Record<string, unknown>;
    if (record[token] === undefined || record[token] === null || typeof record[token] !== "object") {
      record[token] = isArrayIndex(nextToken) ? [] : {};
    }
    current = record[token] as Record<string, unknown> | unknown[];
  }
  const finalToken = tokens[tokens.length - 1];
  if (Array.isArray(current) && isArrayIndex(finalToken)) {
    current[Number(finalToken)] = value;
  } else {
    (current as Record<string, unknown>)[finalToken] = value;
  }
  return target;
};

const setValueAtPath = (target: Record<string, unknown>, path: string, value: unknown) => {
  const pointerTokens = parsePointerTokens(path);
  if (pointerTokens) {
    return setValueAtTokens(target, pointerTokens, value);
  }
  return setValueAtTokens(target, legacySplitTokens(path), value);
};

app.get(
  "/v1/worlds",
  {
    schema: {
      tags: ["Worlds"],
      summary: "List worlds",
      security: apiKeySecurity,
      querystring: withExample(toSchema(worldListQuerySchema), { limit: 20 }),
      response: {
        200: withExample(toSchema(worldListResponseSchema), {
          items: [examples.world],
          nextCursor: null
        }),
        400: withExample(toSchema(errorSchema), examples.errorInvalid),
        401: authErrorResponseSchema
      }
    }
  },
  async (_request, reply) => {
    const query = worldListQuerySchema.safeParse(_request.query);
    if (!query.success) {
      return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
    }

    const limit = query.data.limit ?? 20;
    const { items, nextCursor } = await listWorldsPaged(_request.tenantId, limit, query.data.cursor);
    return reply.send({
      items: items.map((world) => ({
        id: world.id,
        name: world.name,
        description: world.description,
        createdAt: world.createdAt.toISOString(),
        updatedAt: world.createdAt.toISOString()
      })),
      nextCursor
    });
  }
);

app.get(
  "/v1/worlds/:worldId",
  {
    schema: {
      tags: ["Worlds"],
      summary: "Get a world with branches",
      security: apiKeySecurity,
      params: toSchema(worldParamsSchema),
      response: {
        200: withExample(toSchema(worldDetailResponseSchema), {
          ...examples.world,
          branches: [
            {
              name: "main",
              worldId: "world_123",
              headCommitId: "commit_123",
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-02T00:00:00.000Z"
            }
          ]
        }),
        400: withExample(toSchema(errorSchema), examples.errorInvalid),
        401: authErrorResponseSchema,
        404: withExample(toSchema(errorSchema), examples.errorWorldNotFound)
      }
    }
  },
  async (request, reply) => {
    const params = worldParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
    }

    const world = await getWorldWithBranches(params.data.worldId, request.tenantId);
    if (!world) {
      return reply.status(404).send(errorResponse("WORLD_NOT_FOUND", "World not found"));
    }

    const branches = world.branches.map((branch) => ({
      name: branch.name,
      worldId: branch.worldId,
      headCommitId: branch.headCommitId ?? null,
      createdAt: branch.createdAt.toISOString(),
      updatedAt: (branch.headCommit?.createdAt ?? branch.createdAt).toISOString()
    }));

    return reply.send({
      id: world.id,
      name: world.name,
      description: world.description,
      createdAt: world.createdAt.toISOString(),
      updatedAt: world.createdAt.toISOString(),
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
      security: apiKeySecurity,
      params: toSchema(worldParamsSchema),
      querystring: withExample(toSchema(branchListQuerySchema), { name: "main" }),
      response: {
        200: withExample(toSchema(branchListResponseSchema), {
          items: [
            {
              name: "main",
              worldId: "world_123",
              headCommitId: "commit_123",
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-02T00:00:00.000Z"
            }
          ]
        }),
        400: withExample(toSchema(errorSchema), examples.errorInvalid),
        401: authErrorResponseSchema,
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

    const world = await getWorld(params.data.worldId, request.tenantId);
    if (!world) {
      return reply.status(404).send(errorResponse("WORLD_NOT_FOUND", "World not found"));
    }

    const branches = await listBranches(world.id, query.data.name);
    return reply.send({
      items: branches.map((branch) => ({
        name: branch.name,
        worldId: branch.worldId,
        headCommitId: branch.headCommitId ?? null,
        createdAt: branch.createdAt.toISOString(),
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
      security: apiKeySecurity,
      params: toSchema(worldParamsSchema),
      querystring: withExample(toSchema(commitListQuerySchema), {
        branchName: "main",
        limit: 20
      }),
      response: {
        200: withExample(toSchema(commitListResponseSchema), {
          items: [examples.commitSummary],
          nextCursor: null
        }),
        400: withExample(toSchema(errorSchema), examples.errorInvalid),
        401: authErrorResponseSchema,
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

    const world = await getWorld(params.data.worldId, request.tenantId);
    if (!world) {
      return reply.status(404).send(errorResponse("WORLD_NOT_FOUND", "World not found"));
    }

    const branchName = query.data.branchName ?? "main";
    const branch = await getBranch(world.id, branchName);
    if (!branch) {
      return reply.status(404).send(errorResponse("BRANCH_NOT_FOUND", "Branch not found"));
    }

    const limit = query.data.limit ?? 20;
    const { commits, nextCursor } = await listCommitsByBranchHead(
      branch.headCommitId,
      limit,
      query.data.cursor
    );

    return reply.send({
      items: commits.map((commit) => ({
        id: commit.id,
        message: commit.message,
        parents: [commit.parentCommitId, commit.parentCommitId2].filter(
          (parent): parent is string => Boolean(parent)
        ),
        createdAt: commit.createdAt.toISOString()
      })),
      nextCursor
    });
  }
);

app.get(
  "/v1/worlds/:worldId/commits/:commitId",
  {
    schema: {
      tags: ["Commits"],
      summary: "Get a commit",
      security: apiKeySecurity,
      params: toSchema(commitParamsSchema),
      response: {
        200: withExample(toSchema(commitDetailSchema), {
          ...examples.commitSummary,
          worldId: "world_123"
        }),
        400: withExample(toSchema(errorSchema), examples.errorInvalid),
        401: authErrorResponseSchema,
        404: withExample(toSchema(errorSchema), examples.errorCommitNotFound)
      }
    }
  },
  async (request, reply) => {
    const params = commitParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
    }

    const world = await getWorld(params.data.worldId, request.tenantId);
    if (!world) {
      return reply.status(404).send(errorResponse("WORLD_NOT_FOUND", "World not found"));
    }

    const commit = await getCommit(params.data.commitId);
    if (!commit || commit.worldId !== world.id) {
      return reply.status(404).send(errorResponse("COMMIT_NOT_FOUND", "Commit not found"));
    }

    return reply.send({
      id: commit.id,
      worldId: commit.worldId,
      message: commit.message,
      parents: [commit.parentCommitId, commit.parentCommitId2].filter(
        (parent): parent is string => Boolean(parent)
      ),
      createdAt: commit.createdAt.toISOString()
    });
  }
);

app.get(
  "/v1/worlds/:worldId/units",
  {
    schema: {
      tags: ["Units"],
      summary: "List units for a ref",
      security: apiKeySecurity,
      params: toSchema(worldParamsSchema),
      querystring: withExample(toSchema(unitListQuerySchema), {
        ref: "branch:main",
        limit: 20,
        includeContent: false
      }),
      response: {
        200: withExample(toSchema(unitListResponseSchema), {
          items: [examples.unit],
          nextCursor: null
        }),
        400: withExample(toSchema(errorSchema), examples.errorInvalidRef),
        401: authErrorResponseSchema,
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

    const world = await getWorld(params.data.worldId, request.tenantId);
    if (!world) {
      return reply.status(404).send(errorResponse("WORLD_NOT_FOUND", "World not found"));
    }

    const ref = parseRef(query.data.ref);
    if (!ref) {
      return reply.status(400).send(errorResponse("INVALID_REF", "Invalid ref"));
    }

    const limit = query.data.limit ?? 20;
    const includeContent = query.data.includeContent ?? false;

    if (ref.type === "branch") {
      const branch = await getBranch(world.id, ref.id);
      if (!branch) {
        return reply.status(404).send(errorResponse("BRANCH_NOT_FOUND", "Branch not found"));
      }
      if (query.data.cursor) {
        const cursorState = await prisma.unitState.findUnique({
          where: { branchId_unitId: { branchId: branch.id, unitId: query.data.cursor } }
        });
        if (!cursorState) {
          return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
        }
      }
      const { items, nextCursor } = await listUnitsPagedByBranch(
        branch.id,
        limit,
        query.data.cursor,
        includeContent
      );
      return reply.send({ items, nextCursor });
    }

    const commit = await getCommit(ref.id);
    if (!commit || commit.worldId !== world.id) {
      return reply.status(404).send(errorResponse("COMMIT_NOT_FOUND", "Commit not found"));
    }
    if (query.data.cursor) {
      const cursorSnapshot = await prisma.unitSnapshot.findFirst({
        where: { commitId: commit.id, unitId: query.data.cursor }
      });
      if (!cursorSnapshot) {
        return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request"));
      }
    }

    const { items, nextCursor } = await listUnitsPagedByCommit(
      commit.id,
      limit,
      query.data.cursor,
      includeContent
    );
    return reply.send({ items, nextCursor });
  }
);

app.get(
  "/v1/worlds/:worldId/units/:unitId",
  {
    schema: {
      tags: ["Units"],
      summary: "Get a unit by ref",
      security: apiKeySecurity,
      params: toSchema(unitParamsSchema),
      querystring: withExample(toSchema(unitDetailQuerySchema), {
        ref: "branch:main"
      }),
      response: {
        200: withExample(toSchema(unitFullSchema), {
          ...examples.unit,
          updatedAt: "2024-01-01T00:00:00.000Z"
        }),
        400: withExample(toSchema(errorSchema), examples.errorInvalidRef),
        401: authErrorResponseSchema,
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

    const world = await getWorld(params.data.worldId, request.tenantId);
    if (!world) {
      return reply.status(404).send(errorResponse("WORLD_NOT_FOUND", "World not found"));
    }

    const ref = parseRef(query.data.ref);
    if (!ref) {
      return reply.status(400).send(errorResponse("INVALID_REF", "Invalid ref"));
    }

    if (ref.type === "branch") {
      const branch = await getBranch(world.id, ref.id);
      if (!branch) {
        return reply.status(404).send(errorResponse("BRANCH_NOT_FOUND", "Branch not found"));
      }
      const unit = await getUnitByBranchWithMeta(branch.id, params.data.unitId);
      if (!unit) {
        return reply.status(404).send(errorResponse("UNIT_NOT_FOUND", "Unit not found"));
      }
      return reply.send(unit);
    }

    const commit = await getCommit(ref.id);
    if (!commit || commit.worldId !== world.id) {
      return reply.status(404).send(errorResponse("COMMIT_NOT_FOUND", "Commit not found"));
    }
    const unit = await getUnitByCommitWithMeta(commit.id, params.data.unitId);
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
      security: apiKeySecurity,
      body: withExample(toSchema(createWorldBodySchema), {
        name: "Eldoria",
        description: "Shared universe for lore"
      }),
      response: {
        201: withExample(toSchema(worldSchema), examples.worldCreate),
        400: withExample(toSchema(errorSchema), examples.errorInvalid),
        401: authErrorResponseSchema
      }
    }
  },
  async (request, reply) => {
    const parsed = createWorldBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse("INVALID_INPUT", "Invalid request", parsed.error.format()));
    }

    const world = await createWorld(request.tenantId, parsed.data.name, parsed.data.description);
    return reply.status(201).send(world);
  }
);

app.post(
  "/v1/worlds/:worldId/branches",
  {
    schema: {
      tags: ["Branches"],
      summary: "Create a branch",
      security: apiKeySecurity,
      params: toSchema(worldParamsSchema),
      body: withExample(toSchema(createBranchBodySchema), {
        name: "feature/quests",
        sourceBranch: "main"
      }),
      response: {
        201: withExample(toSchema(branchSchema), examples.branchCreate),
        400: withExample(toSchema(errorSchema), examples.errorInvalid),
        401: authErrorResponseSchema,
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

    const world = await getWorld(params.data.worldId, request.tenantId);
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
      security: apiKeySecurity,
      params: toSchema(worldParamsSchema),
      body: withExample(toSchema(createUnitBodySchema), {
        branchName: "main",
        unit: examples.unit
      }),
      response: {
        201: withExample(toSchema(unitSchema), examples.unit),
        400: withExample(toSchema(errorSchema), examples.errorInvalid),
        401: authErrorResponseSchema,
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

    const world = await getWorld(params.data.worldId, request.tenantId);
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
      security: apiKeySecurity,
      params: toSchema(worldParamsSchema),
      body: withExample(toSchema(createCommitBodySchema), {
        branchName: "main",
        message: "Add new storyline"
      }),
      response: {
        201: withExample(toSchema(commitSchema), examples.commit),
        400: withExample(toSchema(errorSchema), examples.errorInvalid),
        409: withExample(toSchema(errorSchema), examples.errorHeadChanged),
        401: authErrorResponseSchema,
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

    const world = await getWorld(params.data.worldId, request.tenantId);
    if (!world) {
      return reply.status(404).send(errorResponse("WORLD_NOT_FOUND", "World not found"));
    }

    const branch = await getBranch(world.id, parsed.data.branchName);
    if (!branch) {
      return reply.status(404).send(errorResponse("BRANCH_NOT_FOUND", "Branch not found"));
    }

    try {
      const expectedHeadCommitId = parsed.data.expectedHeadCommitId;
      const commit = await prisma.$transaction(async (tx) => {
        let currentHeadCommitId = branch.headCommitId ?? null;
        if (expectedHeadCommitId !== undefined) {
          const currentBranch = await tx.branch.findUnique({ where: { id: branch.id } });
          if (!currentBranch) {
            throw errorResponse("BRANCH_NOT_FOUND", "Branch not found");
          }
          currentHeadCommitId = currentBranch.headCommitId ?? null;
          if (expectedHeadCommitId !== currentHeadCommitId) {
            throw headChangedError(branch.name, expectedHeadCommitId, currentHeadCommitId);
          }
        }

        const nextCommit = await tx.commit.create({
          data: {
            id: nanoid(),
            worldId: world.id,
            message: parsed.data.message,
            parentCommitId: currentHeadCommitId,
            parentCommitId2: null
          }
        });

        const states = await tx.unitState.findMany({ where: { branchId: branch.id } });
        if (states.length > 0) {
          await tx.unitSnapshot.createMany({
            data: states.map((state) => ({
              id: nanoid(),
              commitId: nextCommit.id,
              unitId: state.unitId,
              contentJson: state.contentJson
            }))
          });
        }

        if (expectedHeadCommitId !== undefined) {
          const updated = await tx.branch.updateMany({
            where: { id: branch.id, headCommitId: currentHeadCommitId },
            data: { headCommitId: nextCommit.id }
          });
          if (updated.count === 0) {
            const latest = await tx.branch.findUnique({ where: { id: branch.id } });
            throw headChangedError(branch.name, expectedHeadCommitId, latest?.headCommitId ?? null);
          }
        } else {
          await tx.branch.update({ where: { id: branch.id }, data: { headCommitId: nextCommit.id } });
        }

        return nextCommit;
      });
      return reply.status(201).send(commit);
    } catch (error) {
      if (isErrorResponse(error)) {
        if (error.error.code === "HEAD_CHANGED") {
          return reply.status(409).send(error);
        }
        if (error.error.code === "BRANCH_NOT_FOUND") {
          return reply.status(404).send(error);
        }
      }
      throw error;
    }
  }
);

app.get(
  "/v1/worlds/:worldId/diff",
  {
    schema: {
      tags: ["Diff"],
      summary: "Compare two refs",
      security: apiKeySecurity,
      params: toSchema(worldParamsSchema),
      querystring: withExample(toSchema(diffQuerySchema), {
        from: "branch:main",
        to: "branch:feature/quests"
      }),
      response: {
        200: withExample(toSchema(diffResponseSchema), examples.diff),
        400: withExample(toSchema(errorSchema), examples.errorInvalidRef),
        401: authErrorResponseSchema,
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

    const world = await getWorld(params.data.worldId, request.tenantId);
    if (!world) {
      return reply.status(404).send(errorResponse("WORLD_NOT_FOUND", "World not found"));
    }

    const fromRef = parseRef(parsed.data.from);
    const toRef = parseRef(parsed.data.to);
    if (!fromRef || !toRef) {
      return reply.status(400).send(errorResponse("INVALID_REF", "Invalid diff refs"));
    }

    try {
      const fromUnits = await loadUnitsByRef(world.id, fromRef);
      const toUnits = await loadUnitsByRef(world.id, toRef);
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
      security: apiKeySecurity,
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
        409: withExample(toSchema(errorSchema), examples.errorHeadChanged),
        401: authErrorResponseSchema,
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

    const world = await getWorld(params.data.worldId, request.tenantId);
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

    const enrichedConflicts = mergeResult.conflicts.map((conflict) => {
      const unit =
        oursUnits[conflict.unitId] ?? theirsUnits[conflict.unitId] ?? baseUnits[conflict.unitId];
      return {
        ...conflict,
        unit: {
          id: unit?.id ?? conflict.unitId,
          type: unit?.type ?? "unknown",
          title: unit?.title ?? "unknown"
        },
        refContext: {
          baseCommitId,
          oursCommitId: oursBranch.headCommitId ?? null,
          theirsCommitId: theirsBranch.headCommitId ?? null
        },
        pathTokens: fromPointer(conflict.path)
      };
    });

    if (enrichedConflicts.length > 0 && !parsed.data.resolutions) {
      return reply.send({ conflicts: enrichedConflicts, previewMergedUnits: mergeResult.mergedUnits });
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

    try {
      const expectedHeadCommitId = parsed.data.expectedHeadCommitId;
      const mergeCommit = await prisma.$transaction(async (tx) => {
        let currentHeadCommitId = oursBranch.headCommitId ?? null;
        if (expectedHeadCommitId !== undefined) {
          const currentBranch = await tx.branch.findUnique({ where: { id: oursBranch.id } });
          if (!currentBranch) {
            throw errorResponse("BRANCH_NOT_FOUND", "Branch not found");
          }
          currentHeadCommitId = currentBranch.headCommitId ?? null;
          if (expectedHeadCommitId !== currentHeadCommitId) {
            throw headChangedError(oursBranch.name, expectedHeadCommitId, currentHeadCommitId);
          }
        }

        const nextMergeCommit = await tx.commit.create({
          data: {
            id: nanoid(),
            worldId: world.id,
            message: `Merge ${oursBranch.name} <- ${theirsBranch.name}`,
            parentCommitId: currentHeadCommitId,
            parentCommitId2: theirsBranch.headCommitId ?? null
          }
        });

        const snapshotData = Object.values(resolvedUnits).map((unit) => ({
          id: nanoid(),
          commitId: nextMergeCommit.id,
          unitId: unit.id,
          contentJson: JSON.stringify(unit)
        }));

        if (snapshotData.length > 0) {
          await tx.unitSnapshot.createMany({ data: snapshotData });
        }

        for (const unit of Object.values(resolvedUnits)) {
          const contentJson = JSON.stringify(unit);
          const ensuredUnit = await tx.unit.upsert({
            where: { id: unit.id },
            update: {},
            create: {
              id: unit.id,
              worldId: world.id
            }
          });

          await tx.unitState.upsert({
            where: { branchId_unitId: { branchId: oursBranch.id, unitId: ensuredUnit.id } },
            create: {
              id: nanoid(),
              branchId: oursBranch.id,
              unitId: ensuredUnit.id,
              contentJson
            },
            update: {
              contentJson
            }
          });
        }

        if (expectedHeadCommitId !== undefined) {
          const updated = await tx.branch.updateMany({
            where: { id: oursBranch.id, headCommitId: currentHeadCommitId },
            data: { headCommitId: nextMergeCommit.id }
          });
          if (updated.count === 0) {
            const latest = await tx.branch.findUnique({ where: { id: oursBranch.id } });
            throw headChangedError(oursBranch.name, expectedHeadCommitId, latest?.headCommitId ?? null);
          }
        } else {
          await tx.branch.update({ where: { id: oursBranch.id }, data: { headCommitId: nextMergeCommit.id } });
        }

        return nextMergeCommit;
      });

      return reply.status(201).send({ mergeCommitId: mergeCommit.id });
    } catch (error) {
      if (isErrorResponse(error)) {
        if (error.error.code === "HEAD_CHANGED") {
          return reply.status(409).send(error);
        }
        if (error.error.code === "BRANCH_NOT_FOUND") {
          return reply.status(404).send(error);
        }
      }
      throw error;
    }
  }
);

export const buildApp = async () => app;
