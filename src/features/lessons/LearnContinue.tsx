import { useEffect, useState } from "react";
import { contentCatalog } from "../../lib/content/catalog.ts";
import type { ContentId } from "../../lib/content/types.ts";
import { composeSession, type SessionPlan } from "../../lib/session/session.ts";
import { openLocalRepositories } from "../../lib/storage/repositories.ts";
import { getContinueLesson } from "./progress.ts";
import { LessonSession } from "./LessonSession.tsx";

type LearnState = { readonly plan: SessionPlan; readonly lessonId?: string };
const NEW_MATERIAL_CAP = 5;

export function LearnContinue() {
  const [state, setState] = useState<LearnState>();
  const [started, setStarted] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void openLocalRepositories().then(async (repos) => {
      try {
        const [progress, concepts, due] = await Promise.all([repos.lessonProgress.list(), repos.conceptStates.list(), repos.reviews.due(Date.now())]);
        const lesson = getContinueLesson(contentCatalog, progress, concepts);
        const lessonMode = progress.some((item) => item.lessonId === lesson?.id && item.status === "in-progress") ? "resume" : "new";
        const plan = composeSession({ dueReviewIds: due.map((candidate) => candidate.conceptId as ContentId), weakConceptIds: [], currentLesson: lesson, lessonMode, newMaterialCap: NEW_MATERIAL_CAP });
        if (!cancelled) setState({ plan, lessonId: lesson?.id });
      } catch {
        if (!cancelled) setError(true);
      } finally {
        repos.close();
      }
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <p role="status">Learning progress is unavailable.</p>;
  if (!state) return <p role="status">Loading…</p>;
  if (started && state.lessonId) {
    const lesson = contentCatalog.lessons.find((item) => item.id === state.lessonId)!;
    return <LessonSession lesson={lesson} />;
  }
  const nextItem = state.plan.items.find((item) => item.kind === "lesson");
  if (!nextItem) return state.plan.summary.reviewCount > 0
    ? <p className="empty-state">{state.plan.summary.reviewCount} reviews due</p>
    : <p className="empty-state">No lesson is ready yet.</p>;
  const lesson = contentCatalog.lessons.find((item) => item.id === nextItem.lessonId)!;
  return <div className="learn-continue">
    {state.plan.summary.reviewCount > 0 && <p>{state.plan.summary.reviewCount} reviews due</p>}
    <p>{lesson.display}</p>
    <button className="primary-action" type="button" onClick={() => setStarted(true)}>Continue</button>
  </div>;
}
