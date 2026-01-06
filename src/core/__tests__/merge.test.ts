import { describe, expect, it } from "vitest";
import { mergeUnits } from "../merge.js";
import { UnitContent } from "../types.js";

describe("mergeUnits", () => {
  it("detects conflicts and merges non-conflicting fields", () => {
    const base: Record<string, UnitContent> = {
      unitA: {
        id: "unitA",
        type: "npc",
        title: "Base",
        fields: { hp: 10, mood: "calm" }
      }
    };

    const ours: Record<string, UnitContent> = {
      unitA: {
        id: "unitA",
        type: "npc",
        title: "Ours",
        fields: { hp: 12, mood: "calm" }
      }
    };

    const theirs: Record<string, UnitContent> = {
      unitA: {
        id: "unitA",
        type: "npc",
        title: "Theirs",
        fields: { hp: 10, mood: "angry" }
      }
    };

    const result = mergeUnits(base, ours, theirs);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        {
          unitId: "unitA",
          path: "/title",
          base: "Base",
          ours: "Ours",
          theirs: "Theirs"
        }
      ])
    );

    expect(result.mergedUnits.unitA.fields.hp).toBe(12);
    expect(result.mergedUnits.unitA.fields.mood).toBe("angry");
  });
});
