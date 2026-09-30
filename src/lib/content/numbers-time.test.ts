import { describe, expect, it } from "vitest";
import { contentCatalog } from "./catalog.ts";
import { grammarFixtures } from "../../content/grammar-fixtures.ts";
import { vocabularyFixtures } from "../../content/vocabulary-fixtures.ts";
import { generateVocabularyReviewCards } from "./vocabulary.ts";

describe("numbers and time lesson", () => {
  const lesson = contentCatalog.lessons.find(({ id }) => id === "lesson-numbers-and-time")!;

  it("follows people and family and teaches the core number and time concepts", () => {
    expect(lesson.requires).toEqual(["lesson-people-and-family"]);
    expect(lesson.introduces).toEqual(expect.arrayContaining([
      "number-0", "number-1", "number-2", "number-3", "number-4", "number-5", "number-6", "number-7", "number-8", "number-9", "number-10",
      "time-clock", "time-minute", "time-half", "time-question", "counter-people", "counter-tsu",
    ]));
    expect(contentCatalog.units.find(({ id }) => id === "numbers-and-time")?.lessonIds).toEqual(["lesson-numbers-and-time"]);
  });

  it("explains irregular clock, minute, and people readings and practices comprehension and production", () => {
    const text = JSON.stringify(lesson);
    expect(text).toContain("四時 is よじ");
    expect(text).toContain("七時 is しちじ");
    expect(text).toContain("九時 is くじ");
    expect(text).toContain("一分 いっぷん");
    expect(text).toContain("三分 さんぷん");
    expect(text).toContain("一人");
    expect(text).toContain("二人");
    expect(text).toContain("ひとり");
    expect(text).toContain("ふたり");
    expect(lesson.blocks.some((block) => block.kind === "exercise-slot" && block.exercises.some(({ type }) => type === "multiple-choice"))).toBe(true);
    expect(lesson.blocks.some((block) => block.kind === "exercise-slot" && block.exercises.some(({ type }) => type === "short-text" || type === "sentence-order"))).toBe(true);
    expect(grammarFixtures.find(({ id }) => id === "grammar-time-and-counters")?.examples.every(({ reading }) => !/[\u4e00-\u9fff]/.test(reading))).toBe(true);
  });

  it("adds number, time, and people vocabulary to scheduled review", () => {
    const cards = generateVocabularyReviewCards(vocabularyFixtures);
    for (const id of ["vocab-yon", "vocab-nanji", "vocab-fun", "vocab-hitori", "vocab-futari"]) {
      expect(cards.some((card) => card.conceptId === id)).toBe(true);
    }
  });
});
