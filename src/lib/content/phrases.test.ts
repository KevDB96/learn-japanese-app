import { describe, expect, it } from "vitest";
import type { ContentId } from "./types.ts";
import { PHRASE_REVIEW_FORMS, generatePhraseReviewCards, validatePhraseContent } from "./phrases.ts";
import { phraseFixtures } from "../../content/phrase-fixtures.ts";
import { grammarFixtures } from "../../content/grammar-fixtures.ts";

describe("phrase concepts and review forms", () => {
  it("validates useful phrases and links compositional phrases to grammar", () => {
    expect(validatePhraseContent(phraseFixtures, PHRASE_REVIEW_FORMS, { grammarIds: grammarFixtures.map(({ id }) => id) })).toEqual([]);
    expect(phraseFixtures.find(({ learningMode }) => learningMode === "compositional")?.grammarIds).toHaveLength(3);
  });

  it("generates one deterministic comprehension card per memorized phrase", () => {
    const cards = generatePhraseReviewCards(phraseFixtures);
    expect(cards).toEqual(generatePhraseReviewCards(phraseFixtures));
    expect(cards).toHaveLength(phraseFixtures.filter(({ learningMode }) => learningMode === "memorized").length);
    expect(cards.every(({ kind }) => kind === "meaning")).toBe(true);
    expect(cards.some(({ formId }) => formId === "phrase-production")).toBe(false);
    expect(new Set(cards.map(({ id }) => id)).size).toBe(cards.length);
    expect(cards.every(({ conceptId }) => phraseFixtures.find((phrase) => phrase.id === conceptId)?.learningMode === "memorized")).toBe(true);
  });

  it("rejects invalid readings, broken dependencies and missing audio", () => {
    const invalid = { ...phraseFixtures[0]!, reading: "お早う", audioId: "audio-absent" };
    const issues = validatePhraseContent([{ ...invalid, id: "phrase-invalid" as ContentId }], PHRASE_REVIEW_FORMS, { grammarIds: [], audioIds: [] }).join("\n");
    expect(issues).toContain("reading must use kana only");
    expect(issues).toContain('audioId references missing audio "audio-absent"');
    const compositional = { ...phraseFixtures[2]!, id: "phrase-missing-grammar" as ContentId, grammarIds: ["grammar-absent" as ContentId] };
    expect(validatePhraseContent([compositional], PHRASE_REVIEW_FORMS, { grammarIds: [] }).join("\n")).toContain('grammarIds references missing grammar "grammar-absent"');
  });
});
