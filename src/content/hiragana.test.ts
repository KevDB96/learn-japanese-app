import { describe, expect, it } from "vitest";
import { contentCatalog } from "../lib/content/catalog.ts";
import { completeLesson, getContinueLesson } from "../features/lessons/progress.ts";
import type { ProgressRepositories } from "../features/lessons/progress.ts";
import type { ConceptState, LessonProgress } from "../lib/storage/types.ts";
const cp = (...values: number[]) => values.map((value) => String.fromCodePoint(value));
const rows = [cp(0x3042,0x3044,0x3046,0x3048,0x304a),cp(0x304b,0x304d,0x304f,0x3051,0x3053),cp(0x3055,0x3057,0x3059,0x305b,0x305d),cp(0x305f,0x3061,0x3064,0x3066,0x3068)];
describe("canonical first Hiragana segment", () => {
  it("introduces every in-scope character exactly once", () => {
    const lessons = contentCatalog.lessons.filter((lesson) => lesson.id.startsWith("hiragana-") && lesson.id.endsWith("-row"));
    const introduced = lessons.flatMap((lesson) => lesson.introduces.map((id) => contentCatalog.concepts.find((concept) => concept.id === id)?.display));
    expect(lessons).toHaveLength(4); expect(introduced).toHaveLength(20); expect(new Set(introduced).size).toBe(20); expect(introduced.slice().sort()).toEqual(rows.flat().sort());
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
});
