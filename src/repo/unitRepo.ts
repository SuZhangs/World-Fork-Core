import { nanoid } from "nanoid";
import { UnitContent } from "../core/types.js";
import { prisma } from "./prisma.js";

export const upsertUnitState = async (
  worldId: string,
  branchId: string,
  content: UnitContent
) => {
  const contentJson = JSON.stringify(content);
  const unit = await prisma.unit.upsert({
    where: { id: content.id },
    update: {},
    create: {
      id: content.id,
      worldId
    }
  });

  await prisma.unitState.upsert({
    where: { branchId_unitId: { branchId, unitId: unit.id } },
    create: {
      id: nanoid(),
      branchId,
      unitId: unit.id,
      contentJson
    },
    update: {
      contentJson
    }
  });

  return unit;
};

export const getBranchUnitStates = async (branchId: string) => {
  const states = await prisma.unitState.findMany({ where: { branchId } });
  const units: Record<string, UnitContent> = {};
  for (const state of states) {
    units[state.unitId] = JSON.parse(state.contentJson) as UnitContent;
  }
  return units;
};

export const getCommitUnitSnapshots = async (commitId: string) => {
  const snapshots = await prisma.unitSnapshot.findMany({ where: { commitId } });
  const units: Record<string, UnitContent> = {};
  for (const snapshot of snapshots) {
    units[snapshot.unitId] = JSON.parse(snapshot.contentJson) as UnitContent;
  }
  return units;
};

export const listUnitsByBranch = async (branchId: string, type?: string) => {
  const states = await prisma.unitState.findMany({ where: { branchId } });
  return states
    .map((state) => JSON.parse(state.contentJson) as UnitContent)
    .filter((unit) => (type ? unit.type === type : true));
};

export const listUnitsByCommit = async (commitId: string, type?: string) => {
  const snapshots = await prisma.unitSnapshot.findMany({ where: { commitId } });
  return snapshots
    .map((snapshot) => JSON.parse(snapshot.contentJson) as UnitContent)
    .filter((unit) => (type ? unit.type === type : true));
};

export const getUnitByBranch = async (branchId: string, unitId: string) => {
  const state = await prisma.unitState.findUnique({ where: { branchId_unitId: { branchId, unitId } } });
  return state ? (JSON.parse(state.contentJson) as UnitContent) : null;
};

export const getUnitByCommit = async (commitId: string, unitId: string) => {
  const snapshot = await prisma.unitSnapshot.findFirst({ where: { commitId, unitId } });
  return snapshot ? (JSON.parse(snapshot.contentJson) as UnitContent) : null;
};

export const listUnitsPagedByBranch = async (
  branchId: string,
  limit: number,
  cursor?: string,
  includeContent = false
) => {
  const states = await prisma.unitState.findMany({
    where: {
      branchId,
      ...(cursor ? { unitId: { gt: cursor } } : {})
    },
    orderBy: { unitId: "asc" },
    take: limit + 1
  });

  const hasNext = states.length > limit;
  const pageStates = hasNext ? states.slice(0, limit) : states;
  const nextCursor = hasNext ? pageStates[pageStates.length - 1]?.unitId ?? null : null;

  const items = pageStates.map((state) => {
    const content = JSON.parse(state.contentJson) as UnitContent;
    if (includeContent) {
      return { ...content, updatedAt: state.createdAt.toISOString() };
    }
    return {
      id: content.id,
      type: content.type,
      title: content.title,
      updatedAt: state.createdAt.toISOString()
    };
  });

  return { items, nextCursor };
};

export const listUnitsPagedByCommit = async (
  commitId: string,
  limit: number,
  cursor?: string,
  includeContent = false
) => {
  const snapshots = await prisma.unitSnapshot.findMany({
    where: {
      commitId,
      ...(cursor ? { unitId: { gt: cursor } } : {})
    },
    orderBy: { unitId: "asc" },
    take: limit + 1
  });

  const hasNext = snapshots.length > limit;
  const pageSnapshots = hasNext ? snapshots.slice(0, limit) : snapshots;
  const nextCursor = hasNext ? pageSnapshots[pageSnapshots.length - 1]?.unitId ?? null : null;

  const items = pageSnapshots.map((snapshot) => {
    const content = JSON.parse(snapshot.contentJson) as UnitContent;
    if (includeContent) {
      return { ...content, updatedAt: snapshot.createdAt.toISOString() };
    }
    return {
      id: content.id,
      type: content.type,
      title: content.title,
      updatedAt: snapshot.createdAt.toISOString()
    };
  });

  return { items, nextCursor };
};

export const getUnitByBranchWithMeta = async (branchId: string, unitId: string) => {
  const state = await prisma.unitState.findUnique({ where: { branchId_unitId: { branchId, unitId } } });
  if (!state) {
    return null;
  }
  const content = JSON.parse(state.contentJson) as UnitContent;
  return { ...content, updatedAt: state.createdAt.toISOString() };
};

export const getUnitByCommitWithMeta = async (commitId: string, unitId: string) => {
  const snapshot = await prisma.unitSnapshot.findFirst({ where: { commitId, unitId } });
  if (!snapshot) {
    return null;
  }
  const content = JSON.parse(snapshot.contentJson) as UnitContent;
  return { ...content, updatedAt: snapshot.createdAt.toISOString() };
};
