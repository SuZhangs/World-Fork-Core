import { execSync } from "node:child_process";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../../repo/prisma.js";

const jsonBody = (response: { body: string }) => JSON.parse(response.body);

describe.sequential("read APIs", () => {
  const context: { app?: Awaited<ReturnType<typeof buildApp>> } = {};

  beforeAll(async () => {
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
  });

  afterAll(async () => {
    await context.app?.close();
  });

  const createWorld = async (name: string) => {
    const response = await context.app!.inject({
      method: "POST",
      url: "/v1/worlds",
      payload: { name }
    });
    return jsonBody(response);
  };

  it("lists worlds with cursor pagination", async () => {
    await createWorld("World A");
    await createWorld("World B");

    const page1 = await context.app!.inject({
      method: "GET",
      url: "/v1/worlds?limit=1"
    });
    const page1Body = jsonBody(page1);
    expect(page1Body.items).toHaveLength(1);
    expect(page1Body.nextCursor).toBeTypeOf("string");

    const page2 = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds?limit=1&cursor=${page1Body.nextCursor}`
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
      payload: { name: "alt", sourceBranch: "main" }
    });

    const response = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/branches`
    });
    const body = jsonBody(response);
    expect(body.items.map((branch: { name: string }) => branch.name).sort()).toEqual(["alt", "main"]);
  });

  it("lists commits with cursor pagination", async () => {
    const world = await createWorld("Commit World");
    await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/commits`,
      payload: { branchName: "main", message: "Commit 1" }
    });
    await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/commits`,
      payload: { branchName: "main", message: "Commit 2" }
    });
    await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/commits`,
      payload: { branchName: "main", message: "Commit 3" }
    });

    const page1 = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/commits?limit=2`
    });
    const page1Body = jsonBody(page1);
    expect(page1Body.items).toHaveLength(2);
    expect(page1Body.items[0].parents).toBeInstanceOf(Array);
    expect(page1Body.nextCursor).toBeTypeOf("string");

    const page2 = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/commits?limit=2&cursor=${page1Body.nextCursor}`
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
      payload: { branchName: "main", unit: { type: "npc", title: "Guard", fields: { hp: 10 } } }
    });
    const unit1Body = jsonBody(unit1);
    await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/units`,
      payload: { branchName: "main", unit: { type: "npc", title: "Scout", fields: { hp: 8 } } }
    });

    const branchPage1 = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/units?ref=branch:main&limit=1&includeContent=true`
    });
    const branchPage1Body = jsonBody(branchPage1);
    expect(branchPage1Body.items).toHaveLength(1);
    expect(branchPage1Body.nextCursor).toBeTypeOf("string");

    const branchPage2 = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/units?ref=branch:main&limit=1&cursor=${branchPage1Body.nextCursor}`
    });
    const branchPage2Body = jsonBody(branchPage2);
    expect(branchPage2Body.items).toHaveLength(1);

    const commit = await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/commits`,
      payload: { branchName: "main", message: "Snapshot units" }
    });
    const commitBody = jsonBody(commit);

    await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/units`,
      payload: {
        branchName: "main",
        unit: { id: unit1Body.id, type: "npc", title: "Guard Updated", fields: { hp: 12 } }
      }
    });

    const commitUnits = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/units?ref=commit:${commitBody.id}&includeContent=true`
    });
    const commitUnitsBody = jsonBody(commitUnits);
    expect(commitUnitsBody.items).toHaveLength(2);
    expect(commitUnitsBody.items[0].fields).toBeDefined();

    const commitUnit = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/units/${unit1Body.id}?ref=commit:${commitBody.id}`
    });
    const commitUnitBody = jsonBody(commitUnit);
    expect(commitUnitBody.title).toBe("Guard");

    const branchUnit = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/units/${unit1Body.id}?ref=branch:main`
    });
    const branchUnitBody = jsonBody(branchUnit);
    expect(branchUnitBody.title).toBe("Guard Updated");

    const missing = await context.app!.inject({
      method: "GET",
      url: `/v1/worlds/${world.id}/units/missing?ref=branch:main`
    });
    expect(missing.statusCode).toBe(404);
    expect(jsonBody(missing).error.code).toBe("UNIT_NOT_FOUND");
  });
});
