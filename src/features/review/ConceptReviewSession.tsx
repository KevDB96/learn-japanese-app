import { useMemo, useRef, useState } from "react";
import { vocabularyFixtures } from "../../content/vocabulary-fixtures.ts";
import { phraseFixtures } from "../../content/phrase-fixtures.ts";
import { generateVocabularyReviewCards } from "../../lib/content/vocabulary.ts";
import { generatePhraseReviewCards } from "../../lib/content/phrases.ts";
import { openLocalRepositories } from "../../lib/storage/repositories.ts";
import type { LearnerProfileId } from "../../lib/storage/types.ts";
import type { SessionItem } from "../../lib/session/session.ts";
import type { ReviewRating } from "./srs.ts";
import { matchesRecallAnswer } from "./answers.ts";
import { grammarFixtures } from "../../content/grammar-fixtures.ts";
import { generateGrammarClozeReviewCards } from "../../lib/content/grammar.ts";
import type { ExerciseDefinition } from "../../lib/content/types.ts";
import { ExerciseRendererView } from "../lessons/ExerciseEngine.tsx";

const ratings: readonly ReviewRating[] = ["Forgot", "Hard", "Got It", "Easy"];
const cards = [...generateVocabularyReviewCards(vocabularyFixtures), ...generatePhraseReviewCards(phraseFixtures), ...generateGrammarClozeReviewCards(grammarFixtures)];
type Card = { id: string; conceptId: string; formId: string; kind: string; prompt: string; answers: readonly string[]; reading: string; exercise?: Extract<ExerciseDefinition, { type: "cloze" }> };

export function ConceptReviewSession({ item, nextLabel, onRated, profileId }: { item: Extract<SessionItem, { kind: "review" }>; nextLabel?: string; onRated: () => void; profileId: LearnerProfileId }) {
  const card = cards.find((candidate) => candidate.id === item.cardId) as Card | undefined;
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [guided, setGuided] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [clozeCorrect, setClozeCorrect] = useState(false);
  const shownAt = useRef(performance.now());
  const [responseTimeMs, setResponseTimeMs] = useState<number>();
  const markAnswered = () => setResponseTimeMs((current) => current ?? performance.now() - shownAt.current);
  const options = useMemo(() => {
    if (!card) return [];
    const pool = cards.filter((candidate) => candidate.id !== card.id && candidate.kind === card.kind).flatMap((candidate) => candidate.answers);
    return [...new Set([...card.answers, ...pool])].slice(0, 4);
  }, [card]);
  if (!card) return <p role="status">Review card unavailable.</p>;
  const language = card.kind === "meaning" ? "meaning" : "japanese";
  const correct = card.kind === "cloze" ? clozeCorrect : matchesRecallAnswer(answer, card.answers, language);
  const check = () => { markAnswered(); setChecked(true); };
  const rate = async (rating: ReviewRating) => {
    setSaving(true); setError(false);
    const repos = await openLocalRepositories(undefined, profileId).catch(() => undefined);
    if (!repos) { setSaving(false); setError(true); return; }
    try {
      await repos.reviews.record({ id: `review-${crypto.randomUUID()}`, conceptId: item.conceptId, cardId: item.cardId, rating, reviewedAt: new Date().toISOString(), ...(responseTimeMs ? { responseTimeMs } : {}) });
      onRated();
    } catch { setError(true); }
    finally { repos.close(); setSaving(false); }
  };
  return <section className="kana-review" aria-label="Vocabulary review" data-card-id={item.cardId}>
    {nextLabel && <p>{nextLabel}</p>}
    <p>Review · {card.kind === "meaning" ? "Meaning" : card.kind === "reading" ? "Reading" : card.kind === "cloze" ? "Cloze" : "Production"}</p>
    <h2 lang={card.kind === "production" ? "en" : "ja"}>{card.prompt}</h2>
    {card.kind === "cloze" && card.exercise && <ExerciseRendererView exercise={card.exercise} onComplete={() => { markAnswered(); setClozeCorrect(true); setChecked(true); }} onIncorrect={(exercise) => { markAnswered(); setClozeCorrect(false); setChecked(true); setAnswer((exercise as Extract<ExerciseDefinition, { type: "cloze" }>).answer); }} />}
    {card.kind !== "cloze" && !checked && !guided && <form onSubmit={(event) => { event.preventDefault(); check(); }}>
      <label>Answer <input autoComplete="off" value={answer} onChange={(event) => setAnswer(event.target.value)} /></label>
      <button type="submit" disabled={!answer.trim()}>Check</button>
      <button type="button" onClick={() => setGuided(true)}>Show choices</button>
    </form>}
    {card.kind !== "cloze" && !checked && guided && <div role="group" aria-label="Guided choices">{options.map((option) => <button type="button" key={option} onClick={() => { markAnswered(); setAnswer(option); setChecked(true); }}>{option}</button>)}<button type="button" onClick={() => setGuided(false)}>Recall without choices</button></div>}
    {checked && card.kind !== "cloze" && <>
      <p role="status">{correct ? "Correct." : `Answer: ${card.answers.join(" / ")}`}</p>
      {card.kind !== "meaning" && <p lang="ja">{card.reading}</p>}
      <div className="review-ratings" aria-label="Review rating">{ratings.map((rating) => <button key={rating} type="button" disabled={saving} onClick={() => void rate(rating)}>{rating}</button>)}</div>
    </>}
    {checked && card.kind === "cloze" && <div role="group" className="review-ratings" aria-label="Review rating">{ratings.map((rating) => <button key={rating} type="button" disabled={saving} onClick={() => void rate(rating)}>{rating}</button>)}</div>}
    {error && <p role="alert">Review could not be saved.</p>}
  </section>;
}
