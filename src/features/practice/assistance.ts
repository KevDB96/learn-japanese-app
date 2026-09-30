import type { ConceptState } from "../../lib/storage/types.ts";

export type AssistanceStage = "new" | "learning" | "familiar";

/** Romaji support fades as familiarity grows; overrides should live only for the current session. */
export function getReadingAssistance(state: Pick<ConceptState, "lifecycle" | "familiarity"> | undefined, temporaryHelp = false) {
  const familiarity = Number.isFinite(state?.familiarity) ? Math.max(0, state!.familiarity) : 0;
  const stage: AssistanceStage = state?.lifecycle === "MASTERED" || state?.lifecycle === "FAMILIAR" || familiarity >= 3
    ? "familiar" : state?.lifecycle === "LEARNING" || familiarity >= 1 ? "learning" : "new";
  return { stage, showRomaji: temporaryHelp || stage === "new" || (stage === "learning" && familiarity < 2) };
}

/** A fluency run earns a time only after every answer is correct. */
export function scoreFluencyRun(answers: readonly boolean[], elapsedMs: number) {
  const correct = answers.filter(Boolean).length;
  const accuracy = answers.length ? correct / answers.length : 0;
  return { correct, total: answers.length, accuracy, complete: answers.length > 0 && correct === answers.length, elapsedMs: answers.length > 0 && correct === answers.length ? elapsedMs : undefined };
}
