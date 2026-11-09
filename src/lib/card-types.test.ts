import { afterEach, describe, expect, it, vi } from "vitest";
import { getReversibleOrientation, getStudyCardType } from "./card-types";

describe("vocabulary review direction", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the reversible view for existing vocabulary and basic cards in an opt-in language deck", () => {
    const deck = { mode: "languages" as const, config: { vocabDirection: "random" } };
    expect(getStudyCardType("vocabulary", deck)).toBe("reversible");
    expect(getStudyCardType("basic", deck)).toBe("reversible");
    expect(getStudyCardType("grammar_rule", deck)).toBe("grammar_rule");
    expect(getStudyCardType("diagram", deck)).toBe("diagram");
  });

  it("keeps stored card types for legacy directions and other deck modes", () => {
    for (const direction of ["normal", "reversed", "both"]) {
      expect(getStudyCardType("vocabulary", {
        mode: "languages",
        config: { vocabDirection: direction },
      })).toBe("vocabulary");
    }
    expect(getStudyCardType("vocabulary", { mode: "languages", config: null })).toBe("vocabulary");
    expect(getStudyCardType("basic", { mode: "classic", config: { vocabDirection: "random" } })).toBe("basic");
    expect(getStudyCardType("reversible")).toBe("reversible");
  });

  it("can show either face first", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0.75).mockReturnValueOnce(0.25);
    expect([getReversibleOrientation(), getReversibleOrientation()]).toEqual([true, false]);
  });
});
