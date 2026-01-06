import { nanoid } from "nanoid";
import { prisma } from "./prisma.js";

export const createWorld = async (name: string, description?: string | null) => {
  const world = await prisma.world.create({
    data: {
      id: nanoid(),
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

export const getWorld = (worldId: string) => prisma.world.findUnique({ where: { id: worldId } });
