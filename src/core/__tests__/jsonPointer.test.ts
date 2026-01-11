import { describe, expect, it } from "vitest";
import { escapeToken, fromPointer, toPointer, unescapeToken } from "../jsonPointer.js";

describe("jsonPointer", () => {
  it("escapes and unescapes tokens", () => {
    expect(escapeToken("a/b")).toBe("a~1b");
    expect(escapeToken("x~y")).toBe("x~0y");
    expect(unescapeToken("a~1b")).toBe("a/b");
    expect(unescapeToken("x~0y")).toBe("x~y");
  });

  it("builds pointers from tokens", () => {
    expect(toPointer([])).toBe("");
    expect(toPointer(["fields", "a/b", "x~y"])).toBe("/fields/a~1b/x~0y");
    expect(toPointer(["0", "name"])).toBe("/0/name");
  });

  it("parses pointers into tokens", () => {
    expect(fromPointer("")).toEqual([]);
    expect(fromPointer("/fields/a~1b/x~0y")).toEqual(["fields", "a/b", "x~y"]);
    expect(fromPointer("/0/name")).toEqual(["0", "name"]);
  });
});
