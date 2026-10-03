import { CONTENT_ID_PATTERN, type PhraseConcept, type PhraseReviewForm } from "./types.ts";

export const PHRASE_REVIEW_FORMS: readonly PhraseReviewForm[] = Object.freeze([
  { id: "phrase-meaning", kind: "meaning", prompt: "japanese", answer: "meaning" },
]);

export interface PhraseReviewCard {
  readonly id: string;
  readonly conceptId: string;
  readonly formId: string;
  readonly kind: PhraseReviewForm["kind"];
  readonly prompt: string;
  readonly answers: readonly string[];
  readonly reading: string;
  readonly audioId?: string;
}

/** Only memorized expressions get standalone cards; compositional examples are practiced through grammar. */
export function generatePhraseReviewCards(concepts: readonly PhraseConcept[], forms: readonly PhraseReviewForm[] = PHRASE_REVIEW_FORMS): PhraseReviewCard[] {
  return concepts.filter(({ learningMode }) => learningMode === "memorized").flatMap((concept) => forms.map((form) => ({
    id: `${concept.id}--${form.id}`,
    conceptId: concept.id,
    formId: form.id,
    kind: form.kind,
    prompt: form.prompt === "meaning" ? concept.meaning : concept.japanese,
    answers: [form.answer === "meaning" ? concept.meaning : concept.japanese],
    reading: concept.reading,
    ...(concept.audioId ? { audioId: concept.audioId } : {}),
  }))).sort((a, b) => a.conceptId.localeCompare(b.conceptId) || a.formId.localeCompare(b.formId));
}

export interface PhraseValidationOptions {
  readonly grammarIds?: readonly string[];
  readonly audioIds?: readonly string[];
  readonly existingIds?: readonly string[];
}

const KANA_READING = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・、。！？\s]+$/u;
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function validatePhraseContent(concepts: readonly PhraseConcept[], forms: readonly PhraseReviewForm[] = PHRASE_REVIEW_FORMS, options: PhraseValidationOptions = {}): string[] {
  const issues: string[] = [];
  const ids = new Set(options.existingIds ?? []);
  concepts.forEach((concept, index) => {
    const path = `phrases[${index}]`;
    if (!CONTENT_ID_PATTERN.test(concept.id)) issues.push(`${path}.id must be a valid content ID`);
    if (ids.has(concept.id)) issues.push(`${path}.id duplicates content ID "${concept.id}"`);
    ids.add(concept.id);
    for (const field of ["japanese", "reading", "meaning"] as const) if (!nonEmpty(concept[field])) issues.push(`${path}.${field} is required`);
    if (nonEmpty(concept.reading) && !KANA_READING.test(concept.reading)) issues.push(`${path}.reading must use kana only`);
    if (!("memorized" === concept.learningMode || "compositional" === concept.learningMode)) issues.push(`${path}.learningMode is invalid`);
    if (!("casual" === concept.formality || "polite" === concept.formality || "formal" === concept.formality)) issues.push(`${path}.formality is invalid`);
    if (!concept.usageNotes.length || concept.usageNotes.some((note) => !nonEmpty(note))) issues.push(`${path}.usageNotes must contain non-empty strings`);
    if (concept.learningMode === "compositional" && concept.grammarIds.length === 0) issues.push(`${path}.grammarIds must identify the grammar used by a compositional phrase`);
    if (concept.learningMode === "memorized" && concept.grammarIds.length > 0) issues.push(`${path}.grammarIds must be empty for a memorized phrase`);
    concept.grammarIds.forEach((id) => {
      if (!CONTENT_ID_PATTERN.test(id)) issues.push(`${path}.grammarIds contains an invalid content ID`);
      else if (options.grammarIds && !options.grammarIds.includes(id)) issues.push(`${path}.grammarIds references missing grammar "${id}"`);
    });
    if (concept.audioId && options.audioIds && !options.audioIds.includes(concept.audioId)) issues.push(`${path}.audioId references missing audio "${concept.audioId}"`);
    concept.literalBreakdown?.forEach((part, partIndex) => {
      const partPath = `${path}.literalBreakdown[${partIndex}]`;
      for (const field of ["japanese", "reading", "meaning"] as const) if (!nonEmpty(part[field])) issues.push(`${partPath}.${field} is required`);
      if (nonEmpty(part.reading) && !KANA_READING.test(part.reading)) issues.push(`${partPath}.reading must use kana only`);
    });
  });
  const formIds = new Set<string>();
  forms.forEach((form, index) => {
    if (!CONTENT_ID_PATTERN.test(form.id)) issues.push(`phraseReviewForms[${index}].id must be a valid content ID`);
    if (formIds.has(form.id)) issues.push(`phraseReviewForms[${index}].id duplicates review form ID "${form.id}"`);
    formIds.add(form.id);
    const expected = form.kind === "meaning" ? ["japanese", "meaning"] : form.kind === "production" ? ["meaning", "japanese"] : undefined;
    if (!expected || form.prompt !== expected[0] || form.answer !== expected[1]) issues.push(`phraseReviewForms[${index}] has an invalid kind, prompt, or answer mapping`);
  });
  const cards = generatePhraseReviewCards(concepts, forms);
  const cardIds = new Set<string>();
  cards.forEach((card, index) => {
    if (!ids.has(card.conceptId)) issues.push(`generatedReviewCards[${index}].conceptId references missing phrase "${card.conceptId}"`);
    if (!formIds.has(card.formId)) issues.push(`generatedReviewCards[${index}].formId references missing review form "${card.formId}"`);
    if (cardIds.has(card.id)) issues.push(`generatedReviewCards[${index}].id duplicates review card ID "${card.id}"`);
    cardIds.add(card.id);
  });
  return issues;
}
