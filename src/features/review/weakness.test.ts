import { describe, expect, it } from "vitest";
import type { ReviewEvent } from "../../lib/storage/types.ts";
import { inferConceptConfusions, rankWeakConcepts, selectWeakConcepts } from "./weakness.ts";

const now = Date.parse("2026-10-01T12:00:00.000Z");
function event(id: string, conceptId: string, rating: ReviewEvent["rating"], daysAgo: number, extra: Partial<ReviewEvent> = {}): ReviewEvent {
  const reviewedAt = new Date(now - daysAgo * 86_400_000).toISOString();
  return { id, recordVersion: 1, updatedAt: reviewedAt, conceptId, cardId: `${conceptId}:card`, rating, kind: "scheduled-review", reviewedAt, ...extra };
}

describe("weak concept evidence", () => {
  it("uses repeated recent misses, lapses, and confusions to rank concepts deterministically", () => {
    const history = [
      event("c", "weak", "again", 2, { confusedConceptId: "lookalike" }),
      event("a", "weak", "again", 4),
      event("b", "weak", "hard", 3),
      event("one", "single-mistake", "again", 1),
      event("ok", "steady", "good", 1),
    ];
    expect(rankWeakConcepts(history, now).map(({ conceptId, isWeak }) => [conceptId, isWeak])).toEqual([
      ["weak", true], ["single-mistake", false], ["steady", false],
    ]);
    expect(selectWeakConcepts(history, now).map(({ conceptId }) => conceptId)).toEqual(["weak"]);
  });

  it("uses response time only with enough valid samples and ignores outliers", () => {
    const history = [
      event("a", "slow", "good", 1, { responseTimeMs: 13_000 }),
      event("b", "slow", "good", 2, { responseTimeMs: 15_000 }),
      event("c", "slow", "good", 3, { responseTimeMs: 14_000 }),
      event("d", "slow", "good", 4, { responseTimeMs: 999_999 }),
    ];
    expect(rankWeakConcepts(history, now)[0]).toMatchObject({ reliableResponseCount: 3, medianResponseTimeMs: 14_000, score: 1, isWeak: false });
    expect(rankWeakConcepts(history.slice(0, 2), now)[0]).toMatchObject({ reliableResponseCount: 2, score: 0 });
  });

  it("excludes manual practice, stale events, and future events", () => {
    const history = [
      event("practice", "manual", "again", 1, { kind: "practice" }),
      event("stale", "old", "again", 60),
      event("future", "future", "again", -1),
    ];
    expect(rankWeakConcepts(history, now)).toEqual([]);
  });

  it("breaks equal scores by concept ID and rejects invalid reference times", () => {
    const history = [event("z", "zeta", "again", 1), event("a", "alpha", "again", 1)];
    expect(rankWeakConcepts(history, now).map(({ conceptId }) => conceptId)).toEqual(["alpha", "zeta"]);
    expect(() => rankWeakConcepts([], Number.NaN)).toThrow("Current time must be finite");
  });

  it("infers only repeated meaningful pairs and keeps error direction", () => {
    const families = new Map([["kana-a", "kana"], ["kana-b", "kana"], ["vocab-a", "vocabulary"]] as const);
    const history = [
      event("sparse", "kana-a", "again", 1, { confusedConceptId: "kana-b" }),
      event("nonsense", "kana-a", "again", 1, { confusedConceptId: "vocab-a" }),
      event("unknown", "kana-a", "again", 1, { confusedConceptId: "not-in-curriculum" }),
    ];
    expect(inferConceptConfusions(history, families, now)).toEqual(expect.arrayContaining([
      expect.objectContaining({ conceptIds: ["kana-a", "kana-b"], errorCount: 1, active: false }),
    ]));
    const repeated = [...history, event("reverse", "kana-b", "again", 2, { confusedConceptId: "kana-a" })];
    expect(inferConceptConfusions(repeated, families, now)).toContainEqual(expect.objectContaining({
      conceptIds: ["kana-a", "kana-b"], errorCount: 2,
      directionalErrors: { "kana-a->kana-b": 1, "kana-b->kana-a": 1 }, active: true,
    }));
  });

  it("recovers a confusion after sustained correct contrast performance", () => {
    const families = new Map([["grammar-a", "grammar"], ["grammar-b", "grammar"]] as const);
    const errors = [event("e1", "grammar-a", "again", 6, { confusedConceptId: "grammar-b" }), event("e2", "grammar-a", "again", 5, { confusedConceptId: "grammar-b" })];
    const successes = [3, 2, 1].map((daysAgo, index) => event(`ok${index}`, "grammar-a", "good", daysAgo, { contrastConceptId: "grammar-b" }));
    expect(inferConceptConfusions([...errors, ...successes], families, now)).toContainEqual(expect.objectContaining({
      active: false, errorCount: 2, recoveryStreak: 3,
    }));
    expect(inferConceptConfusions([...errors, ...successes.slice(0, 2)], families, now)[0]?.active).toBe(true);
  });

  it("ignores sparse, stale, future, and unclassified confusion evidence", () => {
    const families = new Map([["phrase-a", "phrase"], ["phrase-b", "phrase"]] as const);
    const history = [event("old", "phrase-a", "again", 90, { confusedConceptId: "phrase-b" }), event("future", "phrase-a", "again", -1, { confusedConceptId: "phrase-b" })];
    expect(inferConceptConfusions(history, families, now)).toEqual([]);
    expect(() => inferConceptConfusions([], families, Number.NaN)).toThrow("Current time must be finite");
  });
});
