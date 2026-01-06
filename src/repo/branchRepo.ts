import { nanoid } from "nanoid";
import { prisma } from "./prisma.js";

export const getBranch = (worldId: string, name: string) =>
  prisma.branch.findUnique({ where: { worldId_name: { worldId, name } } });

export const createBranch = async (
  worldId: string,
  name: string,
  sourceCommitId?: string | null
) => {
  const branch = await prisma.branch.create({
    data: {
      id: nanoid(),
      worldId,
      name,
      headCommitId: sourceCommitId ?? null
    }
  });

  if (sourceCommitId) {
    const snapshots = await prisma.unitSnapshot.findMany({
      where: { commitId: sourceCommitId }
    });

    if (snapshots.length > 0) {
      await prisma.unitState.createMany({
        data: snapshots.map((snapshot) => ({
          id: nanoid(),
          branchId: branch.id,
          unitId: snapshot.unitId,
          contentJson: snapshot.contentJson
        }))
      });
    }
  }

  return branch;
};

export const updateBranchHead = (branchId: string, commitId: string) =>
  prisma.branch.update({ where: { id: branchId }, data: { headCommitId: commitId } });
