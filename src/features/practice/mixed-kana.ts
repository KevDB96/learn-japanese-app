import type { KanaConcept } from "../../lib/content/types.ts";
import type { ConceptState } from "../../lib/storage/types.ts";

export type PracticeMode = "recognition" | "reading" | "words";

export interface PracticeWord {
  readonly id: string;
  readonly display: string;
  readonly reading: string;
  readonly meaning: string;
}

export const SHORT_WORDS: readonly PracticeWord[] = [
  { id: "neko-hira", display: "ねこ", reading: "ねこ", meaning: "cat" },
  { id: "inu-hira", display: "いぬ", reading: "いぬ", meaning: "dog" },
  { id: "sushi-hira", display: "すし", reading: "すし", meaning: "sushi" },
  { id: "mizu-hira", display: "みず", reading: "みず", meaning: "water" },
  { id: "neko-kata", display: "ネコ", reading: "ねこ", meaning: "cat" },
  { id: "inu-kata", display: "イヌ", reading: "いぬ", meaning: "dog" },
  { id: "sushi-kata", display: "スシ", reading: "すし", meaning: "sushi" },
  { id: "neko-anime", display: "ねこアニメ", reading: "ねこあにめ", meaning: "cat anime" },
  { id: "anime", display: "アニメ", reading: "あにめ", meaning: "animation" },
];

export interface MixedKanaAvailability {
  readonly introduced: readonly KanaConcept[];
  readonly introducedIds: ReadonlySet<string>;
  readonly ready: boolean;
  readonly eligibleWords: readonly PracticeWord[];
}

export function getMixedKanaAvailability(
  kana: readonly KanaConcept[],
  states: readonly ConceptState[],
): MixedKanaAvailability {
  const introducedIds = new Set(states.filter((state) => state.lifecycle && state.lifecycle !== "UNSEEN").map((state) => state.conceptId));
  const introduced = kana.filter((concept) => introducedIds.has(concept.id));
  const ready = introduced.some((concept) => concept.script === "hiragana") && introduced.some((concept) => concept.script === "katakana");
  const conceptsByGlyph = new Map(kana.map((concept) => [concept.glyph, concept]));
  const eligibleWords = ready ? SHORT_WORDS.filter((word) => [...word.display, ...word.reading].every((glyph) => {
    const concept = conceptsByGlyph.get(glyph);
    return Boolean(concept && introducedIds.has(concept.id));
  })) : [];
  return { introduced, introducedIds, ready, eligibleWords };
}

export function recognitionQuestion(kana: readonly KanaConcept[], index: number): { readonly prompt: KanaConcept; readonly answer: KanaConcept; readonly options: readonly KanaConcept[] } | undefined {
  if (kana.length < 2) return undefined;
  const prompt = kana[((index % kana.length) + kana.length) % kana.length]!;
  const otherScript = kana.filter((item) => item.script !== prompt.script && item.romanization === prompt.romanization);
  if (otherScript.length === 0) return undefined;
  const answer = otherScript[0]!;
  const distractors = kana.filter((item) => item.script === answer.script && item.id !== answer.id).slice(0, 3);
  if (distractors.length === 0) return undefined;
  return { prompt, answer, options: [answer, ...distractors].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) };
}

export function eligibleReadingKana(kana: readonly KanaConcept[]): readonly KanaConcept[] {
  return kana.filter((concept) => concept.form === "base" && concept.reviewEligible !== false);
}
