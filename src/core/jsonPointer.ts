export const escapeToken = (token: string): string => token.replace(/~/g, "~0").replace(/\//g, "~1");

export const unescapeToken = (token: string): string => token.replace(/~1/g, "/").replace(/~0/g, "~");

export const toPointer = (tokens: string[]): string =>
  tokens.length === 0 ? "" : `/${tokens.map(escapeToken).join("/")}`;

export const fromPointer = (pointer: string): string[] => {
  if (pointer === "") {
    return [];
  }
  if (!pointer.startsWith("/")) {
    throw new Error("Invalid JSON Pointer");
  }
  return pointer
    .slice(1)
    .split("/")
    .map((token) => unescapeToken(token));
};
