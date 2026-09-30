import { describe, expect, it } from "vitest";
import { matchesRecallAnswer, normalizeRecallAnswer } from "./answers.ts";

describe("review answer handling", () => {
  it("accepts spacing, case, and Unicode typography variants for meanings", () => {
    expect(matchesRecallAnswer("  CAT  ", ["cat"], "meaning")).toBe(true);
    expect(normalizeRecallAnswer("Ａ　cat", "meaning")).toBe("a cat");
  });
  it("normalizes canonical Japanese Unicode while preserving compatibility and lexical distinctions", () => {
    expect(matchesRecallAnswer("  カ\u3099 " , ["ガ"], "japanese")).toBe(true);
    expect(matchesRecallAnswer("ｶﾞ", ["ガ"], "japanese")).toBe(false);
    expect(matchesRecallAnswer("ねこ", ["猫"], "japanese")).toBe(false);
    expect(matchesRecallAnswer("はし", ["橋"], "japanese")).toBe(false);
  });
  it("never treats an empty answer as a match", () => {
    expect(matchesRecallAnswer("   ", ["cat"], "meaning")).toBe(false);
  });
});
