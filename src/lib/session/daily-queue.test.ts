import { describe, expect, it } from "vitest";
import { buildDailyQueue } from "./daily-queue.ts";

describe("daily study queue", () => {
  const materials = Array.from({ length: 8 }, (_, order) => ({ conceptId: `c${order}`, cardIds: [`c${order}-card`], order }));
  it("orders existing due cards before canonical new material", () => {
    const queue = buildDailyQueue({ profileId: "kevin", due: [{ conceptId: "old", cardId: "due-first", formId: "kana", overdueMs: 8 }, { conceptId: "older", cardId: "due-second", formId: "kana", overdueMs: 4 }], materials, introducedConceptIds: [] });
    expect(queue.due.map((item) => item.cardId)).toEqual(["due-first", "due-second"]);
    expect(queue.newConceptIds).toEqual(["c0", "c1", "c2", "c3", "c4"]);
    expect(queue.orderedCardIds).toEqual(["due-first", "due-second", "c0-card", "c1-card", "c2-card", "c3-card", "c4-card"]);
  });
  it("never adds more than five new cards in one generated session", () => {
    const multiCardMaterials = [
      { conceptId: "a", cardIds: ["a-1", "a-2", "a-3"], order: 0 },
      { conceptId: "b", cardIds: ["b-1", "b-2", "b-3"], order: 1 },
      { conceptId: "c", cardIds: ["c-1"], order: 2 },
    ];
    const queue = buildDailyQueue({ profileId: "kevin", due: [], materials: multiCardMaterials, introducedConceptIds: [], cap: 99 });
    expect(queue.newCardIds).toEqual(["a-1", "a-2", "a-3", "c-1"]);
    expect(queue.newCardIds.length).toBeLessThanOrEqual(5);
    expect(queue.newConceptIds).toEqual(["a", "c"]);
  });
  it("keeps queue ownership explicit and excludes concepts already introduced for that profile", () => {
    expect(buildDailyQueue({ profileId: "janne", due: [], materials, introducedConceptIds: ["c0"] })).toMatchObject({ profileId: "janne", newConceptIds: ["c1", "c2", "c3", "c4", "c5"] });
  });
});
