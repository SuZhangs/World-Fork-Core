import { MergeConflict, MergeResult, UnitContent } from "./types.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

const isEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return true;
  }
  if (isArray(a) && isArray(b)) {
    return a.length === b.length && a.every((item, index) => isEqual(item, b[index]));
  }
  if (isObject(a) && isObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!isEqual(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }
  return false;
};

const joinPath = (base: string, key: string | number): string =>
  base === "" ? `/${String(key)}` : `${base}/${String(key)}`;

type MergeNodeResult = {
  value: unknown;
  conflicts: MergeConflict[];
};

const mergeValues = (
  base: unknown,
  ours: unknown,
  theirs: unknown,
  path: string,
  unitId: string
): MergeNodeResult => {
  if (isEqual(ours, theirs)) {
    return { value: ours, conflicts: [] };
  }

  if (isEqual(base, ours)) {
    return { value: theirs, conflicts: [] };
  }

  if (isEqual(base, theirs)) {
    return { value: ours, conflicts: [] };
  }

  if (isArray(base) && isArray(ours) && isArray(theirs)) {
    const maxLength = Math.max(base.length, ours.length, theirs.length);
    const merged: unknown[] = [];
    const conflicts: MergeConflict[] = [];
    for (let i = 0; i < maxLength; i += 1) {
      const result = mergeValues(base[i], ours[i], theirs[i], joinPath(path, i), unitId);
      merged[i] = result.value;
      conflicts.push(...result.conflicts);
    }
    return { value: merged, conflicts };
  }

  if (isObject(base) && isObject(ours) && isObject(theirs)) {
    const keys = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
    const merged: Record<string, unknown> = {};
    const conflicts: MergeConflict[] = [];
    for (const key of keys) {
      const result = mergeValues(base[key], ours[key], theirs[key], joinPath(path, key), unitId);
      if (result.value !== undefined) {
        merged[key] = result.value;
      }
      conflicts.push(...result.conflicts);
    }
    return { value: merged, conflicts };
  }

  return {
    value: ours,
    conflicts: [
      {
        unitId,
        path,
        base,
        ours,
        theirs
      }
    ]
  };
};

export const mergeUnits = (
  baseUnits: Record<string, UnitContent>,
  ourUnits: Record<string, UnitContent>,
  theirUnits: Record<string, UnitContent>
): MergeResult => {
  const mergedUnits: Record<string, UnitContent> = {};
  const conflicts: MergeConflict[] = [];
  const unitIds = new Set([
    ...Object.keys(baseUnits),
    ...Object.keys(ourUnits),
    ...Object.keys(theirUnits)
  ]);

  for (const unitId of unitIds) {
    const base = baseUnits[unitId];
    const ours = ourUnits[unitId];
    const theirs = theirUnits[unitId];

    const result = mergeValues(base, ours, theirs, "", unitId);
    if (result.value !== undefined) {
      mergedUnits[unitId] = result.value as UnitContent;
    }
    conflicts.push(...result.conflicts);
  }

  return { mergedUnits, conflicts };
};
