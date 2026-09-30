import { describe, expect, it } from "vitest";
import { contentCatalog } from "./catalog.ts";
import { grammarFixtures } from "../../content/grammar-fixtures.ts";
import { vocabularyFixtures } from "../../content/vocabulary-fixtures.ts";
import { generateVocabularyReviewCards } from "./vocabulary.ts";

describe("places and location lesson", () => {
  const lesson = contentCatalog.lessons.find(({ id }) => id === "lesson-places-and-location")!;

  it("follows food and requests and teaches both demonstrative sets", () => {
    expect(lesson.requires).toEqual(["lesson-food-and-requests"]);
    expect(lesson.introduces).toEqual(expect.arrayContaining([
      "place-home", "place-school", "place-station", "place-store", "place-demonstratives", "place-location-words", "place-existence",
    ]));
    expect(contentCatalog.units.find(({ id }) => id === "places-and-location")?.lessonIds).toEqual(["lesson-places-and-location"]);
    const text = JSON.stringify(lesson);
    for (const term of ["これ", "それ", "あれ", "どれ", "ここ", "そこ", "あそこ", "どこ"]) expect(text).toContain(term);
    expect(text).toContain("どれ asks which thing");
    expect(text).toContain("どこ asks which place");
  });

  it("explains prerequisites and usage for polite location and existence patterns", () => {
    const grammar = grammarFixtures.find(({ id }) => id === "grammar-places-and-existence")!;
    expect(grammar.requires).toContain("grammar-likes-and-requests");
    expect(grammar.fullExplanation).toContain("に marks the location");
    expect(grammar.fullExplanation).toContain("が marks what exists");
    expect(grammar.fullExplanation).toContain("people and animals");
    expect(grammar.fullExplanation).toContain("nonliving things");
    expect(grammar.examples.every(({ reading }) => !/[\u4e00-\u9fff]/.test(reading))).toBe(true);
    expect(lesson.blocks.some((block) => block.kind === "exercise-slot" && block.exercises.some(({ type }) => type === "multiple-choice"))).toBe(true);
    expect(lesson.blocks.some((block) => block.kind === "exercise-slot" && block.exercises.some(({ type }) => type === "cloze"))).toBe(true);
    expect(lesson.blocks.some((block) => block.kind === "exercise-slot" && block.exercises.some(({ type }) => type === "sentence-order"))).toBe(true);
  });

  it("adds common place words to scheduled vocabulary review", () => {
    const cards = generateVocabularyReviewCards(vocabularyFixtures);
    for (const id of ["vocab-uchi", "vocab-gakkou", "vocab-eki", "vocab-mise", "vocab-kore", "vocab-sore", "vocab-are", "vocab-dore", "vocab-koko", "vocab-soko", "vocab-asoko", "vocab-doko"]) {
      expect(cards.some((card) => card.conceptId === id)).toBe(true);
    }
  });
});
