import { nanoid } from "nanoid";
import { prisma } from "./prisma.js";

export const createWorld = async (tenantId: string, name: string, description?: string | null) => {
  const world = await prisma.world.create({
    data: {
      id: nanoid(),
      tenantId,
      name,
      description
    }
  });

  await prisma.branch.create({
    data: {
      id: nanoid(),
      worldId: world.id,
      name: "main"
    }
  });

  return world;
};

export const getWorld = (worldId: string, tenantId: string) =>
  prisma.world.findFirst({ where: { id: worldId, tenantId } });

export const listWorlds = (tenantId: string) =>
  prisma.world.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" }
  });

export const listWorldsPaged = async (tenantId: string, limit: number, cursor?: string) => {
  const where = cursor ? { id: { lt: cursor }, tenantId } : { tenantId };
  const worlds = await prisma.world.findMany({
    where,
    orderBy: { id: "desc" },
    take: limit + 1
  });

  const hasNext = worlds.length > limit;
  const items = hasNext ? worlds.slice(0, limit) : worlds;
  const nextCursor = hasNext ? items[items.length - 1]?.id ?? null : null;

  return { items, nextCursor };
};

export const getWorldWithBranches = (worldId: string, tenantId: string) =>
  prisma.world.findFirst({
    where: { id: worldId, tenantId },
    include: {
      branches: {
        include: {
          headCommit: true
        },
        orderBy: { createdAt: "desc" }
      }
    }
  });
