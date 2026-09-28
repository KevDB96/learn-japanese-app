import { useEffect, useState } from "react";
import type { Lesson } from "../../lib/content/types.ts";
import { contentCatalog } from "../../lib/content/catalog.ts";
import { openLocalRepositories } from "../../lib/storage/repositories.ts";
import type { ProgressRepositories } from "./progress.ts";
import { completeLesson, resolveLessonResume, saveLessonPosition } from "./progress.ts";
import { LessonRenderer } from "./LessonRenderer.tsx";

type SessionState = { readonly repos: ProgressRepositories; readonly index: number; readonly mismatch: boolean; readonly completed: boolean };

export function LessonSession({ lesson }: { lesson: Lesson }) {
  const [session, setSession] = useState<SessionState>();
  const [storageError, setStorageError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let close: (() => void) | undefined;
    void openLocalRepositories().then(async (opened) => {
      close = opened.close;
      const progress = await opened.lessonProgress.get(lesson.id);
      const resume = resolveLessonResume(progress, contentCatalog, lesson);
      if (progress?.status !== "completed") await saveLessonPosition(opened, contentCatalog, lesson, resume.blockIndex);
      if (!cancelled) setSession({ repos: opened, index: resume.blockIndex, mismatch: resume.kind === "content-changed", completed: progress?.status === "completed" });
      else opened.close();
    }).catch(() => { if (!cancelled) setStorageError(true); });
    return () => { cancelled = true; close?.(); };
  }, [lesson]);

  if (storageError) return <p role="status">Lesson progress is unavailable.</p>;
  if (!session) return <p role="status">Loading lesson…</p>;
  const progress = session.repos;
  const finishOrContinue = async () => {
    setBusy(true);
    try {
      if (session.index >= lesson.blocks.length - 1) {
        await completeLesson(progress, contentCatalog, lesson);
        setSession({ ...session, completed: true });
      } else {
        const index = session.index + 1;
        await saveLessonPosition(progress, contentCatalog, lesson, index);
        setSession({ ...session, index });
      }
    } finally { setBusy(false); }
  };

  return <section className="lesson-session" aria-label={lesson.display}>
    {session.mismatch && <p role="status">This lesson changed. Resume from the beginning.</p>}
    {session.completed ? <p role="status">Lesson complete</p> : <>
      <LessonRenderer lesson={{ ...lesson, blocks: [lesson.blocks[session.index]!] }} />
      <button type="button" disabled={busy} onClick={() => void finishOrContinue()}>{busy ? "Saving…" : session.index >= lesson.blocks.length - 1 ? "Complete lesson" : "Continue"}</button>
    </>}
  </section>;
}
