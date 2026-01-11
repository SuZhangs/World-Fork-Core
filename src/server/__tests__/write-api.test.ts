import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../../repo/prisma.js";

const jsonBody = (response: { body: string }) => JSON.parse(response.body);

describe.sequential("write APIs", () => {
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

  const createWorld = async (name: string) => {
    const response = await context.app!.inject({
      method: "POST",
      url: "/v1/worlds",
      payload: { name },
      headers: { "x-api-key": context.apiKey }
    });
    return jsonBody(response);
  };

  it("returns HEAD_CHANGED when concurrent commits race", async () => {
    const world = await createWorld("Commit Conflict World");
    const baseCommit = await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/commits`,
      payload: { branchName: "main", message: "Base" },
      headers: { "x-api-key": context.apiKey }
    });
    const baseCommitBody = jsonBody(baseCommit);

    const [resultA, resultB] = await Promise.allSettled([
      context.app!.inject({
        method: "POST",
        url: `/v1/worlds/${world.id}/commits`,
        payload: {
          branchName: "main",
          message: "Concurrent A",
          expectedHeadCommitId: baseCommitBody.id
        },
        headers: { "x-api-key": context.apiKey }
      }),
      context.app!.inject({
        method: "POST",
        url: `/v1/worlds/${world.id}/commits`,
        payload: {
          branchName: "main",
          message: "Concurrent B",
          expectedHeadCommitId: baseCommitBody.id
        },
        headers: { "x-api-key": context.apiKey }
      })
    ]);

    const responses = [resultA, resultB]
      .filter((result) => result.status === "fulfilled")
      .map((result) => (result.status === "fulfilled" ? result.value : null));
    const success = responses.find((response) => response?.statusCode === 201);
    const conflict = responses.find((response) => response?.statusCode === 409);

    expect(success).toBeDefined();
    expect(conflict).toBeDefined();

    const successBody = jsonBody(success!);
    const conflictBody = jsonBody(conflict!);

    expect(conflictBody.error.code).toBe("HEAD_CHANGED");
    expect(conflictBody.error.details.expected).toBe(baseCommitBody.id);
    expect(conflictBody.error.details.actual).toBe(successBody.id);
  });

  it("returns HEAD_CHANGED when merge apply uses a stale head", async () => {
    const world = await createWorld("Merge Conflict World");
    const unit = await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/units`,
      payload: { branchName: "main", unit: { type: "npc", title: "Guard", fields: { hp: 10 } } },
      headers: { "x-api-key": context.apiKey }
    });
    const unitBody = jsonBody(unit);

    const baseCommit = await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/commits`,
      payload: { branchName: "main", message: "Base" },
      headers: { "x-api-key": context.apiKey }
    });
    const baseCommitBody = jsonBody(baseCommit);

    await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/branches`,
      payload: { name: "feature", sourceBranch: "main" },
      headers: { "x-api-key": context.apiKey }
    });

    await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/units`,
      payload: {
        branchName: "feature",
        unit: { id: unitBody.id, type: "npc", title: "Guard (Feature)", fields: { hp: 12 } }
      },
      headers: { "x-api-key": context.apiKey }
    });

    await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/commits`,
      payload: { branchName: "feature", message: "Feature update" },
      headers: { "x-api-key": context.apiKey }
    });

    const newHeadCommit = await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/commits`,
      payload: { branchName: "main", message: "Main update" },
      headers: { "x-api-key": context.apiKey }
    });
    const newHeadCommitBody = jsonBody(newHeadCommit);

    const mergeApply = await context.app!.inject({
      method: "POST",
      url: `/v1/worlds/${world.id}/merge`,
      payload: {
        oursBranch: "main",
        theirsBranch: "feature",
        expectedHeadCommitId: baseCommitBody.id,
        resolutions: []
      },
      headers: { "x-api-key": context.apiKey }
    });

    expect(mergeApply.statusCode).toBe(409);
    const mergeBody = jsonBody(mergeApply);
    expect(mergeBody.error.code).toBe("HEAD_CHANGED");
    expect(mergeBody.error.details.expected).toBe(baseCommitBody.id);
    expect(mergeBody.error.details.actual).toBe(newHeadCommitBody.id);
  });
});
