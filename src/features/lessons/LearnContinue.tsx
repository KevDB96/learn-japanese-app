import { useEffect, useState } from "react";
import { contentCatalog } from "../../lib/content/catalog.ts";
import { kanaFixtures, katakanaFixtures, katakanaAdvancedFixtures } from "../../content/kana-fixtures.ts";
import { vocabularyFixtures } from "../../content/vocabulary-fixtures.ts";
import { phraseFixtures } from "../../content/phrase-fixtures.ts";
import { grammarFixtures } from "../../content/grammar-fixtures.ts";
import { generateKanaReviewCards } from "../../lib/content/kana.ts";
import { generateVocabularyReviewCards } from "../../lib/content/vocabulary.ts";
import { generatePhraseReviewCards } from "../../lib/content/phrases.ts";
import { generateGrammarRecognitionReviewCards } from "../../lib/content/grammar.ts";
import { buildDailyQueue, filterEligibleDueCards, type DailyMaterial } from "../../lib/session/daily-queue.ts";
import { openLocalRepositories } from "../../lib/storage/repositories.ts";
import type { LearnerProfileId } from "../../lib/storage/types.ts";
import type { ContentId } from "../../lib/content/types.ts";
import type { ReviewRating } from "../review/srs.ts";
const kana = [...kanaFixtures, ...katakanaFixtures, ...katakanaAdvancedFixtures];
export const ELIGIBLE_REVIEW_FORMS = ["kana-glyph-to-sound", "vocabulary-meaning", "vocabulary-reading", "phrase-meaning", "grammar-recognition"] as const;
const eligibleReviewFormIds: ReadonlySet<string> = new Set(ELIGIBLE_REVIEW_FORMS);
const cards = [  ...generateKanaReviewCards(kana),  ...generateVocabularyReviewCards(vocabularyFixtures),  ...generatePhraseReviewCards(phraseFixtures),  ...generateGrammarRecognitionReviewCards(grammarFixtures),].filter((card) => eligibleReviewFormIds.has(card.formId)).map((card) => {  if ("prompt" in card) return card;
  const concept = kana.find((item) => item.id === card.conceptId)!;
  return { ...card, prompt: concept.glyph, answers: [concept.romanization], reading: concept.romanization };
});
type Card = { id: string; conceptId: string; formId: string; prompt: string; answers: readonly string[]; reading: string; kind?: string; exercise?: { prompt: string; before: string; after: string; answer: string; explanation?: string } };

const cardsById = new Map(cards.map((card) => [card.id, card as Card]));
function resolveCard(cardId: string): Card | undefined {
  const current = cardsById.get(cardId);
  if (current) return current;
  const legacyKana = kana.find((item) => item.id === cardId);
  return legacyKana ? { id: cardId, conceptId: cardId, formId: "kana-glyph-to-sound", prompt: legacyKana.glyph, answers: [legacyKana.romanization], reading: legacyKana.romanization } : undefined;
}
type QueueState = { cardIds: string[]; newCardIds: Set<string>; error?: boolean };

