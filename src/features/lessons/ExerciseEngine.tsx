import { useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ExerciseDefinition } from "../../lib/content/types.ts";

export function normalizeExerciseAnswer(value: string, normalizeWhitespace = false): string {
  const trimmed = value.trim();
  return normalizeWhitespace ? trimmed.replace(/\s+/g, " ") : trimmed;
}

export function evaluateExerciseAnswer(exercise: ExerciseDefinition, answer: string): boolean {
  const normalize = (value: string) => normalizeExerciseAnswer(value, exercise.type === "short-text" && exercise.normalizeWhitespace === true);
  const expected = [exercise.answer, ...(exercise.type === "short-text" ? exercise.acceptedAnswers ?? [] : [])];
  return expected.some((value) => normalize(value) === normalize(answer));
}

type ExerciseRendererProps = { exercise: ExerciseDefinition; onComplete?: (id: string) => void; onIncorrect?: (exercise: ExerciseDefinition, answer: string) => void };
type ExerciseRenderer = (props: ExerciseRendererProps) => ReactNode;

function ChoiceExercise({ exercise, onComplete, onIncorrect }: ExerciseRendererProps) {
  if (exercise.type === "short-text") throw new Error("Short-text exercise dispatched to choice renderer");
  const [result, setResult] = useState<boolean | null>(null);
  const completed = useRef(false);
  const submit = (answer: string) => {
    if (result === true) return;
    const correct = evaluateExerciseAnswer(exercise, answer);
    setResult(correct);
    if (!correct) onIncorrect?.(exercise, answer);
    if (correct && !completed.current) { completed.current = true; onComplete?.(exercise.id); }
  };
  return <section aria-label={exercise.prompt}>
    <h4>{exercise.prompt}</h4>
    <div role="group" aria-label="Answer choices">{exercise.options.map((option: string, index: number) => <button type="button" key={`${option}-${index}`} onClick={() => submit(option)} disabled={result === true}>{option}</button>)}</div>
    {result !== null && <p role="status">{result ? exercise.feedback.success : exercise.feedback.explanation}</p>}
    {result !== null && <button type="button" onClick={() => setResult(null)}>{result ? "Continue" : "Try again"}</button>}
  </section>;
}

function TextExercise({ exercise, onComplete, onIncorrect }: ExerciseRendererProps) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<boolean | null>(null);
  const completed = useRef(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (result === true) return;
    const correct = evaluateExerciseAnswer(exercise, answer);
    setResult(correct);
    if (!correct) onIncorrect?.(exercise, answer);
    if (correct && !completed.current) { completed.current = true; onComplete?.(exercise.id); }
  };
  return <section aria-label={exercise.prompt}>
    <h4>{exercise.prompt}</h4>
    <form onSubmit={submit}><label>Answer <input value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={result === true} /></label><button type="submit" disabled={result === true}>Check</button></form>
    {result !== null && <p role="status">{result ? exercise.feedback.success : exercise.feedback.explanation}</p>}
    {result !== null && <button type="button" onClick={() => { setResult(null); setAnswer(""); }}>{result ? "Continue" : "Try again"}</button>}
  </section>;
}

export const exerciseRenderers: Readonly<Record<ExerciseDefinition["type"], ExerciseRenderer>> = Object.freeze({
  "multiple-choice": ChoiceExercise,
  "character-selection": ChoiceExercise,
  "short-text": TextExercise,
});

export function ExerciseRendererView(props: ExerciseRendererProps) {
  const Renderer = exerciseRenderers[props.exercise.type];
  return <Renderer {...props} />;
}

export function ExerciseSlot({ title, exercises, onIncorrect }: { title: string; exercises: readonly ExerciseDefinition[]; onIncorrect?: (exercise: ExerciseDefinition, answer: string) => void }) {
  const [completed, setCompleted] = useState<ReadonlySet<string>>(() => new Set());
  const complete = (id: string) => setCompleted((current) => current.has(id) ? current : new Set(current).add(id));
  return <section aria-label={title}><h3>{title}</h3>{exercises.map((exercise) => <div key={exercise.id} data-exercise-id={exercise.id}>
    <ExerciseRendererView exercise={exercise} onComplete={complete} onIncorrect={onIncorrect} />{completed.has(exercise.id) && <span className="sr-only" aria-label="Exercise completed">Completed</span>}
  </div>)}</section>;
}
