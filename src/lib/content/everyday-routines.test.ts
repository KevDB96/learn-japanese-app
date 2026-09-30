import { describe, expect, it } from "vitest";
import { contentCatalog } from "./catalog.ts";
import { grammarFixtures } from "../../content/grammar-fixtures.ts";
import { vocabularyFixtures } from "../../content/vocabulary-fixtures.ts";
import { generateVocabularyReviewCards } from "./vocabulary.ts";

describe("everyday routines lesson", () => {
  const lesson = contentCatalog.lessons.find(({ id }) => id === "lesson-everyday-routines")!;
  const exercises = lesson.blocks.flatMap((block) => block.kind === "exercise-slot" ? block.exercises : []);

  it("follows the places lesson and teaches a limited positive polite present and past scope", () => {
    expect(lesson.requires).toEqual(["lesson-places-and-location"]);
    expect(lesson.introduces).toContain("routine-verbs-adjectives");
    const text = JSON.stringify(lesson);
    expect(text).toContain("ます");
    expect(text).toContain("ました");
    expect(text).toContain("おいしかったです");
    expect(text).toContain("verb groups or casual forms yet");
    expect(grammarFixtures.find(({ id }) => id === "grammar-polite-verb-past")?.fullExplanation).toContain("does not teach negative, question, casual, or verb-group forms");
    expect(contentCatalog.units.find(({ id }) => id === "everyday-routines")?.lessonIds).toEqual(["lesson-everyday-routines"]);
  });

  it("includes reading, production, cloze, and sentence-order practice", () => {
    expect(exercises.some(({ type }) => type === "multiple-choice")).toBe(true);
    expect(exercises.some(({ type }) => type === "short-text")).toBe(true);
    expect(exercises.some(({ type }) => type === "cloze")).toBe(true);
    expect(exercises.filter(({ type }) => type === "sentence-order")).toHaveLength(2);
    expect(exercises.find(({ id }) => id === "routine-read-eat")?.prompt).toContain("食べました");
  });

  it("connects the new routine words and grammar to spaced review", () => {
    const cards = generateVocabularyReviewCards(vocabularyFixtures);
    for (const id of ["vocab-iku", "vocab-taberu", "vocab-nomu", "vocab-benkyou-suru", "vocab-oishii", "vocab-isogashii", "vocab-tanoshii"]) {
      expect(cards.some((card) => card.conceptId === id)).toBe(true);
    }
    expect(grammarFixtures.find(({ id }) => id === "grammar-polite-verb-past")?.examples).toHaveLength(4);
  });
});
