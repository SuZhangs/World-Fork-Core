import { describe, expect, it } from "vitest";
import { diffUnits } from "../diff.js";
import { UnitContent } from "../types.js";

describe("diffUnits", () => {
  it("outputs JSON Pointer paths for changed fields", () => {
    const base: Record<string, UnitContent> = {
      unitA: {
        id: "unitA",
        type: "npc",
        title: "Old",
        fields: { hp: 10, stats: { str: 1 } }
      }
    };

    const next: Record<string, UnitContent> = {
      unitA: {
        id: "unitA",
        type: "npc",
        title: "New",
        fields: { hp: 11, stats: { str: 2 } }
      }
    };

    const changes = diffUnits(base, next);
    const paths = changes.map((change) => change.path).sort();

    expect(paths).toEqual(["/fields/hp", "/fields/stats/str", "/title"].sort());
  });

  it("escapes tokens with slashes and tildes", () => {
    const base: Record<string, UnitContent> = {
      unitA: {
        id: "unitA",
        type: "npc",
        title: "Old",
        fields: { "a/b": 1, "x~y": 2 }
      }
    };

    const next: Record<string, UnitContent> = {
      unitA: {
        id: "unitA",
        type: "npc",
        title: "Old",
        fields: { "a/b": 2, "x~y": 3 }
      }
    };

    const changes = diffUnits(base, next);
    const paths = changes.map((change) => change.path);

    expect(paths).toEqual(expect.arrayContaining(["/fields/a~1b", "/fields/x~0y"]));
  });
});
