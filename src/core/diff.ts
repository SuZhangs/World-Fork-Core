import { DiffChange, UnitContent } from "./types.js";

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

const diffValues = (from: unknown, to: unknown, path: string, changes: DiffChange[], unitId: string) => {
  if (isEqual(from, to)) {
    return;
  }
  if (isArray(from) && isArray(to)) {
    const maxLength = Math.max(from.length, to.length);
    for (let i = 0; i < maxLength; i += 1) {
      diffValues(from[i], to[i], joinPath(path, i), changes, unitId);
    }
    return;
  }
  if (isObject(from) && isObject(to)) {
    const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
    for (const key of keys) {
      diffValues(from[key], to[key], joinPath(path, key), changes, unitId);
    }
    return;
  }
  changes.push({ unitId, path, from, to });
};

export const diffUnits = (
  fromUnits: Record<string, UnitContent>,
  toUnits: Record<string, UnitContent>
): DiffChange[] => {
  const changes: DiffChange[] = [];
  const unitIds = new Set([...Object.keys(fromUnits), ...Object.keys(toUnits)]);

  for (const unitId of unitIds) {
    const fromUnit = fromUnits[unitId];
    const toUnit = toUnits[unitId];
    diffValues(fromUnit, toUnit, "", changes, unitId);
  }

  return changes;
};
