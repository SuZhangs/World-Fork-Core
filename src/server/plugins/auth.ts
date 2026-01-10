import { createHash } from "node:crypto";
import { prisma } from "../../repo/prisma.js";
import { errorResponse } from "../errors.js";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    tenantId: string;
  }
}

const isAuthEnabled = () => (process.env.WORLDFORK_AUTH ?? "on") !== "off";

const getRequestPath = (url?: string) => (url ? url.split("?")[0] : "");

const getDefaultTenantId = () => process.env.WORLDFORK_TENANT_ID ?? "local";

export const registerAuth = async (app: FastifyInstance) => {
  app.decorateRequest("tenantId", "");

  app.addHook("preHandler", async (request, reply) => {
    const path = getRequestPath(request.raw.url ?? request.url);

    if (path === "/openapi.json" || path.startsWith("/docs") || path === "/health") {
      if (!isAuthEnabled()) {
        request.tenantId = getDefaultTenantId();
      }
      return;
    }

    if (!path.startsWith("/v1/")) {
      if (!isAuthEnabled()) {
        request.tenantId = getDefaultTenantId();
      }
      return;
    }

    if (!isAuthEnabled()) {
      request.tenantId = getDefaultTenantId();
      return;
    }

    const apiKeyHeader = request.headers["x-api-key"];
    if (!apiKeyHeader || typeof apiKeyHeader !== "string" || apiKeyHeader.trim() === "") {
      return reply.status(401).send(errorResponse("AUTH_REQUIRED", "API key required"));
    }

    const keyHash = createHash("sha256").update(apiKeyHeader).digest("hex");
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        keyHash,
        revokedAt: null
      }
    });

    if (!apiKey) {
      return reply.status(401).send(errorResponse("INVALID_API_KEY", "Invalid API key"));
    }

    request.tenantId = apiKey.tenantId;
  });
};
