import { useMemo, useState } from "react";
import { kanaFixtures } from "../../content/kana-fixtures.ts";
import { openLocalRepositories } from "../../lib/storage/repositories.ts";
import type { ReviewRating } from "./srs.ts";
import type { SessionItem } from "../../lib/session/session.ts";

const ratings: readonly ReviewRating[] = ["Forgot", "Hard", "Got It", "Easy"];

export function KanaReviewSession({ item, nextLabel, onRated }: { item: Extract<SessionItem, { kind: "review" }>; nextLabel?: string; onRated: () => void }) {
  const concept = kanaFixtures.find((kana) => kana.id === item.conceptId);
  const form = item.formId;
  const choices = useMemo(() => {
    if (!concept) return [];
    const candidates = kanaFixtures.filter((kana) => kana.reviewEligible !== false && kana.form === concept.form);
    const fallback = kanaFixtures.filter((kana) => kana.reviewEligible !== false);
    const source = candidates.length >= 4 ? candidates : fallback;
    const start = Math.max(0, source.findIndex((kana) => kana.id === concept.id));
    return Array.from({ length: Math.min(4, source.length) }, (_, offset) => source[(start + offset) % source.length]!);
  }, [concept]);
  const [answer, setAnswer] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  if (!concept) return <p role="status">Review card unavailable.</p>;
  const prompt = form === "kana-sound-to-glyph" ? concept.romanization : concept.glyph;
  const correctAnswer = form === "kana-sound-to-glyph" ? concept.glyph : concept.romanization;
  const options = choices.map((choice) => form === "kana-sound-to-glyph" ? choice.glyph : choice.romanization);
  const correct = answer === correctAnswer;
  const rate = async (rating: ReviewRating) => {
    setSaving(true); setError(false);
    const repos = await openLocalRepositories().catch(() => undefined);
    if (!repos) { setSaving(false); setError(true); return; }
    try {
      await repos.reviews.record({ id: `review-${crypto.randomUUID()}`, conceptId: item.conceptId, cardId: item.cardId, rating, reviewedAt: new Date().toISOString() });
      onRated();
    } catch { setError(true); }
    finally { repos.close(); setSaving(false); }
  };
  return <section className="kana-review" aria-label="Hiragana review" data-card-id={item.cardId}>
    {nextLabel && <p>{nextLabel}</p>}
    <p>Review · {form === "kana-sound-to-glyph" ? "Sound to kana" : "Kana to sound"}</p>
    <h2 lang={form === "kana-sound-to-glyph" ? "ja-Latn" : "ja"}>{prompt}</h2>
    {!answer && <div role="group" aria-label="Review answers">{options.map((option, index) => <button type="button" key={`${option}-${index}`} onClick={() => setAnswer(option)} lang={form === "kana-sound-to-glyph" ? "ja" : "ja-Latn"}>{option}</button>)}</div>}
    {answer && <>
      <p role="status">{correct ? "Correct." : `Answer: ${correctAnswer}`}</p>
      <div className="review-ratings" aria-label="Review rating">{ratings.map((rating) => <button key={rating} type="button" disabled={saving} onClick={() => void rate(rating)}>{rating}</button>)}</div>
    </>}
    {error && <p role="alert">Review could not be saved.</p>}
  </section>;
}
