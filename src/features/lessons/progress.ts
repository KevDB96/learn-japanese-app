import type { ContentCatalog, ContentId, Lesson } from "../../lib/content/types.ts";
import type { ConceptLifecycle, ConceptState, LessonProgress, StoredRecord } from "../../lib/storage/types.ts";

export type ProgressRepositories = {
  lessonProgress: { get(id: string): Promise<LessonProgress | undefined>; put(value: LessonProgress): Promise<void>; list(): Promise<LessonProgress[]> };
  conceptStates: { get(id: string): Promise<ConceptState | undefined>; put(value: ConceptState): Promise<void>; list(): Promise<ConceptState[]> };
  reviews?: { introduce(conceptId: string, at: number): Promise<void>; record?(input: { id: string; conceptId: string; cardId: string; rating: import("../review/srs.ts").ReviewRating; reviewedAt: string; kind: "practice"; confusedConceptId?: string }): Promise<void> };
};

export type ResumeResult = { readonly kind: "resume"; readonly blockIndex: number } | { readonly kind: "content-changed"; readonly blockIndex: 0 };

export function getConceptLifecycle(state: ConceptState | undefined): ConceptLifecycle {
  return state?.lifecycle ?? "UNSEEN";
}

const stamp = (now: () => Date = () => new Date()): string => now().toISOString();
const record = (id: string, updatedAt: string): Pick<StoredRecord, "id" | "recordVersion" | "updatedAt"> => ({ id, recordVersion: 1, updatedAt });

export async function saveLessonPosition(
  repos: ProgressRepositories,
  catalog: ContentCatalog,
  lesson: Lesson,
  blockIndex: number,
  now?: () => Date,
): Promise<void> {
  const current = await repos.lessonProgress.get(lesson.id);
  if (current?.status === "completed") return;
  const updatedAt = stamp(now);
  const safeIndex = Math.max(0, Math.min(blockIndex, lesson.blocks.length - 1));
  await repos.lessonProgress.put({
    ...record(lesson.id, updatedAt), lessonId: lesson.id, status: "in-progress",
    currentBlockId: lesson.blocks[safeIndex]?.id, currentStep: safeIndex,
    contentVersion: catalog.metadata.contentVersion, contentSchemaVersion: catalog.metadata.schemaVersion,
  });
}

export function resolveLessonResume(progress: LessonProgress | undefined, catalog: ContentCatalog, lesson: Lesson): ResumeResult {
  if (!progress || progress.status !== "in-progress") return { kind: "resume", blockIndex: 0 };
  const blockIndex = progress.currentBlockId ? lesson.blocks.findIndex((block) => block.id === progress.currentBlockId) : -1;
  if (blockIndex < 0) return { kind: "content-changed", blockIndex: 0 };
  if (progress.contentSchemaVersion !== catalog.metadata.schemaVersion || progress.contentVersion !== catalog.metadata.contentVersion) {
    return { kind: "resume", blockIndex };
  }
  return { kind: "resume", blockIndex };
}

export async function completeLesson(repos: ProgressRepositories, catalog: ContentCatalog, lesson: Lesson, now?: () => Date): Promise<void> {
  const existing = await repos.lessonProgress.get(lesson.id);
  if (existing?.status === "completed") return;
  const updatedAt = stamp(now);
  for (const conceptId of new Set([...lesson.introduces, ...lesson.reinforces])) {
    await repos.reviews?.introduce(conceptId, Date.parse(updatedAt));
    const previous = await repos.conceptStates.get(conceptId);
    const lifecycle: ConceptLifecycle = getConceptLifecycle(previous) === "UNSEEN" ? "INTRODUCED" : getConceptLifecycle(previous);
    await repos.conceptStates.put({
      ...record(conceptId, updatedAt), conceptId, lifecycle,
      familiarity: previous?.familiarity ?? 0,
      ...(previous?.nextReviewAt ? { nextReviewAt: previous.nextReviewAt } : {}),
      ...(previous?.lastReviewedAt ? { lastReviewedAt: previous.lastReviewedAt } : {}),
    });
  }
  await repos.lessonProgress.put({
    ...record(lesson.id, updatedAt), lessonId: lesson.id, status: "completed",
    currentBlockId: lesson.blocks.at(-1)?.id, currentStep: Math.max(0, lesson.blocks.length - 1),
    contentVersion: catalog.metadata.contentVersion, contentSchemaVersion: catalog.metadata.schemaVersion,
    completedAt: existing?.completedAt ?? updatedAt,
  });
}

function satisfied(requirement: ContentId, lessonIds: Set<string>, states: Map<string, ConceptState>): boolean {
  if (lessonIds.has(requirement)) return true;
  const lifecycle = states.get(requirement)?.lifecycle;
  return lifecycle === "INTRODUCED" || lifecycle === "LEARNING" || lifecycle === "FAMILIAR" || lifecycle === "MASTERED";
}

export function getUnlockedLessons(catalog: ContentCatalog, progress: readonly LessonProgress[], states: readonly ConceptState[]): readonly Lesson[] {
  const completed = new Set(progress.filter((item) => item.status === "completed").map((item) => item.lessonId));
  const conceptStates = new Map(states.map((item) => [item.conceptId, item]));
  return catalog.lessons.filter((lesson) => !completed.has(lesson.id) && lesson.requires.every((id) => satisfied(id, completed, conceptStates)));
}

export function getNextLesson(catalog: ContentCatalog, progress: readonly LessonProgress[], states: readonly ConceptState[]): Lesson | undefined {
  const unlocked = new Set(getUnlockedLessons(catalog, progress, states).map((lesson) => lesson.id));
  return catalog.lessons.find((lesson) => unlocked.has(lesson.id));
}

/** Resume the canonical in-progress lesson first; otherwise choose the first unlocked lesson. */
export function getContinueLesson(catalog: ContentCatalog, progress: readonly LessonProgress[], states: readonly ConceptState[]): Lesson | undefined {
  for (const lesson of catalog.lessons) {
    if (progress.some((item) => item.lessonId === lesson.id && item.status === "in-progress")) return lesson;
  }
  return getNextLesson(catalog, progress, states);
}
