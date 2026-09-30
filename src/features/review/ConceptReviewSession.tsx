import { useMemo, useState } from "react";
import { vocabularyFixtures } from "../../content/vocabulary-fixtures.ts";
import { phraseFixtures } from "../../content/phrase-fixtures.ts";
import { generateVocabularyReviewCards } from "../../lib/content/vocabulary.ts";
import { generatePhraseReviewCards } from "../../lib/content/phrases.ts";
import { openLocalRepositories } from "../../lib/storage/repositories.ts";
import type { LearnerProfileId } from "../../lib/storage/types.ts";
import type { SessionItem } from "../../lib/session/session.ts";
import type { ReviewRating } from "./srs.ts";
import { matchesRecallAnswer } from "./answers.ts";

const ratings: readonly ReviewRating[] = ["Forgot", "Hard", "Got It", "Easy"];
const cards = [...generateVocabularyReviewCards(vocabularyFixtures), ...generatePhraseReviewCards(phraseFixtures)];
type Card = { id: string; conceptId: string; formId: string; kind: string; prompt: string; answers: readonly string[]; reading: string };

export function ConceptReviewSession({ item, nextLabel, onRated, profileId }: { item: Extract<SessionItem, { kind: "review" }>; nextLabel?: string; onRated: () => void; profileId: LearnerProfileId }) {
  const card = cards.find((candidate) => candidate.id === item.cardId) as Card | undefined;
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [guided, setGuided] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const options = useMemo(() => {
    if (!card) return [];
    const pool = cards.filter((candidate) => candidate.id !== card.id && candidate.kind === card.kind).flatMap((candidate) => candidate.answers);
    return [...new Set([...card.answers, ...pool])].slice(0, 4);
  }, [card]);
  if (!card) return <p role="status">Review card unavailable.</p>;
  const language = card.kind === "meaning" ? "meaning" : "japanese";
  const correct = matchesRecallAnswer(answer, card.answers, language);
  const check = () => setChecked(true);
  const rate = async (rating: ReviewRating) => {
    setSaving(true); setError(false);
    const repos = await openLocalRepositories(undefined, profileId).catch(() => undefined);
    if (!repos) { setSaving(false); setError(true); return; }
    try {
      await repos.reviews.record({ id: `review-${crypto.randomUUID()}`, conceptId: item.conceptId, cardId: item.cardId, rating, reviewedAt: new Date().toISOString() });
      onRated();
    } catch { setError(true); }
    finally { repos.close(); setSaving(false); }
  };
  return <section className="kana-review" aria-label="Vocabulary review" data-card-id={item.cardId}>
    {nextLabel && <p>{nextLabel}</p>}
    <p>Review · {card.kind === "meaning" ? "Meaning" : card.kind === "reading" ? "Reading" : "Production"}</p>
    <h2 lang={card.kind === "production" ? "en" : "ja"}>{card.prompt}</h2>
    {!checked && !guided && <form onSubmit={(event) => { event.preventDefault(); check(); }}>
      <label>Answer <input autoComplete="off" value={answer} onChange={(event) => setAnswer(event.target.value)} /></label>
      <button type="submit" disabled={!answer.trim()}>Check</button>
      <button type="button" onClick={() => setGuided(true)}>Show choices</button>
    </form>}
    {!checked && guided && <div role="group" aria-label="Guided choices">{options.map((option) => <button type="button" key={option} onClick={() => { setAnswer(option); setChecked(true); }}>{option}</button>)}<button type="button" onClick={() => setGuided(false)}>Recall without choices</button></div>}
    {checked && <>
      <p role="status">{correct ? "Correct." : `Answer: ${card.answers.join(" / ")}`}</p>
      {card.kind !== "meaning" && <p lang="ja">{card.reading}</p>}
      <div className="review-ratings" aria-label="Review rating">{ratings.map((rating) => <button key={rating} type="button" disabled={saving} onClick={() => void rate(rating)}>{rating}</button>)}</div>
    </>}
    {error && <p role="alert">Review could not be saved.</p>}
  </section>;
}
