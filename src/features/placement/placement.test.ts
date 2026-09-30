import { describe, expect, it } from "vitest";
import { kanaFixtures, katakanaFixtures, katakanaAdvancedFixtures } from "../../content/kana-fixtures.ts";
import { buildPlacementQuestions, scorePlacement } from "./placement.ts";

const allKana = [...kanaFixtures, ...katakanaFixtures, ...katakanaAdvancedFixtures];
describe("kana placement", () => {
  it("samples both scripts and combinations in mixed placement", () => {
    const questions = buildPlacementQuestions(allKana, "mixed", 18);
    expect(new Set(questions.map((item) => item.script))).toEqual(new Set(["hiragana", "katakana"]));
    expect(questions.some((item) => item.combination)).toBe(true);
    expect(buildPlacementQuestions(allKana, "hiragana").every((item) => item.script === "hiragana")).toBe(true);
    expect(buildPlacementQuestions(allKana, "katakana").every((item) => item.script === "katakana")).toBe(true);
  });

  it("requires an overall threshold and combination check before placement unlock", () => {
    const questions = buildPlacementQuestions(allKana, "mixed", 18);
    const perfect = questions.map((item) => ({ conceptId: item.conceptId, answer: item.answer }));
    expect(scorePlacement(questions, perfect).passed).toBe(true);
    const weak = perfect.map((item, index) => index < 5 ? { ...item, answer: "wrong" } : item);
    expect(scorePlacement(questions, weak).passed).toBe(false);
    const noCombination = questions.filter((item) => !item.combination).map((item) => ({ conceptId: item.conceptId, answer: item.answer }));
    expect(scorePlacement(questions, noCombination).passed).toBe(false);
  });
});
