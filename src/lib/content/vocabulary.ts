import type { VocabularyConcept, VocabularyReviewForm } from "./types.ts";
import { CONTENT_ID_PATTERN } from "./types.ts";

export const VOCABULARY_REVIEW_FORMS: readonly VocabularyReviewForm[] = Object.freeze([
  { id: "vocabulary-meaning", kind: "meaning", prompt: "written", answer: "meanings" },
  { id: "vocabulary-reading", kind: "reading", prompt: "written", answer: "reading" },
]);

export interface VocabularyReviewCard {
  readonly id: string;
  readonly conceptId: string;
  readonly formId: string;
  readonly kind: VocabularyReviewForm["kind"];
  readonly prompt: string;
  readonly answers: readonly string[];
  readonly reading: string;
  readonly audioId?: string;
  readonly examples: readonly NonNullable<VocabularyConcept["examples"]>[number][];
}

/** Derive all review directions from a single concept so its forms remain tied to one lexical memory. */
export function generateVocabularyReviewCards(
  concepts: readonly VocabularyConcept[],
  forms: readonly VocabularyReviewForm[] = VOCABULARY_REVIEW_FORMS,
): VocabularyReviewCard[] {
  return concepts.flatMap((concept) => forms.map((form) => ({
    id: `${concept.id}--${form.id}`,
    conceptId: concept.id,
    formId: form.id,
    kind: form.kind,
    prompt: form.prompt === "meaning" ? concept.meanings[0] ?? "" : concept.written,
    answers: form.answer === "reading" ? [concept.reading] : form.answer === "meanings" ? concept.meanings : [concept.written],
    reading: concept.reading,
    ...(concept.audioId ? { audioId: concept.audioId } : {}),
    examples: concept.examples ?? [],
  }))).sort((a, b) => a.conceptId.localeCompare(b.conceptId) || a.formId.localeCompare(b.formId));
}

export interface VocabularyValidationOptions {
  readonly audioIds?: readonly string[];
  readonly existingIds?: readonly string[];
}

export function validateVocabularyContent(
  concepts: readonly VocabularyConcept[],
  forms: readonly VocabularyReviewForm[] = VOCABULARY_REVIEW_FORMS,
  options: VocabularyValidationOptions = {},
): string[] {
  const issues: string[] = [];
  const ids = new Set(options.existingIds ?? []);
  concepts.forEach((concept, index) => {
    const path = `vocabulary[${index}]`;
    if (!CONTENT_ID_PATTERN.test(concept.id)) issues.push(`${path}.id must be a valid content ID`);
    if (ids.has(concept.id)) issues.push(`${path}.id duplicates content ID "${concept.id}"`);
    ids.add(concept.id);
    for (const field of ["written", "reading", "partOfSpeech"] as const) {
      if (typeof concept[field] !== "string" || !concept[field].trim()) issues.push(`${path}.${field} is required`);
    }
    if (!Array.isArray(concept.meanings) || concept.meanings.length === 0 || concept.meanings.some((meaning) => !meaning.trim())) issues.push(`${path}.meanings must contain non-empty strings`);
    for (const field of ["tags"] as const) if (!Array.isArray(concept[field]) || concept[field].some((tag) => !tag.trim())) issues.push(`${path}.${field} must contain non-empty strings`);
    if (concept.audioId && options.audioIds && !options.audioIds.includes(concept.audioId)) issues.push(`${path}.audioId references missing audio "${concept.audioId}"`);
    concept.examples?.forEach((example, exampleIndex) => {
      const examplePath = `${path}.examples[${exampleIndex}]`;
      for (const field of ["written", "reading", "meaning"] as const) if (typeof example[field] !== "string" || !example[field].trim()) issues.push(`${examplePath}.${field} is required`);
    });
  });
  const formIds = new Set<string>();
  forms.forEach((form, index) => {
    if (!CONTENT_ID_PATTERN.test(form.id)) issues.push(`vocabularyReviewForms[${index}].id must be a valid content ID`);
    if (formIds.has(form.id)) issues.push(`vocabularyReviewForms[${index}].id duplicates review form ID "${form.id}"`);
    formIds.add(form.id);
    const expected = form.kind === "meaning" ? ["written", "meanings"]
      : form.kind === "reading" ? ["written", "reading"]
        : form.kind === "production" ? ["meaning", "written"] : undefined;
    if (!expected || form.prompt !== expected[0] || form.answer !== expected[1]) issues.push(`vocabularyReviewForms[${index}] has an invalid kind, prompt, or answer mapping`);
  });
  const cards = generateVocabularyReviewCards(concepts, forms);
  const cardIds = new Set<string>();
  cards.forEach((card, index) => {
    if (!concepts.some((concept) => concept.id === card.conceptId)) issues.push(`generatedReviewCards[${index}].conceptId references missing vocabulary "${card.conceptId}"`);
    if (!formIds.has(card.formId)) issues.push(`generatedReviewCards[${index}].formId references missing review form "${card.formId}"`);
    if (cardIds.has(card.id)) issues.push(`generatedReviewCards[${index}].id duplicates review card ID "${card.id}"`);
    cardIds.add(card.id);
  });
  return issues;
}
