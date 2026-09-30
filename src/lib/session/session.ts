import type { ContentId, Lesson } from "../content/types.ts";

export type SessionItem =
  | { readonly kind: "review"; readonly conceptId: ContentId; readonly cardId: string; readonly formId: string }
  | { readonly kind: "remediation"; readonly conceptId: ContentId }
  | { readonly kind: "contrast"; readonly conceptIds: readonly ContentId[]; readonly glyphs: readonly string[] }
  | { readonly kind: "lesson"; readonly lessonId: ContentId; readonly mode: "resume" | "new"; readonly conceptIds: readonly ContentId[] }
  | { readonly kind: "practice"; readonly lessonId: ContentId; readonly conceptIds: readonly ContentId[] };

export interface SessionPlan {
  readonly version: 1;
  readonly items: readonly SessionItem[];
  readonly summary: {
    readonly reviewCount: number;
    readonly remediationCount: number;
    readonly includesLesson: boolean;
    readonly includesPractice: boolean;
    readonly newConceptCount: number;
  };
}

export interface ComposeSessionInput {
  /** Candidates are derived by the caller; this module performs no scheduling. */
  readonly dueReviews: readonly { readonly conceptId: ContentId; readonly cardId: string; readonly formId: string; readonly overdueMs?: number }[];
  readonly weakConceptIds: readonly ContentId[];
  readonly contrastGroups?: readonly { readonly conceptIds: readonly ContentId[]; readonly glyphs: readonly string[] }[];
  readonly currentLesson?: Lesson;
  readonly lessonMode?: "resume" | "new";
  /** Maximum number of new concepts allowed in this session's lesson. */
  readonly newMaterialCap: number;
  /** Curriculum lessons are atomic; production can allow a curated unit over the normal cap. */
  readonly allowOversizedLesson?: boolean;
  /** Limit the review portion so new lessons can still appear in a mixed session. */
  readonly reviewLimit?: number;
  /** Limit remediation and contrast exercises to keep daily sessions balanced. */
  readonly remediationLimit?: number;
  /** Lower the new material allowance when recent failure load is high. */
  readonly recentFailureCount?: number;
  readonly failureThrottleThreshold?: number;
}

/** Deterministic policy: due reviews, weak concepts, then an eligible lesson and its practice. */
export function composeSession(input: ComposeSessionInput): SessionPlan {
  const items: SessionItem[] = [];
  const seenConcepts = new Set<ContentId>();
  const seenCards = new Set<string>();
  const reviewLimit = input.reviewLimit === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(input.reviewLimit));
  const orderedReviews = input.dueReviews.slice().sort((a, b) => {
    const overdueA = Number.isFinite(a.overdueMs) ? a.overdueMs! : 0;
    const overdueB = Number.isFinite(b.overdueMs) ? b.overdueMs! : 0;
    return overdueB - overdueA || a.cardId.localeCompare(b.cardId);
  });
  for (const review of orderedReviews) {
    if (seenCards.size >= reviewLimit) break;
    if (seenCards.has(review.cardId)) continue;
    seenCards.add(review.cardId);
    seenConcepts.add(review.conceptId);
    const { overdueMs: _overdueMs, ...reviewItem } = review;
    items.push({ kind: "review", ...reviewItem });
  }
  const remediationLimit = input.remediationLimit === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(input.remediationLimit));
  let selectedRemediationCount = 0;
  for (const conceptId of input.weakConceptIds) {
    if (selectedRemediationCount >= remediationLimit) break;
    if (seenConcepts.has(conceptId)) continue;
    seenConcepts.add(conceptId);
    items.push({ kind: "remediation", conceptId });
    selectedRemediationCount += 1;
  }
  for (const group of input.contrastGroups ?? []) {
    const conceptIds = [...new Set(group.conceptIds)];
    if (selectedRemediationCount >= remediationLimit) break;
    if (conceptIds.length > 1 && conceptIds.some((id) => seenConcepts.has(id)) === false) {
      items.push({ kind: "contrast", conceptIds, glyphs: group.glyphs });
      conceptIds.forEach((id) => seenConcepts.add(id));
      selectedRemediationCount += 1;
    }
  }

  const lesson = input.currentLesson;
  const newConcepts = lesson ? [...new Set(lesson.introduces)] : [];
  const requestedCap = Math.max(0, Math.floor(input.newMaterialCap));
  const failureThreshold = Math.max(1, Math.floor(input.failureThrottleThreshold ?? 3));
  const failureLoad = Math.max(0, Math.floor(input.recentFailureCount ?? 0));
  const cap = failureLoad >= failureThreshold ? 0 : failureLoad > 0 ? Math.max(1, requestedCap - failureLoad) : requestedCap;
  const includeLesson = Boolean(lesson && (newConcepts.length <= cap || input.allowOversizedLesson === true));
  if (lesson && includeLesson) {
    items.push({ kind: "lesson", lessonId: lesson.id, mode: input.lessonMode ?? "new", conceptIds: newConcepts });
    const practiceConcepts = [...new Set([...lesson.introduces, ...lesson.reinforces])];
    if (practiceConcepts.length > 0) items.push({ kind: "practice", lessonId: lesson.id, conceptIds: practiceConcepts });
  }

  const reviewCount = items.filter((item) => item.kind === "review").length;
  const remediationCount = items.filter((item) => item.kind === "remediation" || item.kind === "contrast").length;
  return {
    version: 1,
    items,
    summary: {
      reviewCount,
      remediationCount,
      includesLesson: includeLesson,
      includesPractice: includeLesson && items.some((item) => item.kind === "practice"),
      newConceptCount: includeLesson ? newConcepts.length : 0,
    },
  };
}
