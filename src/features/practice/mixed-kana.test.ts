import { describe, expect, it } from "vitest";
import { kanaFixtures, katakanaFixtures } from "../../content/kana-fixtures.ts";
import type { ConceptState } from "../../lib/storage/types.ts";
import { eligibleReadingKana, getMixedKanaAvailability, recognitionQuestion } from "./mixed-kana.ts";

const state = (conceptId: string, lifecycle: ConceptState["lifecycle"] = "INTRODUCED"): ConceptState => ({
  id: conceptId, recordVersion: 1, updatedAt: "2026-09-30T00:00:00.000Z", conceptId, lifecycle, familiarity: 0,
});
const all = [...kanaFixtures, ...katakanaFixtures];

describe("mixed kana practice availability", () => {
  it("waits until the learner has introduced concepts in both scripts", () => {
    expect(getMixedKanaAvailability(all, [state("kana-hira-ka")]).ready).toBe(false);
    expect(getMixedKanaAvailability(all, [state("kana-hira-ka"), state("kana-kata-ka", "UNSEEN")]).ready).toBe(false);
    expect(getMixedKanaAvailability(all, [state("kana-hira-ka"), state("kana-kata-ka")]).ready).toBe(true);
  });

  it("unlocks each real short word only after all displayed and reading kana are introduced", () => {
    const concepts = ["kana-hira-ne", "kana-hira-ko", "kana-hira-i", "kana-hira-nu", "kana-kata-ne", "kana-kata-ko"];
    const words = getMixedKanaAvailability(all, concepts.map((id) => state(id))).eligibleWords;
    expect(words.map((word) => word.id)).toEqual(["neko-hira", "inu-hira", "neko-kata"]);
    const withoutKo = getMixedKanaAvailability(all, concepts.filter((id) => id !== "kana-hira-ko").map((id) => state(id))).eligibleWords;
    expect(withoutKo.some((word) => word.id === "neko-hira" || word.id === "neko-kata")).toBe(false);
  });

  it("offers cross-script recognition only for introduced counterparts and distractors", () => {
    const known = all.filter((item) => ["kana-hira-ka", "kana-kata-ka", "kana-kata-ki", "kana-kata-ku", "kana-kata-ke"].includes(item.id));
    const question = recognitionQuestion(known, 0);
    expect(question).toBeDefined();
    expect(question?.answer.glyph).toBe("カ");
    expect(question?.options.every((item) => known.some((candidate) => candidate.id === item.id))).toBe(true);
    expect(recognitionQuestion(known.slice(0, 2), 0)).toBeUndefined();
    expect(recognitionQuestion(known.filter((item) => item.script === "hiragana"), 0)).toBeUndefined();
  });

  it("limits reading glyph drills to introduced base kana", () => {
    expect(eligibleReadingKana([all[0]!, ...kanaFixtures.filter((item) => item.form !== "base")])).toEqual([all[0]]);
  });
});
