import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../../repo/prisma.js";

const jsonBody = (response: { body: string }) => JSON.parse(response.body);

describe.sequential("read APIs", () => {
  const context: {
    app?: Awaited<ReturnType<typeof buildApp>>;
    apiKey?: string;
    tenantId?: string;
  } = {};

  beforeAll(async () => {
    process.env.WORLDFORK_AUTH = "on";
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
    context.app = await buildApp();
    await context.app.ready();
  });

  beforeEach(async () => {
    await prisma.unitState.deleteMany();
    await prisma.unitSnapshot.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.commit.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.world.deleteMany();
    await prisma.apiKey.deleteMany();
    context.tenantId = "tenant-test";
    context.apiKey = "wf_test_key";
    await prisma.apiKey.create({
      data: {
        tenantId: context.tenantId,
        name: "Test Key",
        keyHash: createHash("sha256").update(context.apiKey).digest("hex")
      }
    });
  });

  afterAll(async () => {
    await context.app?.close();
  });

  const createWorld = async (name: string, apiKey = context.apiKey) => {
    const response = await context.app!.inject({
      method: "POST",
      url: "/v1/worlds",
      payload: { name },
      headers: { "x-api-key": apiKey }
    });
    return jsonBody(response);
  };

  it("rejects requests without an API key", async () => {
    const response = await context.app!.inject({
      method: "GET",
      url: "/v1/worlds"
    });
    expect(response.statusCode).toBe(401);
    expect(jsonBody(response).error.code).toBe("AUTH_REQUIRED");
  });

  it("rejects requests with an invalid API key", async () => {
    const response = await context.app!.inject({
      method: "GET",
      url: "/v1/worlds",
      headers: { "x-api-key": "wf_invalid_key" }
    });
    expect(response.statusCode).toBe(401);
    expect(jsonBody(response).error.code).toBe("INVALID_API_KEY");
  });

  it("lists worlds with cursor pagination", async () => {
    await createWorld("World A");
    await createWorld("World B");

    const page1 = await context.app!.inject({
      method: "GET",
      url: "/v1/worlds?limit=1",
      headers: { "x-api-key": context.apiKey }
    });
    const page1Body = jsonBody(page1);
    expect(page1Body.items).toHaveLength(1);
    expect(page1Body.nextCursor).toBeTypeOf("string");

    const page2 = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds?limit=1&cursor=${page1Body.nextCursor}`,
      headers: { "x-api-key": context.apiKey }
    });
    const page2Body = jsonBody(page2);
    expect(page2Body.items).toHaveLength(1);
    expect(page2Body.nextCursor).toBeNull();
  });

  it("lists branches for a world", async () => {
    const world = await createWorld("Branch World");
    await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/branches`,
      payload: { name: "alt", sourceBranch: "main" },
      headers: { "x-api-key": context.apiKey }
    });

    const response = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/branches`,
      headers: { "x-api-key": context.apiKey }
    });
    const body = jsonBody(response);
    expect(body.items.map((branch: { name: string }) => branch.name).sort()).toEqual(["alt", "main"]);
  });

  it("lists commits with cursor pagination", async () => {
    const world = await createWorld("Commit World");
    await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/commits`,
      payload: { branchName: "main", message: "Commit 1" },
      headers: { "x-api-key": context.apiKey }
    });
    await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/commits`,
      payload: { branchName: "main", message: "Commit 2" },
      headers: { "x-api-key": context.apiKey }
    });
    await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/commits`,
      payload: { branchName: "main", message: "Commit 3" },
      headers: { "x-api-key": context.apiKey }
    });

    const page1 = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/commits?limit=2`,
      headers: { "x-api-key": context.apiKey }
    });
    const page1Body = jsonBody(page1);
    expect(page1Body.items).toHaveLength(2);
    expect(page1Body.items[0].parents).toBeInstanceOf(Array);
    expect(page1Body.nextCursor).toBeTypeOf("string");

    const page2 = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/commits?limit=2&cursor=${page1Body.nextCursor}`,
      headers: { "x-api-key": context.apiKey }
    });
    const page2Body = jsonBody(page2);
    expect(page2Body.items).toHaveLength(1);
    expect(page2Body.nextCursor).toBeNull();
  });

  it("lists units by branch/commit and supports getUnit", async () => {
    const world = await createWorld("Unit World");
    const unit1 = await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/units`,
      payload: { branchName: "main", unit: { type: "npc", title: "Guard", fields: { hp: 10 } } },
      headers: { "x-api-key": context.apiKey }
    });
    const unit1Body = jsonBody(unit1);
    await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/units`,
      payload: { branchName: "main", unit: { type: "npc", title: "Scout", fields: { hp: 8 } } },
      headers: { "x-api-key": context.apiKey }
    });

    const branchPage1 = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/units?ref=branch:main&limit=1&includeContent=true`,
      headers: { "x-api-key": context.apiKey }
    });
    const branchPage1Body = jsonBody(branchPage1);
    expect(branchPage1Body.items).toHaveLength(1);
    expect(branchPage1Body.nextCursor).toBeTypeOf("string");

    const branchPage2 = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/units?ref=branch:main&limit=1&cursor=${branchPage1Body.nextCursor}`,
      headers: { "x-api-key": context.apiKey }
    });
    const branchPage2Body = jsonBody(branchPage2);
    expect(branchPage2Body.items).toHaveLength(1);

    const commit = await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/commits`,
      payload: { branchName: "main", message: "Snapshot units" },
      headers: { "x-api-key": context.apiKey }
    });
    const commitBody = jsonBody(commit);

    await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/units`,
      payload: {
        branchName: "main",
        unit: { id: unit1Body.id, type: "npc", title: "Guard Updated", fields: { hp: 12 } }
      },
      headers: { "x-api-key": context.apiKey }
    });

    const commitUnits = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/units?ref=commit:${commitBody.id}&includeContent=true`,
      headers: { "x-api-key": context.apiKey }
    });
    const commitUnitsBody = jsonBody(commitUnits);
    expect(commitUnitsBody.items).toHaveLength(2);
    expect(commitUnitsBody.items[0].fields).toBeDefined();

    const commitUnit = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/units/${unit1Body.id}?ref=commit:${commitBody.id}`,
      headers: { "x-api-key": context.apiKey }
    });
    const commitUnitBody = jsonBody(commitUnit);
    expect(commitUnitBody.title).toBe("Guard");

    const branchUnit = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/units/${unit1Body.id}?ref=branch:main`,
      headers: { "x-api-key": context.apiKey }
    });
    const branchUnitBody = jsonBody(branchUnit);
    expect(branchUnitBody.title).toBe("Guard Updated");

    const missing = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/units/missing?ref=branch:main`,
      headers: { "x-api-key": context.apiKey }
    });
    expect(missing.statusCode).toBe(404);
    expect(jsonBody(missing).error.code).toBe("UNIT_NOT_FOUND");
  });

  it("isolates tenants by worldId", async () => {
    const tenantAKey = context.apiKey!;
    const tenantBKey = "wf_tenant_b_key";
    await prisma.apiKey.create({
      data: {
        tenantId: "tenant-b",
        name: "Tenant B",
        keyHash: createHash("sha256").update(tenantBKey).digest("hex")
      }
    });

    const world = await createWorld("Tenant A World", tenantAKey);

    const otherTenantWorld = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}`,
      headers: { "x-api-key": tenantBKey }
    });
    expect(otherTenantWorld.statusCode).toBe(404);
    expect(jsonBody(otherTenantWorld).error.code).toBe("WORLD_NOT_FOUND");

    const otherTenantBranches = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/branches`,
      headers: { "x-api-key": tenantBKey }
    });
    expect(otherTenantBranches.statusCode).toBe(404);
    expect(jsonBody(otherTenantBranches).error.code).toBe("WORLD_NOT_FOUND");

    const otherTenantUnits = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/units?ref=branch:main`,
      headers: { "x-api-key": tenantBKey }
    });
    expect(otherTenantUnits.statusCode).toBe(404);
    expect(jsonBody(otherTenantUnits).error.code).toBe("WORLD_NOT_FOUND");

    const otherTenantCommit = await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/commits`,
      payload: { branchName: "main", message: "Should be blocked" },
      headers: { "x-api-key": tenantBKey }
    });
    expect(otherTenantCommit.statusCode).toBe(404);
    expect(jsonBody(otherTenantCommit).error.code).toBe("WORLD_NOT_FOUND");
  });
});
