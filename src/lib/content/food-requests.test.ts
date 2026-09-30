import { describe, expect, it } from "vitest";
import { contentCatalog } from "./catalog.ts";
import { grammarFixtures } from "../../content/grammar-fixtures.ts";
import { phraseFixtures } from "../../content/phrase-fixtures.ts";
import { vocabularyFixtures } from "../../content/vocabulary-fixtures.ts";
import { generateVocabularyReviewCards } from "./vocabulary.ts";
import { generatePhraseReviewCards } from "./phrases.ts";
import { generateGrammarClozeReviewCards } from "./grammar.ts";

describe("food and requests lesson", () => {
  const lesson = contentCatalog.lessons.find(({ id }) => id === "lesson-food-and-requests")!;

  it("follows numbers and time and introduces useful food concepts", () => {
    expect(lesson.requires).toEqual(["lesson-numbers-and-time"]);
    expect(lesson.introduces).toEqual(expect.arrayContaining([
      "food-rice-meal", "food-bread", "food-sushi", "food-ramen", "food-tea", "food-coffee", "food-likes", "food-simple-request",
    ]));
    expect(contentCatalog.units.find(({ id }) => id === "food-and-requests")?.lessonIds).toEqual(["lesson-food-and-requests"]);
  });

  it("explains が with 好き/嫌い, polite requests, and practices comprehension and production", () => {
    const text = JSON.stringify(lesson);
    expect(text).toContain("好き");
    expect(text).toContain("嫌い");
    expect(text).toContain("が marks the thing liked");
    expect(text).toContain("これをください");
    expect(text).toContain("水をお願いします");
    expect(text).toContain("すみません");
    expect(lesson.blocks.some((block) => block.kind === "exercise-slot" && block.exercises.some(({ type }) => type === "multiple-choice"))).toBe(true);
    expect(lesson.blocks.some((block) => block.kind === "exercise-slot" && block.exercises.some(({ type }) => type === "cloze"))).toBe(true);
    expect(lesson.blocks.some((block) => block.kind === "exercise-slot" && block.exercises.some(({ type }) => type === "short-text" || type === "sentence-order"))).toBe(true);
    expect(grammarFixtures.find(({ id }) => id === "grammar-likes-and-requests")?.examples.every(({ reading }) => !/[\u4e00-\u9fff]/.test(reading))).toBe(true);
  });

  it("reuses water and registers food vocabulary and phrases for review", () => {
    expect(lesson.blocks.some((block) => block.kind === "vocabulary-list" && block.items.some(({ japanese }) => japanese === "水"))).toBe(true);
    const vocabularyCards = generateVocabularyReviewCards(vocabularyFixtures);
    for (const id of ["vocab-gohan", "vocab-sushi", "vocab-ramen", "vocab-ocha", "vocab-coffee"]) {
      expect(vocabularyCards.some((card) => card.conceptId === id)).toBe(true);
    }
    expect(phraseFixtures.some(({ id }) => id === "phrase-kore-o-kudasai")).toBe(true);
    expect(phraseFixtures.some(({ id }) => id === "phrase-mizu-o-onegaishimasu")).toBe(true);
    expect(generatePhraseReviewCards(phraseFixtures).some(({ conceptId }) => conceptId === "phrase-kore-o-kudasai")).toBe(false);
    expect(generateGrammarClozeReviewCards(grammarFixtures).some(({ conceptId }) => conceptId === "grammar-likes-and-requests")).toBe(true);
  });
});