function materialFor(lessonConceptIds: readonly string[]): DailyMaterial[] {  return lessonConceptIds.map((conceptId, order) => ({ conceptId, order, cardIds: cards.filter((card) => card.conceptId === conceptId).map((card) => card.id) })).filter((item) => item.cardIds.length > 0);}function generatedLesson(id: string, at: string, complete: boolean) {  return { id, lessonId: id, status: complete ? "completed" as const : "in-progress" as const, recordVersion: 1, updatedAt: at, ...(complete ? { completedAt: at } : {}) };
}export function LearnContinue({ profileId }: { profileId: LearnerProfileId }) {  const [queue, setQueue] = useState<QueueState>();
  const [explanation, setExplanation] = useState<string>();
  useEffect(() => {    let cancelled = false;
    void openLocalRepositories(undefined, profileId).then(async (repos) => {      try {        const now = Date.now();
        const [progress, concepts, due, reviewStates] = await Promise.all([repos.lessonProgress.list(), repos.conceptStates.list(), repos.reviews.due(now), repos.reviews.getStates()]);
        const introduced = new Set(concepts.filter((item) => item.lifecycle && item.lifecycle !== "UNSEEN").map((item) => item.conceptId));
        reviewStates.forEach((item) => introduced.add(item.conceptId));
        const completed = new Set(progress.filter((item) => item.status === "completed").map((item) => item.lessonId));
        const stamp = new Date(now).toISOString();
        for (const lesson of contentCatalog.lessons) {          if (lesson.introduces.length || !lesson.requires.every((required) => completed.has(required) || introduced.has(required))) continue;
          if (!completed.has(lesson.id)) { await repos.lessonProgress.put(generatedLesson(lesson.id, stamp, true)); completed.add(lesson.id); }        }        const lessonMaterials: DailyMaterial[] = [];
        let order = 0;
        for (const lesson of contentCatalog.lessons) {          if (!lesson.requires.every((required) => completed.has(required) || introduced.has(required))) continue;
          const eligible = materialFor(lesson.introduces.filter((id) => !introduced.has(id)));
          if (eligible.length) { lessonMaterials.push(...eligible.map((item) => ({ ...item, order: order++ }))); }        }        const dueWithForms = due.flatMap((candidate) => {          const card = cardsById.get(candidate.cardId);
          if (card) return [{ conceptId: candidate.conceptId, cardId: candidate.cardId, formId: card.formId, overdueMs: candidate.overdueMs }];
          // Retired production IDs remain in history/state, but never re-enter the active queue.
          return [];
        });
        const selected = buildDailyQueue({ profileId, due: filterEligibleDueCards(dueWithForms, new Set(cardsById.keys())), materials: lessonMaterials, introducedConceptIds: [...introduced], cap: 5 });
        const newConceptIds = selected.newConceptIds;
        const materialByConcept = new Map(lessonMaterials.map((item) => [item.conceptId, item]));
        for (const conceptId of newConceptIds) {          for (const cardId of materialByConcept.get(conceptId)?.cardIds ?? []) await repos.reviews.introduce(conceptId, now, cardId);
          const previous = await repos.conceptStates.get(conceptId);
          if (!previous || previous.lifecycle === "UNSEEN") await repos.conceptStates.put({ id: conceptId, recordVersion: 1, updatedAt: stamp, conceptId, lifecycle: "INTRODUCED", familiarity: previous?.familiarity ?? 0 });
        }
        // Auto-record curriculum progression from introduction state; a lesson never gates card review.
        for (const lesson of contentCatalog.lessons) {          if (!lesson.introduces.length || !lesson.introduces.every((id) => introduced.has(id) || newConceptIds.includes(id))) continue;
          const existing = progress.find((item) => item.lessonId === lesson.id);
          if (existing?.status === "completed") continue;
          await repos.lessonProgress.put(generatedLesson(lesson.id, stamp, true));
        }
        // Existing supported cards stay first; new cards retain curriculum/form order.
        const cardIds = [...new Set(selected.orderedCardIds)];
        if (!cancelled) setQueue({ cardIds, newCardIds: new Set(selected.newCardIds) });
      } catch { if (!cancelled) setQueue({ cardIds: [], newCardIds: new Set(), error: true }); }
      finally { repos.close(); }    }).catch(() => { if (!cancelled) setQueue({ cardIds: [], newCardIds: new Set(), error: true }); });
    return () => { cancelled = true; };

  }, [profileId]);
  if (!queue) return <p role="status">Loading…</p>;
  if (queue.error) return <p role="alert">Learning progress is unavailable.</p>;
  const cardId = queue.cardIds[0];
  if (!cardId) return <section className="learning-empty" aria-label="Study queue"><p>All caught up</p></section>;
  if (explanation) return <section className="learn-continue" aria-label="Card explanation"><h2>{explanation}</h2><p>{contentCatalog.lessons.find((lesson) => lesson.id === explanation)?.blocks.find((block) => block.kind === "paragraph" || block.kind === "callout")?.kind === "paragraph" ? (contentCatalog.lessons.find((lesson) => lesson.id === explanation)?.blocks.find((block) => block.kind === "paragraph") as { text: string } | undefined)?.text : ""}</p><button type="button" onClick={() => setExplanation(undefined)}>Back to card</button></section>;
  const card = resolveCard(cardId);
  if (!card) return <p role="status">Review card unavailable.</p>;
  const remain = queue.cardIds.length;
  const lesson = contentCatalog.lessons.find((item) => item.introduces.includes(card.conceptId as ContentId));
  return <Flashcard key={`${profileId}:${cardId}`} card={card} profileId={profileId} remaining={remain} isNew={queue.newCardIds.has(cardId)} lessonId={lesson?.id} onExplain={setExplanation} onRated={() => setQueue((current) => current ? { ...current, cardIds: current.cardIds.filter((id) => id !== cardId) } : current)} />;
}
function Flashcard({ card, profileId, remaining, isNew, lessonId, onExplain, onRated }: { card: Card; profileId: LearnerProfileId; remaining: number; isNew: boolean; lessonId?: string; onExplain: (id: string) => void; onRated: () => void }) {  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  async function rate(label: "Again" | "Hard" | "Good" | "Easy") {    setSaving(true); setError(false);
    const repos = await openLocalRepositories(undefined, profileId).catch(() => undefined);
    if (!repos) { setSaving(false); setError(true); return; }
    const rating: ReviewRating = ({ Again: "Forgot", Hard: "Hard", Good: "Got It", Easy: "Easy" } as const)[label];
    try {      await repos.reviews.record({ id: `review-${crypto.randomUUID()}`, conceptId: card.conceptId, cardId: card.id, rating, reviewedAt: new Date().toISOString() });
      onRated();
    } catch { setError(true); } finally { repos.close(); setSaving(false); }
  }
  return <section className="kana-review" aria-label="Daily study card" data-card-id={card.id}>    <p>{remaining} {remaining === 1 ? "card" : "cards"} remaining</p>    {isNew && <p>New</p>}    <h2 lang="ja">{card.prompt}</h2>    {!revealed && <button className="primary-action" type="button" onClick={() => setRevealed(true)}>Show answer</button>}    {revealed && <><p role="status" lang="ja">{card.answers.join(" / ")}{card.reading && card.reading !== card.answers[0] ? ` · ${card.reading}` : ""}</p>      {isNew && lessonId && <button type="button" onClick={() => onExplain(lessonId)}>Learn more</button>}      <div className="review-ratings" role="group" aria-label="Review rating">{(["Again", "Hard", "Good", "Easy"] as const).map((label) => <button key={label} type="button" disabled={saving} onClick={() => void rate(label)}>{label}</button>)}</div></>}    {error && <p role="alert">Review could not be saved.</p>}  </section>;}
