import { describe, expect, it } from "vitest";
import { contentCatalog } from "./catalog.ts";
import { validateGrammarContent } from "./grammar.ts";
import { grammarFixtures } from "../../content/grammar-fixtures.ts";
import { vocabularyFixtures } from "../../content/vocabulary-fixtures.ts";
import { generateVocabularyReviewCards, validateVocabularyContent } from "./vocabulary.ts";
import { phraseFixtures } from "../../content/phrase-fixtures.ts";
import { generatePhraseReviewCards, validatePhraseContent } from "./phrases.ts";

describe("first post-kana self-introduction module", () => {
  const lesson = contentCatalog.lessons.find(({ id }) => id === "lesson-self-introduction")!;

  it("unlocks after katakana and teaches only concepts available in its sentences", () => {
    expect(lesson.requires).toEqual(["katakana-loanword-sounds"]);
    expect(contentCatalog.courses[0]?.unitIds).toContain("self-introduction");
    expect(contentCatalog.units.find(({ id }) => id === "self-introduction")?.lessonIds).toContain(lesson.id);
    expect(lesson.introduces).toEqual(expect.arrayContaining(["identity-watashi", "identity-student", "identity-topic-marker", "identity-polite-copula"]));
    const sentenceBlocks = lesson.blocks.filter((block) => block.kind === "sentence-ref");
    expect(sentenceBlocks).toHaveLength(2);
    for (const block of sentenceBlocks) {
      if (block.kind !== "sentence-ref") continue;
      const sentence = contentCatalog.sentences.find(({ id }) => id === block.sentenceId)!;
      expect(lesson.introduces).toEqual(expect.arrayContaining([...sentence.requires]));
      expect(sentence.reading).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });

  it("contains guided practice, retrieval, kana readings, explanations, and polite review content", () => {
    expect(lesson.blocks.some((block) => block.kind === "grammar-breakdown")).toBe(true);
    const exerciseTypes = lesson.blocks.flatMap((block) => block.kind === "exercise-slot" ? block.exercises.map(({ type }) => type) : []);
    expect(exerciseTypes).toEqual(expect.arrayContaining(["multiple-choice", "cloze", "sentence-order", "short-text"]));
    expect(validateVocabularyContent(vocabularyFixtures)).toEqual([]);
    expect(validateGrammarContent(grammarFixtures)).toEqual([]);
    expect(validatePhraseContent(phraseFixtures, undefined, { grammarIds: grammarFixtures.map(({ id }) => id) })).toEqual([]);
    expect(generateVocabularyReviewCards(vocabularyFixtures).some(({ conceptId }) => conceptId === "vocab-watashi")).toBe(true);
    expect(generatePhraseReviewCards(phraseFixtures).some(({ conceptId }) => conceptId === "phrase-hajimemashite")).toBe(true);
    expect(grammarFixtures.find(({ id }) => id === "grammar-self-introduction")?.requires).toEqual(["grammar-topic-wa", "grammar-desu-copula"]);
  });
});
