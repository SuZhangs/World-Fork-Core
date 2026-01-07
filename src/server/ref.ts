export type Ref = { type: "branch" | "commit"; id: string };

export const parseRef = (value: string | undefined): Ref | null => {
  if (!value) {
    return null;
  }
  const separatorIndex = value.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }
  const type = value.slice(0, separatorIndex);
  const id = value.slice(separatorIndex + 1);
  if (!type || !id) {
    return null;
  }
  if (type !== "branch" && type !== "commit") {
    return null;
  }
  return { type, id };
};
