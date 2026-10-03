import { describe, expect, it } from "vitest";
import { kanaAudioManifest, kanaFixtures, katakanaAdvancedFixtures, katakanaFixtures } from "../../content/kana-fixtures.ts";
import type { ContentId } from "./types.ts";
import { KANA_REVIEW_FORMS, generateKanaReviewCards, kanaAudioCoverage, validateKanaContent } from "./kana.ts";
import { playPronunciation, type PronunciationProvider } from "./pronunciation.ts";

describe("kana content model", () => {
  it("validates representative base, marked, and contracted kana fixtures", () => {
    expect(validateKanaContent(kanaFixtures, KANA_REVIEW_FORMS, kanaAudioManifest)).toEqual([]);
  });

  it("generates stable concept-scoped review cards and omits unavailable audio", () => {
    const forms = generateKanaReviewCards(kanaFixtures);
    expect(forms).toEqual(generateKanaReviewCards(kanaFixtures));
    expect(forms).toHaveLength(kanaFixtures.filter((concept) => concept.reviewEligible !== false).length);
    expect(forms.every((card) => card.formId === "kana-glyph-to-sound")).toBe(true);
    expect(forms.some((card) => card.formId === "kana-sound-to-glyph" || card.formId === "kana-audio-to-glyph")).toBe(false);
    expect(new Set(forms.map((card) => card.id)).size).toBe(forms.length);
    expect(forms.every((card) => card.id === `${card.conceptId}--${card.formId}`)).toBe(true);
  });

  it("reports missing pronunciation coverage and tolerates unavailable providers", async () => {
    expect(kanaAudioCoverage(kanaFixtures, kanaAudioManifest)).toEqual({ total: kanaFixtures.length, covered: 0, missingConceptIds: kanaFixtures.map(({ id }) => id) });
    await expect(playPronunciation("kana-a", kanaAudioManifest, [])).resolves.toBe(false);
    const manifest = { version: 1, entries: [{ id: "kana-ka", provider: "test" }] } as const;
    const provider: PronunciationProvider = { id: "test", canPlay: () => true, play: async () => undefined };
    await expect(playPronunciation("kana-ka", manifest, [provider])).resolves.toBe(true);
  });

  it("rejects invalid glyphs, missing components/audio, and duplicate review forms", () => {
    const invalid = [{ ...kanaFixtures[0], glyph: "カ", componentIds: ["kana-absent" as ContentId], audioId: "audio-absent" }];
    const duplicateForms = [...KANA_REVIEW_FORMS, KANA_REVIEW_FORMS[0]];
    const issues = validateKanaContent(invalid, duplicateForms, kanaAudioManifest).join("\n");
    expect(issues).toContain("glyph is invalid for hiragana");
    expect(issues).toContain('componentIds references missing kana "kana-absent"');
    expect(issues).toContain('audioId references missing audio "audio-absent"');
    expect(issues).toContain('duplicates review form ID "kana-glyph-to-sound"');
  });

  it("rejects duplicate kana IDs and broken manifest asset/provider references", () => {
    const entries = [{ id: "audio-ka", provider: "bundled", asset: "audio/ka.ogg" }, { id: "audio-ka", provider: "unknown" }];
    const issues = validateKanaContent([kanaFixtures[0], kanaFixtures[0]], KANA_REVIEW_FORMS, { version: 1, entries }, { bundledAssets: [], providerIds: ["bundled"] }).join("\n");
    expect(issues).toContain('duplicates kana ID "kana-hira-ka"');
    expect(issues).toContain('duplicates audio ID "audio-ka"');
    expect(issues).toContain('asset references missing bundled asset "audio/ka.ogg"');
    expect(issues).toContain('provider references unavailable provider "unknown"');
  });

  it("rejects duplicate glyphs within a script", () => {
    const duplicate = { ...kanaFixtures[0]!, id: "kana-hira-ka-copy" as ContentId };
    expect(validateKanaContent([kanaFixtures[0]!, duplicate], KANA_REVIEW_FORMS, kanaAudioManifest).join("\n")).toContain('glyph duplicates hiragana glyph "か" from kana[0]');
  });

  it("models all marked rows and legal yoon through component relationships without scheduling every combination", () => {
    expect(kanaFixtures.filter(({ form }) => form === "marked")).toHaveLength(25);
    expect(kanaFixtures.filter(({ form }) => form === "contracted")).toHaveLength(33);
    expect(kanaFixtures.filter(({ form }) => form === "contracted").every(({ componentIds, reviewEligible }) => componentIds.length === 2 && reviewEligible === false)).toBe(true);
    expect(validateKanaContent(kanaFixtures, KANA_REVIEW_FORMS, kanaAudioManifest)).toEqual([]);
  });

  it("rejects illegal marked bases, small kana, and contracted relationships", () => {
    const invalid = [
      { ...kanaFixtures.find(({ form }) => form === "marked")!, componentIds: [kanaFixtures[0]!.id] },
      { ...kanaFixtures.find(({ form }) => form === "small")!, glyph: "あ" },
      { ...kanaFixtures.find(({ form }) => form === "contracted")!, componentIds: [kanaFixtures[0]!.id] },
    ];
    const issues = validateKanaContent(invalid, KANA_REVIEW_FORMS, kanaAudioManifest).join("\n");
    expect(issues).toContain("marked kana must link to its legal unmarked base");
    expect(issues).toContain("small kana glyph is not legal for hiragana");
    expect(issues).toContain("contracted kana must link a legal yoon or extended Katakana combination");
  });

  it("rejects illegal Katakana extended combinations and accepts only listed loanword forms", () => {
    const all = [...katakanaFixtures, ...katakanaAdvancedFixtures];
    expect(validateKanaContent(all, KANA_REVIEW_FORMS, kanaAudioManifest)).toEqual([]);
    const ti = katakanaAdvancedFixtures.find((item) => item.glyph === "ティ")!;
    const smallYa = katakanaAdvancedFixtures.find((item) => item.glyph === "ャ")!;
    const invalid = all.map((item) => item.id === ti.id ? { ...item, componentIds: [item.componentIds[0]!, smallYa.id] } : item);
    expect(validateKanaContent(invalid, KANA_REVIEW_FORMS, kanaAudioManifest).join("\n")).toContain("contracted kana must link a legal yoon or extended Katakana combination");
  });
});
