import { useState } from "react";
import { vocabularyFixtures } from "../../content/vocabulary-fixtures.ts";
import { phraseFixtures } from "../../content/phrase-fixtures.ts";
import { generateVocabularyReviewCards } from "../../lib/content/vocabulary.ts";
import { generatePhraseReviewCards } from "../../lib/content/phrases.ts";
import { grammarFixtures } from "../../content/grammar-fixtures.ts";
import { generateGrammarRecognitionReviewCards } from "../../lib/content/grammar.ts";
import { openLocalRepositories } from "../../lib/storage/repositories.ts";
import type { LearnerProfileId } from "../../lib/storage/types.ts";
import type { SessionItem } from "../../lib/session/session.ts";
import type { ReviewRating } from "./srs.ts";

const ratings = ["Again", "Hard", "Good", "Easy"] as const;
const cards = [...generateVocabularyReviewCards(vocabularyFixtures), ...generatePhraseReviewCards(phraseFixtures), ...generateGrammarRecognitionReviewCards(grammarFixtures)];

export function ConceptReviewSession({ item, nextLabel, onRated, profileId }: { item: Extract<SessionItem, { kind: "review" }>; nextLabel?: string; onRated: () => void; profileId: LearnerProfileId }) {
  const card = cards.find((candidate) => candidate.id === item.cardId);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  if (!card) return <p role="status">Review card unavailable.</p>;
  async function rate(label: typeof ratings[number]) {
    setSaving(true); setError(false);
    const repos = await openLocalRepositories(undefined, profileId).catch(() => undefined);
    if (!repos) { setSaving(false); setError(true); return; }
    try {
      const rating: ReviewRating = ({ Again: "Forgot", Hard: "Hard", Good: "Got It", Easy: "Easy" } as const)[label];
      await repos.reviews.record({ id: `review-${crypto.randomUUID()}`, conceptId: item.conceptId, cardId: item.cardId, rating, reviewedAt: new Date().toISOString() });
      onRated();
    } catch { setError(true); } finally { repos.close(); setSaving(false); }
  }
  return <section className="kana-review" aria-label="Daily study card" data-card-id={item.cardId}>
    {nextLabel && <p>{nextLabel}</p>}
    <h2 lang="ja">{card.prompt}</h2>
    {!revealed && <button className="primary-action" type="button" onClick={() => setRevealed(true)}>Show answer</button>}
    {revealed && <><p role="status">{card.answers.join(" / ")}</p>{"reading" in card && <p lang="ja">{card.reading}</p>}
      <div className="review-ratings" role="group" aria-label="Review rating">{ratings.map((rating) => <button key={rating} type="button" disabled={saving} onClick={() => void rate(rating)}>{rating}</button>)}</div></>}
    {error && <p role="alert">Review could not be saved.</p>}
  </section>;
}
