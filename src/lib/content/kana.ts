import type { KanaConcept, KanaReviewForm, PronunciationManifest } from "./types.ts";
import { CONTENT_ID_PATTERN } from "./types.ts";

export const KANA_REVIEW_FORMS: readonly KanaReviewForm[] = Object.freeze([
  { id: "kana-glyph-to-sound", kind: "glyph-to-sound", prompt: "glyph", answer: "sound" },
  { id: "kana-sound-to-glyph", kind: "sound-to-glyph", prompt: "sound", answer: "glyph" },
  { id: "kana-audio-to-glyph", kind: "audio-to-glyph", prompt: "audio", answer: "glyph" },
]);

export interface KanaReviewCard {
  readonly id: string;
  readonly conceptId: string;
  readonly formId: string;
  readonly kind: KanaReviewForm["kind"];
}

/** Cards have concept-scoped IDs; shared form IDs describe a prompt and never own memory themselves. */
export function generateKanaReviewCards(concepts: readonly KanaConcept[], forms: readonly KanaReviewForm[] = KANA_REVIEW_FORMS, manifest?: PronunciationManifest): KanaReviewCard[] {
  const audioIds = new Set((manifest?.entries ?? []).map((entry) => entry.id));
  const cards = concepts.filter((concept) => concept.reviewEligible !== false).flatMap((concept) => forms
    .filter((form) => form.kind !== "audio-to-glyph" || (!!concept.audioId && audioIds.has(concept.audioId)))
    .map((form) => ({ id: `${concept.id}--${form.id}`, conceptId: concept.id, formId: form.id, kind: form.kind })));
  return cards.sort((a, b) => a.conceptId.localeCompare(b.conceptId) || a.formId.localeCompare(b.formId));
}

export function reviewCardsForConcept(concept: KanaConcept, forms: readonly KanaReviewForm[] = KANA_REVIEW_FORMS, manifest?: PronunciationManifest): KanaReviewCard[] {
  return generateKanaReviewCards([concept], forms, manifest)
}

export interface KanaValidationOptions {
  readonly bundledAssets?: readonly string[];
  readonly providerIds?: readonly string[];
}

