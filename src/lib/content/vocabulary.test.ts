import { describe, expect, it } from "vitest";
import type { ContentId, VocabularyConcept } from "./types.ts";
import { generateVocabularyReviewCards, VOCABULARY_REVIEW_FORMS, validateVocabularyContent } from "./vocabulary.ts";
import { vocabularyFixtures } from "../../content/vocabulary-fixtures.ts";

describe("vocabulary concepts and review forms", () => {
  it("generates deterministic meaning, reading, and production cards from each concept", () => {
    const cards = generateVocabularyReviewCards(vocabularyFixtures);
    expect(cards).toEqual(generateVocabularyReviewCards(vocabularyFixtures));
    expect(cards).toHaveLength(vocabularyFixtures.length * 3);
    expect(new Set(cards.map(({ id }) => id)).size).toBe(cards.length);
    expect(cards.map(({ kind }) => kind)).toEqual(["meaning", "production", "reading", "meaning", "production", "reading"]);
    expect(cards.find(({ kind, conceptId }) => kind === "meaning" && conceptId === "vocab-neko")?.answers).toEqual(["cat"]);
    expect(cards.find(({ kind, conceptId }) => kind === "reading" && conceptId === "vocab-neko")?.answers).toEqual(["ねこ"]);
    expect(cards.find(({ kind, conceptId }) => kind === "production" && conceptId === "vocab-neko")?.answers).toEqual(["猫"]);
    expect(cards.filter(({ conceptId }) => conceptId === "vocab-neko").every(({ reading }) => reading === "ねこ")).toBe(true);
  });

  it("keeps concept identity separate from review form identity", () => {
    const cards = generateVocabularyReviewCards([vocabularyFixtures[0]!]);
    expect(cards.map(({ conceptId, formId, id }) => ({ conceptId, formId, id }))).toEqual([...VOCABULARY_REVIEW_FORMS].sort((a, b) => a.id.localeCompare(b.id)).map((form) => ({ conceptId: "vocab-neko", formId: form.id, id: `vocab-neko--${form.id}` })));
    expect(new Set(cards.map(({ conceptId }) => conceptId)).size).toBe(1);
  });

  it("rejects duplicate IDs, missing readings, and broken audio references", () => {
    const base = vocabularyFixtures[0]!;
    const duplicate = { ...base, id: "existing-id" as ContentId, audioId: "audio-absent" };
    const missingReading = { ...base, id: "vocab-missing-reading" as ContentId, reading: " " };
    const issues = validateVocabularyContent([duplicate, missingReading], VOCABULARY_REVIEW_FORMS, { existingIds: ["existing-id"], audioIds: [] }).join("\n");
    expect(issues).toContain('duplicates content ID "existing-id"');
    expect(issues).toContain("vocabulary[1].reading is required");
    expect(issues).toContain('audioId references missing audio "audio-absent"');
  });

  it("rejects duplicate form IDs and incomplete examples", () => {
    const invalid: VocabularyConcept = { ...vocabularyFixtures[0]!, examples: [{ written: "猫", reading: "", meaning: "cat" }] };
    const issues = validateVocabularyContent([invalid], [...VOCABULARY_REVIEW_FORMS, VOCABULARY_REVIEW_FORMS[0]!]).join("\n");
    expect(issues).toContain('duplicates review form ID "vocabulary-meaning"');
    expect(validateVocabularyContent([vocabularyFixtures[0]!], [{ ...VOCABULARY_REVIEW_FORMS[0]!, answer: "reading" }]).join("\n")).toContain("invalid kind, prompt, or answer mapping");
    expect(issues).toContain("examples[0].reading is required");
  });
});
