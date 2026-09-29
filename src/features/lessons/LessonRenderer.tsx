import type { ReactNode } from "react";
import type { ExerciseDefinition, Lesson, LessonBlock } from "../../lib/content/types.ts";
import { ExerciseSlot } from "./ExerciseEngine.tsx";

type Renderer<K extends LessonBlock["kind"]> = (props: { block: Extract<LessonBlock, { kind: K }>; onIncorrect?: (exercise: ExerciseDefinition, answer: string) => void }) => ReactNode;
const renderers: { readonly [K in LessonBlock["kind"]]: Renderer<K> } = {
  heading: ({ block }) => block.level === 3 ? <h3>{block.text}</h3> : <h2>{block.text}</h2>,
  paragraph: ({ block }) => <p>{block.text}</p>,
  "japanese-example": ({ block }) => <p className="japanese-example"><span lang="ja">{block.japanese}</span>{block.reading && <span className="reading" lang="ja-Latn">{block.reading}</span>}{block.translation && <span className="translation" lang="en">{block.translation}</span>}</p>,
  callout: ({ block }) => <aside className="lesson-callout">{block.title && <h3>{block.title}</h3>}<p>{block.text}</p></aside>,
  "kana-grid": ({ block }) => <section><h3>{block.title}</h3><ul className="kana-grid">{block.characters.map((item, index) => <li key={`${item.kana}-${index}`}><span lang="ja">{item.kana}</span><span lang="ja-Latn">{item.reading}</span></li>)}</ul></section>,
  "character-comparison": ({ block }) => <section><h3>{block.title}</h3><ul className="character-comparison">{block.pairs.map((item, index) => <li key={`${item.reading}-${index}`}><span lang="ja">{item.hiragana}</span><span lang="ja">{item.katakana}</span><span lang="ja-Latn">{item.reading}</span></li>)}</ul></section>,
  "vocabulary-list": ({ block }) => <section>{block.title && <h3>{block.title}</h3>}<ul>{block.items.map((item, index) => <li key={`${item.japanese}-${index}`}><span lang="ja">{item.japanese}</span> <span lang="ja-Latn">{item.reading}</span> <span lang="en">{item.translation}</span></li>)}</ul></section>,
  "grammar-breakdown": ({ block }) => <section>{block.title && <h3>{block.title}</h3>}<p><span lang="ja">{block.japanese}</span>{block.reading && <> <span lang="ja-Latn">{block.reading}</span></>} <span lang="en">{block.translation}</span></p><ol>{block.parts.map((part, index) => <li key={`${part.text}-${index}`}><span lang="ja">{part.text}</span>{part.reading && <> <span lang="ja-Latn">{part.reading}</span></>} <span lang="en">{part.meaning}</span></li>)}</ol></section>,
  audio: ({ block }) => <button type="button" disabled aria-label={`${block.label}: audio not available`} data-audio-reference={block.reference}>{block.label} · Audio unavailable</button>,
  "exercise-slot": ({ block, onIncorrect }) => <ExerciseSlot title={block.title} exercises={block.exercises} onIncorrect={onIncorrect} />,
  checkpoint: ({ block }) => <section><h2>{block.title}</h2><ul>{block.points.map((point, index) => <li key={`${point}-${index}`}>{point}</li>)}</ul></section>,
  text: ({ block }) => <p><span lang="ja">{block.display}</span> <span lang="en">{block.translation}</span></p>,
  "concept-ref": ({ block }) => <span data-content-reference={block.conceptId} />,
  "sentence-ref": ({ block }) => <span data-content-reference={block.sentenceId} />,
};

export class InvalidLessonBlockError extends Error {
  constructor(readonly blockId: string, readonly kind: string) {
    super(`Invalid lesson block "${blockId}": unknown kind "${kind}"`);
    this.name = "InvalidLessonBlockError";
  }
}

export function renderLessonBlock(block: LessonBlock | (Omit<LessonBlock, "kind"> & { kind: string }), onIncorrect?: (exercise: ExerciseDefinition, answer: string) => void): ReactNode {
  const renderer = renderers[block.kind as LessonBlock["kind"]] as ((props: { block: never; onIncorrect?: (exercise: ExerciseDefinition, answer: string) => void }) => ReactNode) | undefined;
  if (!renderer) throw new InvalidLessonBlockError(block.id, block.kind);
  return renderer({ block: block as never, onIncorrect });
}

export function LessonRenderer({ lesson, onIncorrect }: { lesson: Lesson; onIncorrect?: (exercise: ExerciseDefinition, answer: string) => void }) {
  return <article className="lesson-content" aria-label={lesson.display}>{lesson.blocks.map((block) => <div key={block.id} data-block-id={block.id}>{renderLessonBlock(block, onIncorrect)}</div>)}</article>;
}