/** Deterministic validator for the canonical kana graph and its review/audio metadata. */
export function validateKanaContent(concepts: readonly KanaConcept[], forms: readonly KanaReviewForm[], manifest: PronunciationManifest, options: KanaValidationOptions = {}): string[] {
  const issues: string[] = [];
  const kanaById = new Map<string, KanaConcept>();
  concepts.forEach((concept, index) => {
    const path = `kana[${index}]`;
    if (!CONTENT_ID_PATTERN.test(concept.id)) issues.push(`${path}.id must be a valid content ID`);
    if (kanaById.has(concept.id)) issues.push(`${path}.id duplicates kana ID "${concept.id}"`);
    else kanaById.set(concept.id, concept);
    const expectedScript = concept.script === "hiragana" ? /[\u3040-\u309f]/u : /[\u30a0-\u30ff]/u;
    if (!expectedScript.test(concept.glyph) || [...concept.glyph].some((char) => !expectedScript.test(char))) issues.push(`${path}.glyph is invalid for ${concept.script}`);
    if (!concept.romanization.trim()) issues.push(`${path}.romanization is required`);
    if (!concept.row.trim()) issues.push(`${path}.row is required`);
    if (!Number.isInteger(concept.order) || concept.order < 0) issues.push(`${path}.order must be a non-negative integer`);
    for (const componentId of concept.componentIds) if (!kanaById.has(componentId) && !concepts.some((candidate) => candidate.id === componentId)) issues.push(`${path}.componentIds references missing kana "${componentId}"`);
    if (concept.audioId && !manifest.entries.some((entry) => entry.id === concept.audioId)) issues.push(`${path}.audioId references missing audio "${concept.audioId}"`);
  });
  const voiced = new Map([["かきくけこ", "がぎぐげご"], ["さしすせそ", "ざじずぜぞ"], ["たちつてと", "だぢづでど"], ["はひふへほ", "ばびぶべぼ"]]);
  const semiVoiced = new Map([["はひふへほ", "ぱぴぷぺぽ"]]);
  const yoonBases = new Set(["き", "ぎ", "し", "じ", "ち", "ぢ", "に", "ひ", "び", "ぴ", "み", "り"]);
  const markedLookup = (glyph: string, rows: Map<string, string>) => {
    for (const [plain, marked] of rows) { const at = [...marked].indexOf(glyph); if (at >= 0) return [...plain][at]; }
    return undefined;
  };
  concepts.forEach((concept, index) => {
    const path = `kana[${index}]`;
    const parts = concept.componentIds.map((componentId) => concepts.find((item) => item.id === componentId));
    if (concept.form === "base" && concept.componentIds.length !== 0) issues.push(`${path}.base kana cannot have components`);
    if (concept.form === "small" && !["ゃ", "ゅ", "ょ", "っ"].includes(concept.glyph)) issues.push(`${path}.small kana must be ゃ, ゅ, ょ, or っ`);
    if (concept.form === "marked") {
      const plain = markedLookup(concept.glyph, voiced) ?? markedLookup(concept.glyph, semiVoiced);
      if (!plain || parts.length !== 1 || parts[0]?.glyph !== plain || parts[0]?.form !== "base") issues.push(`${path}.marked kana must link to its legal unmarked base`);
    }
    if (concept.form === "contracted") {
      const [base, small] = parts;
      if (parts.length !== 2 || !base || !small || base.form === "small" || !yoonBases.has(base.glyph) || small.form !== "small" || !["ゃ", "ゅ", "ょ"].includes(small.glyph)) issues.push(`${path}.contracted kana must link a valid yoon base and small ゃ, ゅ, or ょ`);
      else if (concept.glyph !== `${base.glyph}${small.glyph}`) issues.push(`${path}.contracted glyph must concatenate its components`);
    }
    if (concept.form === "small" && concept.componentIds.length !== 0) issues.push(`${path}.small kana cannot have components`);
  });
  const formIds = new Set<string>();
  forms.forEach((form, index) => {
    if (!CONTENT_ID_PATTERN.test(form.id)) issues.push(`reviewForms[${index}].id must be a valid content ID`);
    if (formIds.has(form.id)) issues.push(`reviewForms[${index}].id duplicates review form ID "${form.id}"`);
    formIds.add(form.id);
  });
  if (!Number.isInteger(manifest.version) || manifest.version < 1) issues.push("audioManifest.version must be a positive integer");
  const audioIds = new Set<string>();
  manifest.entries.forEach((entry, index) => {
    if (!CONTENT_ID_PATTERN.test(entry.id)) issues.push(`audioManifest.entries[${index}].id must be a valid content ID`);
    if (audioIds.has(entry.id)) issues.push(`audioManifest.entries[${index}].id duplicates audio ID "${entry.id}"`);
    audioIds.add(entry.id);
    if (options.providerIds && !options.providerIds.includes(entry.provider)) issues.push(`audioManifest.entries[${index}].provider references unavailable provider "${entry.provider}"`);
    if (entry.asset && options.bundledAssets && !options.bundledAssets.includes(entry.asset)) issues.push(`audioManifest.entries[${index}].asset references missing bundled asset "${entry.asset}"`);
  });
  return issues;
}

export function kanaAudioCoverage(concepts: readonly KanaConcept[], manifest: PronunciationManifest): { readonly total: number; readonly covered: number; readonly missingConceptIds: readonly string[] } {
  const ids = new Set(manifest.entries.map((entry) => entry.id));
  const missingConceptIds = concepts.filter((concept) => !concept.audioId || !ids.has(concept.audioId)).map((concept) => concept.id);
  return { total: concepts.length, covered: concepts.length - missingConceptIds.length, missingConceptIds };
}
