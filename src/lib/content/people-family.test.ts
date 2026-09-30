import { describe, expect, it } from "vitest";
import { contentCatalog } from "./catalog.ts";
import { grammarFixtures } from "../../content/grammar-fixtures.ts";
import { phraseFixtures } from "../../content/phrase-fixtures.ts";
import { vocabularyFixtures } from "../../content/vocabulary-fixtures.ts";
import { generateVocabularyReviewCards } from "./vocabulary.ts";

describe("people and family lesson", () => {
  const lesson = contentCatalog.lessons.find(({ id }) => id === "lesson-people-and-family")!;

  it("follows introductions and deliberately recycles the polite noun pattern", () => {
    expect(lesson.requires).toEqual(["lesson-self-introduction"]);
    expect(lesson.reinforces).toEqual(expect.arrayContaining(["identity-topic-marker", "identity-student", "identity-teacher", "identity-polite-copula"]));
    expect(lesson.introduces).toEqual(expect.arrayContaining(["family-mother", "family-father", "family-older-brother", "family-older-sister", "sentence-family-mother", "sentence-family-brother"]));
  });

  it("teaches respectful family wording and includes comprehension, production, and kana-readable kanji", () => {
    const text = JSON.stringify(lesson);
    expect(text).toContain("母 (はは)");
    expect(text).toContain("お母さん (おかあさん)");
    expect(text).toContain("姉");
    expect(lesson.blocks.some((block) => block.kind === "exercise-slot" && block.exercises.some(({ type }) => type === "multiple-choice"))).toBe(true);
    expect(lesson.blocks.some((block) => block.kind === "exercise-slot" && block.exercises.some(({ type }) => type === "short-text" || type === "sentence-order"))).toBe(true);
    expect(contentCatalog.sentences.filter(({ id }) => id.startsWith("sentence-family-")).every(({ reading }) => !/[\u4e00-\u9fff]/.test(reading))).toBe(true);
    expect(grammarFixtures.find(({ id }) => id === "grammar-family-terms")?.examples.every(({ reading }) => !/[\u4e00-\u9fff]/.test(reading))).toBe(true);
    expect(vocabularyFixtures.some(({ id }) => id === "vocab-ani" && generateVocabularyReviewCards(vocabularyFixtures).some((card) => card.conceptId === id))).toBe(true);
    expect(phraseFixtures.find(({ id }) => id === "phrase-okaasan")?.usageNotes.join(" ")).toContain("母 (はは)");
  });
});
