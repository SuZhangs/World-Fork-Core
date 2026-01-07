export type UnitContent = {
  id: string;
  type: string;
  title: string;
  fields: Record<string, unknown>;
  refs?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

export type World = {
  id: string;
  name: string;
  description?: string | null;
  createdAt: Date;
};

export type Branch = {
  id: string;
  worldId: string;
  name: string;
  headCommitId?: string | null;
  createdAt: Date;
};

export type Commit = {
  id: string;
  worldId: string;
  message: string;
  parentCommitId?: string | null;
  parentCommitId2?: string | null;
  createdAt: Date;
};

export type DiffChange = {
  unitId: string;
  path: string;
  from: unknown;
  to: unknown;
};

export type MergeConflict = {
  unitId: string;
  path: string;
  base: unknown;
  ours: unknown;
  theirs: unknown;
};

export type MergeResult = {
  mergedUnits: Record<string, UnitContent>;
  conflicts: MergeConflict[];
};
