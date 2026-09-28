import { describe, expect, it } from "vitest";
import { kanaAudioManifest, kanaFixtures } from "../../content/kana-fixtures.ts";
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
    expect(forms).toHaveLength(kanaFixtures.length * 2);
    expect(new Set(forms.map((card) => card.id)).size).toBe(forms.length);
    expect(forms.every((card) => card.id === `${card.conceptId}--${card.formId}`)).toBe(true);
  });

  it("reports missing pronunciation coverage and tolerates unavailable providers", async () => {
    expect(kanaAudioCoverage(kanaFixtures, kanaAudioManifest)).toEqual({ total: 5, covered: 0, missingConceptIds: kanaFixtures.map(({ id }) => id) });
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
    expect(issues).toContain('duplicates kana ID "kana-hiragana-ka"');
    expect(issues).toContain('duplicates audio ID "audio-ka"');
    expect(issues).toContain('asset references missing bundled asset "audio/ka.ogg"');
    expect(issues).toContain('provider references unavailable provider "unknown"');
  });
});
