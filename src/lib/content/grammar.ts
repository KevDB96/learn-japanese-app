import { CONTENT_ID_PATTERN, type GrammarMiniLesson } from "./types.ts";
import type { ContentId, ExerciseDefinition } from "./types.ts";

export interface GrammarClozeReviewCard {
  readonly id: string;
  readonly conceptId: ContentId;
  readonly formId: "grammar-cloze";
  readonly kind: "cloze";
  readonly prompt: string;
  readonly answers: readonly string[];
  readonly reading: string;
  readonly exercise: Extract<ExerciseDefinition, { type: "cloze" }>;
}

/** Scheduled clozes reuse authored lesson blanks and keep scheduling at grammar-point granularity. */
export function generateGrammarClozeReviewCards(lessons: readonly GrammarMiniLesson[]): GrammarClozeReviewCard[] {
  return lessons.flatMap((lesson) => lesson.exercises.flatMap((exercise) => exercise.type === "cloze" ? [{
    id: `${lesson.id}--${exercise.id}`, conceptId: lesson.id, formId: "grammar-cloze" as const, kind: "cloze" as const,
    prompt: exercise.prompt, answers: [exercise.answer, ...(exercise.acceptedAnswers ?? [])], reading: `${exercise.before}___${exercise.after}`, exercise,
  }] : [])).sort((a, b) => a.conceptId.localeCompare(b.conceptId) || a.id.localeCompare(b.id));
}

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** Validates grammar dependencies and prevents examples from using untaught grammar. */
export function validateGrammarContent(lessons: readonly GrammarMiniLesson[]): string[] {
  const issues: string[] = [];
  const lessonIds = new Set<string>();
  const allIds = new Set<string>();
  lessons.forEach((lesson, index) => {
    const path = `grammar[${index}]`;
    for (const [id, label] of [[lesson.id, "id"], ...lesson.examples.map((example) => [example.id, "example id"] as const)] as const) {
      if (!CONTENT_ID_PATTERN.test(id)) issues.push(`${path}.${label} must be a valid content ID`);
      else if (allIds.has(id)) issues.push(`${path}.${label} duplicates content ID "${id}"`);
      else allIds.add(id);
    }
    lessonIds.add(lesson.id);
    if (!nonEmpty(lesson.display)) issues.push(`${path}.display is required`);
    if (!nonEmpty(lesson.shortExplanation)) issues.push(`${path}.shortExplanation is required`);
    if (!nonEmpty(lesson.fullExplanation)) issues.push(`${path}.fullExplanation is required`);
    lesson.requires.forEach((id) => { if (!CONTENT_ID_PATTERN.test(id)) issues.push(`${path}.requires contains an invalid content ID`); });
    lesson.examples.forEach((example, exampleIndex) => {
      const examplePath = `${path}.examples[${exampleIndex}]`;
      for (const field of ["japanese", "reading", "translation"] as const) if (!nonEmpty(example[field])) issues.push(`${examplePath}.${field} is required`);
      if (example.grammarIds.length === 0) issues.push(`${examplePath}.grammarIds must identify the grammar used`);
      example.grammarIds.forEach((id) => { if (!CONTENT_ID_PATTERN.test(id)) issues.push(`${examplePath}.grammarIds contains an invalid content ID`); });
    });
    if (!lesson.commonMistakes.length || lesson.commonMistakes.some((mistake) => !nonEmpty(mistake))) issues.push(`${path}.commonMistakes must contain non-empty text`);
    lesson.relatedConceptIds.forEach((id) => { if (!CONTENT_ID_PATTERN.test(id)) issues.push(`${path}.relatedConceptIds contains an invalid content ID`); });
    if (!lesson.exercises.length) issues.push(`${path}.exercises must contain at least one exercise after the explanation`);
    const exerciseIds = new Set<string>();
    lesson.exercises.forEach((exercise, exerciseIndex) => {
      const exercisePath = `${path}.exercises[${exerciseIndex}]`;
      if (!CONTENT_ID_PATTERN.test(exercise.id)) issues.push(`${exercisePath}.id must be a valid content ID`);
      if (exerciseIds.has(exercise.id)) issues.push(`${exercisePath}.id duplicates exercise ID "${exercise.id}"`);
      exerciseIds.add(exercise.id);
      if (!nonEmpty(exercise.prompt)) issues.push(`${exercisePath}.prompt is required`);
      if (!nonEmpty(exercise.feedback.success) || !nonEmpty(exercise.feedback.explanation)) issues.push(`${exercisePath}.feedback must include success and explanation`);
      if (!nonEmpty(exercise.answer)) issues.push(`${exercisePath}.answer is required`);
      if ((exercise.type === "multiple-choice" || exercise.type === "character-selection") && (exercise.options.length < 2 || exercise.options.some((option) => !nonEmpty(option)))) issues.push(`${exercisePath}.options must contain at least two non-empty strings`);
      if (exercise.type === "cloze") {
        if (typeof exercise.before !== "string" || typeof exercise.after !== "string" || (!exercise.before && !exercise.after)) issues.push(`${exercisePath} must include cloze context around one blank`);
        if (!nonEmpty(exercise.explanation)) issues.push(`${exercisePath}.explanation is required`);
        if (exercise.acceptedAnswers?.some((answer) => !nonEmpty(answer))) issues.push(`${exercisePath}.acceptedAnswers must contain non-empty strings`);
      }
    });
  });
  for (const [index, lesson] of lessons.entries()) for (const prerequisite of lesson.requires) {
    if (!lessonIds.has(prerequisite)) issues.push(`grammar[${index}].requires references missing grammar prerequisite "${prerequisite}"`);
  }
  for (const [index, lesson] of lessons.entries()) for (const related of lesson.relatedConceptIds) {
    if (!lessonIds.has(related)) issues.push(`grammar[${index}].relatedConceptIds references missing grammar concept "${related}"`);
  }

  const available = (id: string, seen = new Set<string>()): Set<string> => {
    if (seen.has(id)) return new Set();
    seen.add(id);
    const lesson = lessons.find((item) => item.id === id);
    return new Set([id, ...(lesson?.requires ?? []).flatMap((required) => [...available(required, seen)])]);
  };
  const visited = new Set<string>();
  const active: string[] = [];
  const visit = (id: string) => {
    if (active.includes(id)) { issues.push(`grammar dependency cycle: ${[...active.slice(active.indexOf(id)), id].join(" -> ")}`); return; }
    if (visited.has(id)) return;
    active.push(id);
    for (const required of lessons.find((item) => item.id === id)?.requires ?? []) if (lessonIds.has(required)) visit(required);
    active.pop();
    visited.add(id);
  };
  lessons.forEach((lesson) => visit(lesson.id));

  lessons.forEach((lesson, index) => {
    const taught = available(lesson.id);
    lesson.examples.forEach((example, exampleIndex) => example.grammarIds.forEach((grammarId) => {
      if (!taught.has(grammarId)) issues.push(`grammar[${index}].examples[${exampleIndex}] uses grammar "${grammarId}" before it is taught`);
    }));
  });
  return issues;
}
