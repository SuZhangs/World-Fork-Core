import { describe, expect, it } from "vitest";
import { errorResponse } from "../errors.js";
import { parseRef } from "../ref.js";

describe("parseRef", () => {
  it("parses branch refs", () => {
    expect(parseRef("branch:main")).toEqual({ type: "branch", id: "main" });
  });

  it("parses commit refs", () => {
    expect(parseRef("commit:commit_123")).toEqual({ type: "commit", id: "commit_123" });
  });

  it("returns null for invalid refs", () => {
    expect(parseRef("main")).toBeNull();
    expect(parseRef("branch:")).toBeNull();
    expect(parseRef("tag:main")).toBeNull();
  });
});

describe("errorResponse", () => {
  it("returns a not-found error payload", () => {
    expect(errorResponse("WORLD_NOT_FOUND", "World not found")).toEqual({
      error: {
        code: "WORLD_NOT_FOUND",
        message: "World not found",
        details: undefined
      }
    });
  });
});
