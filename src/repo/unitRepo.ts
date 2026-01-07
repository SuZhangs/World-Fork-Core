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
