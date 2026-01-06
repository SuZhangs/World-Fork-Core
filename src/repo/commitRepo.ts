import { nanoid } from "nanoid";
import { prisma } from "./prisma.js";

export const createCommit = async (
  worldId: string,
  message: string,
  parentCommitId?: string | null,
  parentCommitId2?: string | null
) => {
  return prisma.commit.create({
    data: {
      id: nanoid(),
      worldId,
      message,
      parentCommitId: parentCommitId ?? null,
      parentCommitId2: parentCommitId2 ?? null
    }
  });
};

export const getCommit = (commitId: string) => prisma.commit.findUnique({ where: { id: commitId } });

export const getCommitAncestors = async (commitId: string): Promise<Set<string>> => {
  const visited = new Set<string>();
  const stack = [commitId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    const commit = await prisma.commit.findUnique({ where: { id: current } });
    if (commit?.parentCommitId) {
      stack.push(commit.parentCommitId);
    }
    if (commit?.parentCommitId2) {
      stack.push(commit.parentCommitId2);
    }
  }

  return visited;
};

export const findCommonAncestor = async (commitA?: string | null, commitB?: string | null) => {
  if (!commitA || !commitB) {
    return null;
  }
  const ancestorsA = await getCommitAncestors(commitA);
  const queue = [commitB];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    if (ancestorsA.has(current)) {
      return current;
    }
    visited.add(current);
    const commit = await prisma.commit.findUnique({ where: { id: current } });
    if (commit?.parentCommitId) {
      queue.push(commit.parentCommitId);
    }
    if (commit?.parentCommitId2) {
      queue.push(commit.parentCommitId2);
    }
  }

  return null;
};
