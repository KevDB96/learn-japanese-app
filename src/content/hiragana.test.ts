import { describe, expect, it } from "vitest";
import { contentCatalog } from "../lib/content/catalog.ts";
import { completeLesson, getContinueLesson } from "../features/lessons/progress.ts";
import type { ProgressRepositories } from "../features/lessons/progress.ts";
import type { ConceptState, LessonProgress } from "../lib/storage/types.ts";
const cp = (...values: number[]) => values.map((value) => String.fromCodePoint(value));
const rows = [
  cp(0x3042,0x3044,0x3046,0x3048,0x304a), cp(0x304b,0x304d,0x304f,0x3051,0x3053),
  cp(0x3055,0x3057,0x3059,0x305b,0x305d), cp(0x305f,0x3061,0x3064,0x3066,0x3068),
  cp(0x306a,0x306b,0x306c,0x306d,0x306e), cp(0x306f,0x3072,0x3075,0x3078,0x307b),
  cp(0x307e,0x307f,0x3080,0x3081,0x3082), cp(0x3084,0x3086,0x3088),
  cp(0x3089,0x308a,0x308b,0x308c,0x308d), cp(0x308f,0x3092,0x3093),
];
describe("canonical basic Hiragana course", () => {
  it("introduces every in-scope character exactly once", () => {
    const lessons = contentCatalog.lessons.filter((lesson) => lesson.id.startsWith("hiragana-") && lesson.id.endsWith("-row"));
    const introduced = lessons.flatMap((lesson) => lesson.introduces.map((id) => contentCatalog.concepts.find((concept) => concept.id === id)?.display));
    expect(lessons).toHaveLength(10); expect(introduced).toHaveLength(46); expect(new Set(introduced).size).toBe(46); expect(introduced.slice().sort()).toEqual(rows.flat().sort());
  });
  it("adds the final six lessons in order and uses only learned kana in its examples", () => {
    const lessons = contentCatalog.lessons.filter((lesson) => lesson.id.startsWith("hiragana-") && lesson.id.endsWith("-row"));
    const known = new Set<string>();
    for (const [index, lesson] of lessons.entries()) {
      const current = lesson.introduces.map((id) => contentCatalog.concepts.find((concept) => concept.id === id)!.display);
      for (const block of lesson.blocks) {
        if (block.kind === "japanese-example") {
          expect([...block.japanese].every((glyph) => known.has(glyph) || current.includes(glyph))).toBe(true);
        }
      }
      current.forEach((glyph) => known.add(glyph));
      if (index > 0) expect(lesson.requires).toEqual([lessons[index - 1]?.id]);
    }
    expect(lessons.slice(4).map((lesson) => lesson.id)).toEqual([
      "hiragana-n-row", "hiragana-h-row", "hiragana-m-row", "hiragana-y-row", "hiragana-r-row", "hiragana-w-row",
    ]);
    expect(known.size).toBe(46);
  });
  it("keeps prerequisites valid and advances a fresh profile from Introduction", () => {
    const lessons = contentCatalog.lessons.filter((lesson) => lesson.id.startsWith("hiragana-") && lesson.id.endsWith("-row"));
    expect(lessons[0]?.requires).toEqual(["introduction"]);
    lessons.slice(1).forEach((lesson, index) => expect(lesson.requires).toEqual([lessons[index]?.id]));
    lessons.forEach((lesson) => {
      expect(contentCatalog.lessons.some((candidate) => candidate.id === lesson.requires[0])).toBe(true);
      expect(lesson.blocks.findIndex((block) => block.id.endsWith("-guided"))).toBeLessThan(lesson.blocks.findIndex((block) => block.id.endsWith("-retrieval")));
    });
    const completedIntro: LessonProgress = {id:"introduction",lessonId:"introduction",recordVersion:1,updatedAt:"2026-09-28T00:00:00Z",status:"completed"};
    expect(getContinueLesson(contentCatalog,[completedIntro],[])?.id).toBe("hiragana-a-row");
  });
  it("schedules each newly introduced kana without marking it mastered", async () => {
    const lesson = contentCatalog.lessons.find((item) => item.id === "hiragana-a-row")!;
    const progress = new Map<string, LessonProgress>();
    const states = new Map<string, ConceptState>();
    const scheduled: string[] = [];
    const repos: ProgressRepositories = {
      lessonProgress: { get: async (id) => progress.get(id), put: async (item) => { progress.set(item.id, item); }, list: async () => [...progress.values()] },
      conceptStates: { get: async (id) => states.get(id), put: async (item) => { states.set(item.id, item); }, list: async () => [...states.values()] },
      reviews: { introduce: async (id) => { scheduled.push(id); } },
    };
    await completeLesson(repos, contentCatalog, lesson, () => new Date("2026-09-28T00:00:00Z"));
    expect(scheduled).toEqual(lesson.introduces);
    expect([...states.values()].map((state) => state.lifecycle)).toEqual(Array(5).fill("INTRODUCED"));
    expect([...states.values()].some((state) => state.lifecycle === "MASTERED")).toBe(false);
  });
  it("introduces all 46 basic kana for independent review as the course is completed", async () => {
    const lessons = contentCatalog.lessons.filter((lesson) => lesson.id.startsWith("hiragana-") && lesson.id.endsWith("-row"));
    const progress = new Map<string, LessonProgress>();
    const states = new Map<string, ConceptState>();
    const scheduled: string[] = [];
    const repos: ProgressRepositories = {
      lessonProgress: { get: async (id) => progress.get(id), put: async (item) => { progress.set(item.id, item); }, list: async () => [...progress.values()] },
      conceptStates: { get: async (id) => states.get(id), put: async (item) => { states.set(item.conceptId, item); }, list: async () => [...states.values()] },
      reviews: { introduce: async (id) => { scheduled.push(id); } },
    };
    for (const lesson of lessons) await completeLesson(repos, contentCatalog, lesson, () => new Date("2026-09-28T00:00:00Z"));
    expect(states.size).toBe(46);
    expect([...states.values()].every((state) => state.lifecycle === "INTRODUCED")).toBe(true);
    expect(scheduled).toHaveLength(46);
    expect(new Set(scheduled).size).toBe(46);
  });
  it("introduces the final segment without replacing existing long-term review state", async () => {
    const lesson = contentCatalog.lessons.find((item) => item.id === "hiragana-w-row")!;
    const existing: ConceptState = { id: lesson.introduces[0]!, conceptId: lesson.introduces[0]!, recordVersion: 1, updatedAt: "2026-09-20T00:00:00Z", lifecycle: "LEARNING", familiarity: 0.7, nextReviewAt: "2026-10-20T00:00:00Z", lastReviewedAt: "2026-09-25T00:00:00Z" };
    const states = new Map([[existing.conceptId, existing]]);
    const repos: ProgressRepositories = {
      lessonProgress: { get: async () => undefined, put: async () => {}, list: async () => [] },
      conceptStates: { get: async (id) => states.get(id), put: async (item) => { states.set(item.conceptId, item); }, list: async () => [...states.values()] },
      reviews: { introduce: async () => {} },
    };
    await completeLesson(repos, contentCatalog, lesson, () => new Date("2026-09-28T00:00:00Z"));
    const preserved = states.get(existing.conceptId)!;
    expect(preserved).toMatchObject({ lifecycle: "LEARNING", familiarity: 0.7, nextReviewAt: existing.nextReviewAt, lastReviewedAt: existing.lastReviewedAt });
    expect(preserved.updatedAt).toBe("2026-09-28T00:00:00.000Z");
  });
});
