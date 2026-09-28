import type { ContentId, KanaConcept, PronunciationManifest } from "../lib/content/types.ts";

const id = (value: string) => value as ContentId;

/** Small contract fixtures only; the full kana course is authored separately. */
export const kanaFixtures: readonly KanaConcept[] = [
  { id: id("kana-hiragana-ka"), script: "hiragana", glyph: "か", romanization: "ka", row: "k-row", order: 0, form: "base", componentIds: [] },
  { id: id("kana-hiragana-ga"), script: "hiragana", glyph: "が", romanization: "ga", row: "k-row", order: 1, form: "marked", componentIds: [id("kana-hiragana-ka")] },
  { id: id("kana-hiragana-kya"), script: "hiragana", glyph: "きゃ", romanization: "kya", row: "yoon-k-row", order: 0, form: "contracted", componentIds: [id("kana-hiragana-ki"), id("kana-hiragana-small-ya")] },
  { id: id("kana-hiragana-ki"), script: "hiragana", glyph: "き", romanization: "ki", row: "k-row", order: 1, form: "base", componentIds: [] },
  { id: id("kana-hiragana-small-ya"), script: "hiragana", glyph: "ゃ", romanization: "ya", row: "y-row", order: 1, form: "small", componentIds: [] },
];

export const kanaAudioManifest: PronunciationManifest = { version: 1, entries: [] };
