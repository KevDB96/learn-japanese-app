import { describe, expect, it } from "vitest";
import { contentCatalog } from "../lib/content/catalog.ts";
import { katakanaAdvancedFixtures, katakanaFixtures, kanaAudioManifest } from "./kana-fixtures.ts";
import { KANA_REVIEW_FORMS, generateKanaReviewCards, validateKanaContent } from "../lib/content/kana.ts";
import { completeLesson, getContinueLesson } from "../features/lessons/progress.ts";
import type { ProgressRepositories } from "../features/lessons/progress.ts";
import type { ConceptState, LessonProgress } from "../lib/storage/types.ts";

const expectedRows = [
  ["アイウエオ", ["a", "i", "u", "e", "o"]], ["カキクケコ", ["ka", "ki", "ku", "ke", "ko"]],
  ["サシスセソ", ["sa", "shi", "su", "se", "so"]], ["タチツテト", ["ta", "chi", "tsu", "te", "to"]],
  ["ナニヌネノ", ["na", "ni", "nu", "ne", "no"]], ["ハヒフヘホ", ["ha", "hi", "fu", "he", "ho"]],
  ["マミムメモ", ["ma", "mi", "mu", "me", "mo"]], ["ヤユヨ", ["ya", "yu", "yo"]],
  ["ラリルレロ", ["ra", "ri", "ru", "re", "ro"]], ["ワヲン", ["wa", "wo", "n"]],
] as const;
const lessons = () => contentCatalog.lessons.filter((lesson) => lesson.id.startsWith("katakana-") && lesson.id.endsWith("-row"));

describe("canonical base Katakana course", () => {
  it("introduces all 46 base characters exactly once in sensible row order", () => {
    const courseLessons = lessons();
    const introduced = courseLessons.flatMap((lesson) => lesson.introduces.map((id) => contentCatalog.concepts.find((concept) => concept.id === id)?.display));
    const expected = expectedRows.flatMap(([glyphs]) => [...glyphs]);
    expect(courseLessons).toHaveLength(10);
    expect(introduced).toHaveLength(46);
    expect(new Set(introduced).size).toBe(46);
    expect(introduced.slice().sort()).toEqual(expected.sort());
  });

  it("keeps stable fixture IDs, glyphs, readings, and Katakana script aligned", () => {
    expect(katakanaFixtures).toHaveLength(46);
    for (const fixture of katakanaFixtures) {
      const concept = contentCatalog.concepts.find((item) => item.id === fixture.id);
      expect(concept, fixture.id).toBeDefined();
      expect(concept?.display, fixture.id).toBe(fixture.glyph);
      expect(concept?.reading, fixture.id).toBe(fixture.romanization);
      expect(fixture.script).toBe("katakana");
      expect(fixture.form).toBe("base");
    }
  });

  it("has a reachable prerequisite chain, guided practice, and retrieval without readings", () => {
    const courseLessons = lessons();
    expect(courseLessons[0]?.requires).toEqual(["introduction"]);
    courseLessons.slice(1).forEach((lesson, index) => expect(lesson.requires).toEqual([courseLessons[index]?.id]));
    for (const lesson of courseLessons) {
      const guided = lesson.blocks.findIndex((block) => block.id.endsWith("-guided"));
      const note = lesson.blocks.find((block) => block.id.endsWith("-retrieval-note"));
      const retrieval = lesson.blocks.find((block) => block.id.endsWith("-retrieval"));
      expect(guided).toBeGreaterThanOrEqual(0);
      expect(retrieval && lesson.blocks.indexOf(retrieval)).toBeGreaterThan(guided);
      expect(note?.kind).toBe("callout");
      if (retrieval?.kind === "exercise-slot") for (const exercise of retrieval.exercises) {
        expect(exercise.prompt).not.toMatch(/\([a-z]+\)/i);
      }
    }
  });

  it("explains irregular readings and the modern pronunciation of ヲ accurately", () => {
    const teach = (id: string) => lessons().find((lesson) => lesson.id === id)?.blocks.find((block) => block.id.endsWith("-teach"));
    expect(teach("katakana-s-row")).toMatchObject({ kind: "paragraph", text: expect.stringContaining("シ is irregular: read it shi, not si.") });
    expect(teach("katakana-t-row")).toMatchObject({ kind: "paragraph", text: expect.stringContaining("チ is chi and ツ is tsu") });
    expect(teach("katakana-h-row")).toMatchObject({ kind: "paragraph", text: expect.stringContaining("フ is conventionally romanized fu") });
    expect(teach("katakana-w-row")).toMatchObject({ kind: "paragraph", text: expect.stringContaining("ヲ is conventionally romanized wo") });
    expect(teach("katakana-w-row")).toMatchObject({ kind: "paragraph", text: expect.stringContaining("pronounced like オ (o)") });
  });

  it("uses only already introduced kana in its real loanword examples", () => {
    const known = new Set<string>();
    for (const lesson of lessons()) {
      const current = lesson.introduces.map((id) => contentCatalog.concepts.find((concept) => concept.id === id)!.display);
      for (const block of lesson.blocks) if (block.kind === "japanese-example") {
        expect([...block.japanese].every((glyph) => known.has(glyph) || current.includes(glyph))).toBe(true);
      }
      current.forEach((glyph) => known.add(glyph));
    }
    const examples = lessons().flatMap((lesson) => lesson.blocks.filter((block) => block.kind === "japanese-example"));
    expect(examples.map((block) => block.kind === "japanese-example" ? block.japanese : "")).toEqual(["アイス", "テスト", "メモ", "カメラ", "ホテル", "ワイン"]);
  });

  it("schedules introduced Katakana for review without marking it mastered", async () => {
    const courseLessons = lessons();
    const progress = new Map<string, LessonProgress>();
    const states = new Map<string, ConceptState>();
    const scheduled: string[] = [];
    const repos: ProgressRepositories = {
      lessonProgress: { get: async (id) => progress.get(id), put: async (item) => { progress.set(item.id, item); }, list: async () => [...progress.values()] },
      conceptStates: { get: async (id) => states.get(id), put: async (item) => { states.set(item.conceptId, item); }, list: async () => [...states.values()] },
      reviews: { introduce: async (id, _at, cardId) => { scheduled.push(cardId ?? id); } },
    };
    const completedIntro: LessonProgress = { id: "introduction", lessonId: "introduction", recordVersion: 1, updatedAt: "2026-09-28T00:00:00Z", status: "completed" };
    expect(getContinueLesson(contentCatalog, [completedIntro], [])?.id).toBe("hiragana-a-row");
    for (const lesson of courseLessons) await completeLesson(repos, contentCatalog, lesson, () => new Date("2026-09-28T00:00:00Z"));
    expect([...states.keys()].sort()).toEqual(katakanaFixtures.map((item) => item.id).sort());
    expect([...states.values()].every((state) => state.lifecycle === "INTRODUCED")).toBe(true);
    expect([...states.values()].some((state) => state.lifecycle === "MASTERED")).toBe(false);
    expect(scheduled).toHaveLength(92);
    expect(new Set(scheduled).size).toBe(92);
  });
});

