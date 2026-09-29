import { useEffect, useState } from "react";
import { contentCatalog } from "../../lib/content/catalog.ts";
import type { ContentId } from "../../lib/content/types.ts";
import { composeSession, type SessionPlan } from "../../lib/session/session.ts";
import { openLocalRepositories } from "../../lib/storage/repositories.ts";
import { getContinueLesson } from "./progress.ts";
import { LessonSession } from "./LessonSession.tsx";
import { targetedContrastGroups } from "../progress/hiragana.ts";
import { kanaFixtures } from "../../content/kana-fixtures.ts";
import { generateKanaReviewCards, KANA_REVIEW_FORMS } from "../../lib/content/kana.ts";
import { KanaReviewSession } from "../review/KanaReviewSession.tsx";
import type { LearnerProfileId } from "../../lib/storage/types.ts";

type LearnState = { readonly plan: SessionPlan; readonly lessonId?: string; readonly contrast?: Extract<SessionPlan["items"][number], { kind: "contrast" }> };
const NEW_MATERIAL_CAP = 5;

export function LearnContinue({ profileId }: { profileId: LearnerProfileId }) {
  const [state, setState] = useState<LearnState>();
  const [started, setStarted] = useState(false);
  const [contrastStarted, setContrastStarted] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void openLocalRepositories(undefined, profileId).then(async (repos) => {
      try {
        const [progress, concepts, due, events] = await Promise.all([repos.lessonProgress.list(), repos.conceptStates.list(), repos.reviews.due(Date.now()), repos.reviews.list()]);
        const lesson = getContinueLesson(contentCatalog, progress, concepts);
        const lessonMode = progress.some((item) => item.lessonId === lesson?.id && item.status === "in-progress") ? "resume" : "new";
        const cards = generateKanaReviewCards(kanaFixtures, KANA_REVIEW_FORMS);
        const cardForms = new Map(cards.map((card) => [card.id, card.formId]));
        const dueReviews = due.flatMap((candidate) => {
          const exactFormId = cardForms.get(candidate.cardId);
          if (exactFormId) return [{ conceptId: candidate.conceptId as ContentId, cardId: candidate.cardId, formId: exactFormId }];
          // Preserve cards created by earlier concept-level releases as glyph-to-sound reviews.
          if (kanaFixtures.some((item) => item.id === candidate.conceptId)) return [{ conceptId: candidate.conceptId as ContentId, cardId: candidate.cardId, formId: "kana-glyph-to-sound" }];
          return [];
        });
        const plan = composeSession({ dueReviews, reviewLimit: 10, weakConceptIds: [], contrastGroups: targetedContrastGroups(events, kanaFixtures).map((group) => ({ ...group, conceptIds: group.conceptIds as ContentId[] })), currentLesson: lesson, lessonMode, newMaterialCap: NEW_MATERIAL_CAP, allowOversizedLesson: true });
        if (!cancelled) setState({ plan, lessonId: lesson?.id, contrast: plan.items.find((item): item is Extract<typeof item, { kind: "contrast" }> => item.kind === "contrast") });
      } catch {
        if (!cancelled) setError(true);
      } finally {
        repos.close();
      }
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [profileId]);

  if (error) return <p role="status">Learning progress is unavailable.</p>;
  if (!state) return <p role="status">Loading…</p>;
  const reviews = state.plan.items.filter((item): item is Extract<typeof item, { kind: "review" }> => item.kind === "review");
  const firstReview = reviews[0];
  const nextLessonItem = state.plan.items.find((item): item is Extract<typeof item, { kind: "lesson" }> => item.kind === "lesson");
  const nextLessonLabel = nextLessonItem ? contentCatalog.lessons.find((item) => item.id === nextLessonItem.lessonId)?.display : undefined;
  if (firstReview) return <KanaReviewSession key={`${profileId}:${firstReview.cardId}`} profileId={profileId} item={firstReview} nextLabel={nextLessonLabel ? `${reviews.length} reviews due · Next: ${nextLessonLabel}` : reviews.length > 1 ? `${reviews.length - 1} more reviews` : undefined} onRated={() => setState((current) => current ? ({ ...current, plan: { ...current.plan, items: current.plan.items.filter((item) => item.kind !== "review" || item.cardId !== firstReview.cardId), summary: { ...current.plan.summary, reviewCount: Math.max(0, current.plan.summary.reviewCount - 1) } } }) : current)} />;
  if (contrastStarted && state.contrast) return <KanaContrastPractice glyphs={state.contrast.glyphs} onDone={() => setContrastStarted(false)} />;
  if (started && state.lessonId) {
    const lesson = contentCatalog.lessons.find((item) => item.id === state.lessonId)!;
    return <LessonSession lesson={lesson} profileId={profileId} />;
  }
  const nextItem = state.plan.items.find((item) => item.kind === "lesson");
  if (!nextItem) return <div className="learn-continue">
    {state.contrast && <section aria-label="Hiragana contrast practice"><p>Contrast practice: <span lang="ja">{state.contrast.glyphs.join(" / ")}</span></p><button type="button" onClick={() => setContrastStarted(true)}>Practice contrast</button></section>}
    {state.plan.summary.reviewCount > 0 && <p>{state.plan.summary.reviewCount} reviews due</p>}
    {!state.contrast && state.plan.summary.reviewCount === 0 && <section className="learning-empty"><img src={`/assets/states/all-caught-up-${profileId}.webp`} alt="" /><p>All caught up</p></section>}
  </div>;
  const lesson = contentCatalog.lessons.find((item) => item.id === nextItem.lessonId)!;
  return <div className="learn-continue">
    {state.contrast && <section aria-label="Hiragana contrast practice"><p>Contrast practice: <span lang="ja">{state.contrast.glyphs.join(" / ")}</span></p><button type="button" onClick={() => setContrastStarted(true)}>Practice contrast</button></section>}
    {state.plan.summary.reviewCount > 0 && <p>{state.plan.summary.reviewCount} reviews due</p>}
    <p>{lesson.display}</p>
    <button className="primary-action" type="button" onClick={() => setStarted(true)}>Continue</button>
  </div>;
}

function KanaContrastPractice({ glyphs, onDone }: { glyphs: readonly string[]; onDone: () => void }) {
  const [targetIndex, setTargetIndex] = useState(0);
  const [message, setMessage] = useState("");
  const target = glyphs[targetIndex]!;
  const choose = (glyph: string) => {
    if (glyph !== target) { setMessage("Try again"); return; }
    if (targetIndex + 1 >= glyphs.length) { setMessage("Contrast complete"); return; }
    setTargetIndex((index) => index + 1);
    setMessage("Correct");
  };
  if (message === "Contrast complete") return <section aria-label="Hiragana contrast practice"><p role="status">{message}</p><button type="button" onClick={onDone}>Done</button></section>;
  return <section aria-label="Hiragana contrast practice"><h2>Choose <span lang="ja">{target}</span></h2><div role="group" aria-label="Kana choices">{glyphs.map((glyph) => <button key={glyph} type="button" onClick={() => choose(glyph)}><span lang="ja">{glyph}</span></button>)}</div>{message && <p role="status">{message}</p>}</section>;
}
