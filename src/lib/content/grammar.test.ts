import { describe, expect, it } from "vitest";
import { grammarFixtures } from "../../content/grammar-fixtures.ts";
import { generateGrammarClozeReviewCards, validateGrammarContent } from "./grammar.ts";
import type { ContentId } from "./types.ts";
const ids = (...values: string[]) => values.map((value) => value as ContentId);

describe("grammar mini-lessons", () => {
  it("provides stable beginner lessons with explanation, examples, mistakes, and practice", () => {
    expect(grammarFixtures.map(({ id }) => id)).toEqual(["grammar-topic-wa", "grammar-desu-copula", "grammar-ka-question"]);
    expect(validateGrammarContent(grammarFixtures)).toEqual([]);
    for (const lesson of grammarFixtures) {
      expect(lesson.shortExplanation.length).toBeGreaterThan(0);
      expect(lesson.fullExplanation.length).toBeGreaterThan(lesson.shortExplanation.length);
      expect(lesson.examples.length).toBeGreaterThan(0);
      expect(lesson.commonMistakes.length).toBeGreaterThan(0);
      expect(lesson.exercises.length).toBeGreaterThan(0);
    }
  });

  it("rejects examples that use grammar outside the lesson prerequisite chain", () => {
    const changed = grammarFixtures.map((lesson, index) => index === 0 ? {
      ...lesson,
      examples: [{ ...lesson.examples[0]!, grammarIds: ids("grammar-ka-question") }],
    } : lesson);
    expect(validateGrammarContent(changed)).toContain('grammar[0].examples[0] uses grammar "grammar-ka-question" before it is taught');
  });

  it("rejects missing prerequisite/related references and dependency cycles", () => {
    const changed = grammarFixtures.map((lesson, index) => index === 0
      ? { ...lesson, requires: ids("grammar-missing") }
      : index === 1 ? { ...lesson, requires: ids("grammar-ka-question") } : lesson);
    const errors = validateGrammarContent(changed).join("\n");
    expect(errors).toContain('grammar[0].requires references missing grammar prerequisite "grammar-missing"');
    expect(errors).toContain("grammar dependency cycle:");
  });

  it("generates stable scheduled cloze cards from explicitly authored grammar blanks", () => {
    const cards = generateGrammarClozeReviewCards(grammarFixtures);
    expect(cards.map((card) => card.id)).toEqual(generateGrammarClozeReviewCards(grammarFixtures).map((card) => card.id));
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => card.kind === "cloze" && card.conceptId.startsWith("grammar-") && card.answers.length > 0)).toBe(true);
  });
});
