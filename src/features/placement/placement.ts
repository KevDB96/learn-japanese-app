import type { KanaConcept } from "../../lib/content/types.ts";

export type PlacementScript = "hiragana" | "katakana" | "mixed";
export type PlacementQuestion = { readonly conceptId: string; readonly glyph: string; readonly answer: string; readonly script: "hiragana" | "katakana"; readonly combination: boolean };
export type PlacementAnswer = { readonly conceptId: string; readonly answer: string };

/** Stable, evenly spaced sampling keeps each placement repeatable and covers both scripts and combinations. */
export function buildPlacementQuestions(kana: readonly KanaConcept[], script: PlacementScript, count = 12): readonly PlacementQuestion[] {
  const eligible = kana.filter((item) => script === "mixed" || item.script === script)
    .sort((a, b) => a.script.localeCompare(b.script) || Number(a.form === "contracted") - Number(b.form === "contracted") || a.order - b.order || a.id.localeCompare(b.id));
  if (!eligible.length || count < 1) return [];
  const selected: KanaConcept[] = [];
  const step = eligible.length / Math.min(count, eligible.length);
  for (let i = 0; i < Math.min(count, eligible.length); i++) selected.push(eligible[Math.floor(i * step)]!);
  return selected.map((item) => ({ conceptId: item.id, glyph: item.glyph, answer: item.romanization, script: item.script, combination: item.form === "contracted" }));
}

export function scorePlacement(questions: readonly PlacementQuestion[], answers: readonly PlacementAnswer[]) {
  const answerMap = new Map(answers.map((answer) => [answer.conceptId, answer.answer.trim().toLocaleLowerCase()]));
  const scored = questions.map((question) => ({ ...question, correct: answerMap.get(question.conceptId) === question.answer.toLocaleLowerCase() }));
  const total = scored.length;
  const correct = scored.filter((question) => question.correct).length;
  const combinations = scored.filter((question) => question.combination);
  const combinationCorrect = combinations.filter((question) => question.correct).length;
  const byScript = (script: "hiragana" | "katakana") => {
    const subset = scored.filter((question) => question.script === script);
    return { correct: subset.filter((question) => question.correct).length, total: subset.length };
  };
  const passed = total > 0 && correct / total >= 0.8 && (!combinations.length || combinationCorrect / combinations.length >= 0.5);
  return { correct, total, passed, combinations: { correct: combinationCorrect, total: combinations.length }, hiragana: byScript("hiragana"), katakana: byScript("katakana"), scored };
}
