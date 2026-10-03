import { describe, expect, it } from "vitest";
import { buildDailyQueue, filterEligibleDueCards } from "./daily-queue.ts";

describe("daily study queue", () => {
  const materials = Array.from({ length: 8 }, (_, order) => ({ conceptId: `c${order}`, cardIds: [`c${order}-card`], order }));
  it("ignores retired due card state while retaining eligible recognition reviews", () => {
    const due = [
      { conceptId: "vocab-neko", cardId: "vocab-neko--vocabulary-production", formId: "vocabulary-production", overdueMs: 500 },
      { conceptId: "vocab-neko", cardId: "vocab-neko--vocabulary-meaning", formId: "vocabulary-meaning", overdueMs: 200 },
    ];
    expect(filterEligibleDueCards(due, new Set(["vocab-neko--vocabulary-meaning"]))).toEqual([due[1]]);
  });
  it("orders existing due cards before canonical new material", () => {
    const queue = buildDailyQueue({ profileId: "kevin", due: [{ conceptId: "old", cardId: "due-first", formId: "kana", overdueMs: 8 }, { conceptId: "older", cardId: "due-second", formId: "kana", overdueMs: 4 }], materials, introducedConceptIds: [] });
    expect(queue.due.map((item) => item.cardId)).toEqual(["due-first", "due-second"]);
    expect(queue.newConceptIds).toEqual(["c0", "c1", "c2", "c3", "c4"]);
    expect(queue.orderedCardIds).toEqual(["due-first", "due-second", "c0-card", "c1-card", "c2-card", "c3-card", "c4-card"]);
  });
  it("caps at five new concepts and retains every card form for those concepts", () => {
    const multiCardMaterials = [
      { conceptId: "a", cardIds: ["a-1", "a-2", "a-3"], order: 0 },
      { conceptId: "b", cardIds: ["b-1", "b-2", "b-3"], order: 1 },
      { conceptId: "c", cardIds: ["c-1", "c-2"], order: 2 },
      { conceptId: "d", cardIds: ["d-1", "d-2"], order: 3 },
      { conceptId: "e", cardIds: ["e-1", "e-2"], order: 4 },
      { conceptId: "f", cardIds: ["f-1", "f-2"], order: 5 },
      { conceptId: "g", cardIds: ["g-1", "g-2"], order: 6 },
    ];
    const queue = buildDailyQueue({ profileId: "kevin", due: [], materials: multiCardMaterials, introducedConceptIds: [], cap: 99 });
    expect(queue.newConceptIds).toEqual(["a", "b", "c", "d", "e"]);
    expect(queue.newConceptIds.length).toBeLessThanOrEqual(5);
    expect(queue.newCardIds).toEqual(["a-1", "a-2", "a-3", "b-1", "b-2", "b-3", "c-1", "c-2", "d-1", "d-2", "e-1", "e-2"]);
    expect(queue.newCardIds.length).toBeGreaterThan(5);
  });
  it("keeps queue ownership explicit and excludes concepts already introduced for that profile", () => {
    expect(buildDailyQueue({ profileId: "janne", due: [], materials, introducedConceptIds: ["c0"] })).toMatchObject({ profileId: "janne", newConceptIds: ["c1", "c2", "c3", "c4", "c5"] });
  });
});
