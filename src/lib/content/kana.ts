import type { KanaConcept, KanaReviewForm, PronunciationManifest } from "./types.ts";
import { CONTENT_ID_PATTERN } from "./types.ts";

export const KANA_REVIEW_FORMS: readonly KanaReviewForm[] = Object.freeze([
  { id: "kana-glyph-to-sound", kind: "glyph-to-sound", prompt: "glyph", answer: "sound" },
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
  const glyphs = new Map<string, number>();
  concepts.forEach((concept, index) => {
    const path = `kana[${index}]`;
    if (!CONTENT_ID_PATTERN.test(concept.id)) issues.push(`${path}.id must be a valid content ID`);
    if (kanaById.has(concept.id)) issues.push(`${path}.id duplicates kana ID "${concept.id}"`);
    else kanaById.set(concept.id, concept);
    const glyphKey = `${concept.script}:${concept.glyph}`;
    if (glyphs.has(glyphKey)) issues.push(`${path}.glyph duplicates ${concept.script} glyph "${concept.glyph}" from kana[${glyphs.get(glyphKey)}]`);
    else glyphs.set(glyphKey, index);
    const expectedScript = concept.script === "hiragana" ? /[\u3040-\u309f]/u : /[\u30a0-\u30ff]/u;
    if (!expectedScript.test(concept.glyph) || [...concept.glyph].some((char) => !expectedScript.test(char))) issues.push(`${path}.glyph is invalid for ${concept.script}`);
    if (!concept.romanization.trim()) issues.push(`${path}.romanization is required`);
    if (!concept.row.trim()) issues.push(`${path}.row is required`);
    if (!Number.isInteger(concept.order) || concept.order < 0) issues.push(`${path}.order must be a non-negative integer`);
    for (const componentId of concept.componentIds) if (!kanaById.has(componentId) && !concepts.some((candidate) => candidate.id === componentId)) issues.push(`${path}.componentIds references missing kana "${componentId}"`);
    if (concept.audioId && !manifest.entries.some((entry) => entry.id === concept.audioId)) issues.push(`${path}.audioId references missing audio "${concept.audioId}"`);
  });
  const scriptMaps = (script: KanaConcept["script"]) => script === "katakana" ? {
    voiced: new Map([["\u30ab\u30ad\u30af\u30b1\u30b3", "\u30ac\u30ae\u30b0\u30b2\u30b4"], ["\u30b5\u30b7\u30b9\u30bb\u30bd", "\u30b6\u30b8\u30ba\u30bc\u30be"], ["\u30bf\u30c1\u30c4\u30c6\u30c8", "\u30c0\u30c2\u30c5\u30c7\u30c9"], ["\u30cf\u30d2\u30d5\u30d8\u30db", "\u30d0\u30d3\u30d6\u30d9\u30dc"]]),
    semi: new Map([["\u30cf\u30d2\u30d5\u30d8\u30db", "\u30d1\u30d4\u30d7\u30da\u30dd"]]),
    yoon: new Set(["\u30ad", "\u30ae", "\u30b7", "\u30b8", "\u30c1", "\u30c2", "\u30cb", "\u30d2", "\u30d3", "\u30d4", "\u30df", "\u30ea"]),
  } : {
    voiced: new Map([["\u304b\u304d\u304f\u3051\u3053", "\u304c\u304e\u3050\u3052\u3054"], ["\u3055\u3057\u3059\u305b\u305d", "\u3056\u3058\u305a\u305c\u305e"], ["\u305f\u3061\u3064\u3066\u3068", "\u3060\u3062\u3065\u3067\u3069"], ["\u306f\u3072\u3075\u3078\u307b", "\u3070\u3073\u3076\u3079\u307c"]]),
    semi: new Map([["\u306f\u3072\u3075\u3078\u307b", "\u3071\u3074\u3077\u307a\u307d"]]),
    yoon: new Set(["\u304d", "\u304e", "\u3057", "\u3058", "\u3061", "\u3062", "\u306b", "\u3072", "\u3073", "\u3074", "\u307f", "\u308a"]),
  };
  const markedLookup = (glyph: string, rows: Map<string, string>) => {
    for (const [plain, marked] of rows) { const at = [...marked].indexOf(glyph); if (at >= 0) return [...plain][at]; }
    return undefined;
  };
  concepts.forEach((concept, index) => {
    const path = `kana[${index}]`;
    const parts = concept.componentIds.map((componentId) => concepts.find((item) => item.id === componentId));
    const maps = scriptMaps(concept.script);
    if (concept.form === "base" && concept.componentIds.length !== 0) issues.push(`${path}.base kana cannot have components`);
    if (concept.form === "small" && !(concept.script === "hiragana" ? ["\u3083", "\u3085", "\u3087", "\u3063"] : ["\u30a1", "\u30a3", "\u30a5", "\u30a7", "\u30a9", "\u30e3", "\u30e5", "\u30e7", "\u30c3"]).includes(concept.glyph)) issues.push(`${path}.small kana glyph is not legal for ${concept.script}`);
    if (concept.form === "marked") {
      const plain = markedLookup(concept.glyph, maps.voiced) ?? markedLookup(concept.glyph, maps.semi);
      if (!plain || parts.length !== 1 || parts[0]?.glyph !== plain || parts[0]?.form !== "base") issues.push(`${path}.marked kana must link to its legal unmarked base`);
    }
    if (concept.form === "contracted") {
      const [base, small] = parts;
      const yoonSmall = concept.script === "hiragana" ? ["\u3083", "\u3085", "\u3087"] : ["\u30e3", "\u30e5", "\u30e7"];
      const loanSmall = ["\u30a1", "\u30a3", "\u30a5", "\u30a7", "\u30a9"];
      const legalExtended = new Set(["\u30c6\u30a3", "\u30c7\u30a3", "\u30d5\u30a1", "\u30d5\u30a3", "\u30d5\u30a7", "\u30d5\u30a9", "\u30a6\u30a3", "\u30a6\u30a7", "\u30a6\u30a9", "\u30c1\u30a7"]);
      const legalYoon = !!base && !!small && maps.yoon.has(base.glyph) && yoonSmall.includes(small.glyph);
      const legalLoanword = concept.script === "katakana" && !!base && !!small && ["base", "marked"].includes(base.form) && loanSmall.includes(small.glyph) && legalExtended.has(`${base.glyph}${small.glyph}`);
      if (parts.length !== 2 || !base || !small || small.form !== "small" || (!legalYoon && !legalLoanword)) issues.push(`${path}.contracted kana must link a legal yoon or extended Katakana combination`);
      else if (concept.glyph !== `${base.glyph}${small.glyph}`) issues.push(`${path}.contracted glyph must concatenate its components`);
    }
    if (concept.form === "small" && concept.componentIds.length !== 0) issues.push(`${path}.small kana cannot have components`);
    if (concept.form === "marker" && (concept.script !== "katakana" || concept.glyph !== "\u30fc" || concept.componentIds.length !== 0 || concept.reviewEligible !== false)) issues.push(`${path}.marker must be the non-review Katakana long-vowel mark \u30fc`);
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
