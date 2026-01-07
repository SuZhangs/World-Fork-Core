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
