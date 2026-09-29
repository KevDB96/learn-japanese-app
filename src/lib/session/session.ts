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
  readonly dueReviews: readonly { readonly conceptId: ContentId; readonly cardId: string; readonly formId: string }[];
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
}

/** Deterministic policy: due reviews, weak concepts, then an eligible lesson and its practice. */
export function composeSession(input: ComposeSessionInput): SessionPlan {
  const items: SessionItem[] = [];
  const seenConcepts = new Set<ContentId>();
  const seenCards = new Set<string>();
  const reviewLimit = input.reviewLimit === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(input.reviewLimit));
  for (const review of input.dueReviews) {
    if (seenCards.size >= reviewLimit) break;
    if (seenCards.has(review.cardId)) continue;
    seenCards.add(review.cardId);
    seenConcepts.add(review.conceptId);
    items.push({ kind: "review", ...review });
  }
  for (const conceptId of input.weakConceptIds) {
    if (seenConcepts.has(conceptId)) continue;
    seenConcepts.add(conceptId);
    items.push({ kind: "remediation", conceptId });
  }
  for (const group of input.contrastGroups ?? []) {
    const conceptIds = [...new Set(group.conceptIds)];
    if (conceptIds.length > 1) items.push({ kind: "contrast", conceptIds, glyphs: group.glyphs });
  }

  const lesson = input.currentLesson;
  const newConcepts = lesson ? [...new Set(lesson.introduces)] : [];
  const cap = Math.max(0, Math.floor(input.newMaterialCap));
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
