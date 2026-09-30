import { describe, expect, it } from "vitest";
import { getReadingAssistance, scoreFluencyRun } from "./assistance.ts";

describe("reading assistance and fluency", () => {
  it("fades romaji from new through learning to familiar without persistent help", () => {
    expect(getReadingAssistance({ lifecycle: "INTRODUCED", familiarity: 0 }).showRomaji).toBe(true);
    expect(getReadingAssistance({ lifecycle: "LEARNING", familiarity: 2 }).showRomaji).toBe(false);
    expect(getReadingAssistance({ lifecycle: "MASTERED", familiarity: 5 }, true).showRomaji).toBe(true);
    expect(getReadingAssistance({ lifecycle: "MASTERED", familiarity: 5 }).showRomaji).toBe(false);
  });

  it("shows completion time only after a fully correct run", () => {
    expect(scoreFluencyRun([true, true, false], 1200)).toMatchObject({ correct: 2, total: 3, accuracy: 2 / 3, complete: false });
    expect(scoreFluencyRun([true, true, true], 1200)).toMatchObject({ accuracy: 1, complete: true, elapsedMs: 1200 });
    expect(scoreFluencyRun([], 1200).elapsedMs).toBeUndefined();
  });
});
