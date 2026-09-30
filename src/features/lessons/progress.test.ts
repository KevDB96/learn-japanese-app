import { describe, expect, it } from "vitest";
import type { ContentCatalog, ContentId, Lesson } from "../../lib/content/types.ts";
import type { ConceptState, LessonProgress, ReviewCardState } from "../../lib/storage/types.ts";
import { completeLesson, getConceptLifecycle, getContinueLesson, getNextLesson, getUnlockedLessons, resolveLessonResume, saveLessonPosition } from "./progress.ts";

const cid = (id: string) => id as ContentId;
const block = (id: string) => ({ id: cid(id), kind: "paragraph" as const, text: id });
const intro: Lesson = { id: cid("intro"), display: "Intro", requires: [], introduces: [cid("concept-a")], reinforces: [], blocks: [block("one"), block("two")] };
const next: Lesson = { id: cid("next"), display: "Next", requires: [cid("concept-a")], introduces: [], reinforces: [], blocks: [block("next-one")] };
const catalog: ContentCatalog = { metadata: { schemaVersion: 1, contentVersion: "1" }, courses: [], units: [], lessons: [intro, next], concepts: [{ id: cid("concept-a"), display: "A", reading: "a", translation: "A" }], sentences: [] };

function memory() {
  const lessons = new Map<string, LessonProgress>();
  const concepts = new Map<string, ConceptState>();
  const reviewStates = new Map<string, ReviewCardState>();
  return {
    lessons, concepts, reviewStates,
    repos: {
      lessonProgress: { get: async (id: string) => lessons.get(id), put: async (item: LessonProgress) => { lessons.set(item.id, item); }, list: async () => [...lessons.values()] },
      conceptStates: { get: async (id: string) => concepts.get(id), put: async (item: ConceptState) => { concepts.set(item.id, item); }, list: async () => [...concepts.values()] },
      reviews: { introduce: async (conceptId: string, at: number) => { if (!reviewStates.has(conceptId)) reviewStates.set(conceptId, { id: conceptId, recordVersion: 1, updatedAt: new Date(at).toISOString(), conceptId, cardId: conceptId, state: { schemaVersion: 1, conceptId, difficulty: 0, stability: 0, lastReviewedAt: null, nextDueAt: new Date(at).toISOString(), reviewCount: 0, lapseCount: 0, scheduler: { state: "New", elapsedDays: 0, scheduledDays: 0, learningSteps: 0, repetitions: 0 } } }); } },
    },
  };
}

describe("lesson progress", () => {
  it("persists a block position and resumes after interruption", async () => {
    const db = memory();
    await saveLessonPosition(db.repos, catalog, intro, 1, () => new Date(0));
    const reopened = db.lessons.get("intro");
    expect(resolveLessonResume(reopened, catalog, intro)).toEqual({ kind: "resume", blockIndex: 1 });
  });

  it("completes idempotently, introduces concepts, and never marks them mastered", async () => {
    const db = memory();
    const clock = () => new Date("2026-01-01T00:00:00Z");
    await completeLesson(db.repos, catalog, intro, clock);
    const completedAt = db.lessons.get("intro")?.completedAt;
    await completeLesson(db.repos, catalog, intro, () => new Date("2026-01-02T00:00:00Z"));
    expect(db.lessons.get("intro")?.completedAt).toBe(completedAt);
    expect(getConceptLifecycle(db.concepts.get("concept-a"))).toBe("INTRODUCED");
    expect(db.reviewStates.get("concept-a")?.state).toMatchObject({ reviewCount: 0, lapseCount: 0, lastReviewedAt: null });
    expect(getUnlockedLessons(catalog, [db.lessons.get("intro")!], [...db.concepts.values()]).map((item) => item.id)).toEqual(["next"]);
  });

  it("unlocks lessons from prerequisites in canonical order", async () => {
    const db = memory();
    expect(getUnlockedLessons(catalog, [], []).map((item) => item.id)).toEqual(["intro"]);
    await completeLesson(db.repos, catalog, intro);
    expect(getNextLesson(catalog, await db.repos.lessonProgress.list(), await db.repos.conceptStates.list())?.id).toBe("next");
  });

  it("allows explicit placement introductions to satisfy lesson prerequisites without mastery", async () => {
    const db = memory();
    db.concepts.set("concept-a", { id: "concept-a", recordVersion: 1, updatedAt: new Date(0).toISOString(), conceptId: "concept-a", lifecycle: "INTRODUCED", familiarity: 0 });
    expect(getUnlockedLessons(catalog, [], [...db.concepts.values()]).map((item) => item.id)).toEqual(["next"]);
    expect(getContinueLesson(catalog, [], [...db.concepts.values()])?.id).toBe("next");
    expect(db.reviewStates.size).toBe(0);
    expect(getConceptLifecycle(db.concepts.get("concept-a"))).toBe("INTRODUCED");
  });

  it("chooses the next eligible lesson for a new learner and resumes an interrupted lesson", async () => {
    const db = memory();
    expect(getContinueLesson(catalog, [], [])).toBe(intro);
    await saveLessonPosition(db.repos, catalog, intro, 1, () => new Date(0));
    expect(getContinueLesson(catalog, await db.repos.lessonProgress.list(), [])).toBe(intro);
  });

  it("preserves a stable block across content versions and reports a removed resume block", () => {
    const progress: LessonProgress = { id: "intro", lessonId: "intro", recordVersion: 1, updatedAt: new Date(0).toISOString(), status: "in-progress", currentBlockId: "two", currentStep: 1, contentVersion: "old", contentSchemaVersion: 1 };
    expect(resolveLessonResume(progress, { ...catalog, metadata: { schemaVersion: 1, contentVersion: "new" } }, intro)).toEqual({ kind: "resume", blockIndex: 1 });
    expect(resolveLessonResume({ ...progress, currentBlockId: "removed" }, catalog, intro)).toEqual({ kind: "content-changed", blockIndex: 0 });
  });
});