describe("voiced and contracted Katakana course", () => {
  const advancedLessons = () => contentCatalog.lessons.filter((lesson) => lesson.id.startsWith("katakana-") && !lesson.id.endsWith("-row") && lesson.id !== "katakana-foundations" && lesson.id !== "katakana-through-n");

  it("covers voiced, semi-voiced, small, yōon, loanword, and long-vowel forms relationally", () => {
    expect(katakanaAdvancedFixtures.filter((item) => item.form === "marked")).toHaveLength(25);
    expect(katakanaAdvancedFixtures.filter((item) => item.form === "contracted" && item.row.startsWith("yoon-")).length).toBeGreaterThan(30);
    expect(katakanaAdvancedFixtures.filter((item) => item.row === "extended-loanword").map((item) => item.glyph)).toEqual(["ティ", "ディ", "ファ", "フィ", "フェ", "フォ", "ウィ", "ウェ", "ウォ", "チェ"]);
    const derived = katakanaAdvancedFixtures.filter((item) => item.form === "contracted");
    expect(derived.every((item) => item.componentIds.length === 2 && item.reviewEligible === false)).toBe(true);
    expect(generateKanaReviewCards(katakanaAdvancedFixtures)).toHaveLength(50);
    expect(validateKanaContent([...katakanaFixtures, ...katakanaAdvancedFixtures], KANA_REVIEW_FORMS, kanaAudioManifest)).toEqual([]);
  });

  it("teaches in prerequisite order with examples using only available Katakana mechanics", () => {
    const courseLessons = advancedLessons();
    expect(courseLessons.map((lesson) => lesson.id)).toEqual(["katakana-voiced-sounds", "katakana-contracted-sounds", "katakana-loanword-sounds"]);
    expect(courseLessons.map((lesson) => lesson.requires)).toEqual([["katakana-w-row"], ["katakana-voiced-sounds"], ["katakana-contracted-sounds"]]);
    const known = new Set(katakanaFixtures.map((item) => item.glyph));
    for (const lesson of courseLessons) {
      const current = lesson.introduces.map((id) => contentCatalog.concepts.find((item) => item.id === id)!.display);
      for (const block of lesson.blocks) if (block.kind === "japanese-example") {
        expect([...block.japanese].every((glyph) => known.has(glyph) || current.includes(glyph))).toBe(true);
      }
      current.forEach((glyph) => known.add(glyph));
    }
    expect(courseLessons[2]?.blocks.find((block) => block.id.endsWith("-teach"))).toMatchObject({ kind: "paragraph", text: expect.stringContaining("do not apply Hiragana spelling rules") });
  });

  it("introduces marked sounds for review while keeping productive combinations out of separate SRS memory", async () => {
    const lessonProgress = new Map<string, LessonProgress>();
    const conceptStates = new Map<string, ConceptState>();
    const scheduled: string[] = [];
    const repos: ProgressRepositories = {
      lessonProgress: { get: async (id) => lessonProgress.get(id), put: async (value) => { lessonProgress.set(value.id, value); }, list: async () => [...lessonProgress.values()] },
      conceptStates: { get: async (id) => conceptStates.get(id), put: async (value) => { conceptStates.set(value.conceptId, value); }, list: async () => [...conceptStates.values()] },
      reviews: { introduce: async (_id, _at, cardId) => { if (cardId) scheduled.push(cardId); } },
    };
    for (const lesson of advancedLessons()) await completeLesson(repos, contentCatalog, lesson, () => new Date("2026-09-30T00:00:00Z"));
    expect(scheduled).toHaveLength(50);
    expect(scheduled.every((cardId) => katakanaAdvancedFixtures.some((item) => item.form === "marked" && cardId.startsWith(`${item.id}--`)))).toBe(true);
    expect([...conceptStates.values()]).toHaveLength(katakanaAdvancedFixtures.length);
    expect([...conceptStates.values()].every((state) => state.lifecycle === "INTRODUCED")).toBe(true);
  });
});
