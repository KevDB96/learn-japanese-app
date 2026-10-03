export interface DailyMaterial { readonly conceptId: string; readonly cardIds: readonly string[]; readonly order: number }
export interface DailyDueCard { readonly conceptId: string; readonly cardId: string; readonly formId: string; readonly overdueMs: number }
export interface DailyQueueInput {
  readonly profileId: string;
  readonly due: readonly DailyDueCard[];
  readonly materials: readonly DailyMaterial[];
  readonly introducedConceptIds: readonly string[];
  readonly cap?: number;
}
export interface DailyQueue { readonly profileId: string; readonly due: readonly DailyDueCard[]; readonly newConceptIds: readonly string[]; readonly newCardIds: readonly string[]; readonly orderedCardIds: readonly string[] }

/** Stable daily selection: scheduler order first, then unseen curriculum order, capped by new concepts. */
export function buildDailyQueue(input: DailyQueueInput): DailyQueue {
  const introduced = new Set(input.introducedConceptIds);
  // reviews.due() supplies the scheduler's established overdue/due-time/card-ID order.
  const due = [...new Map(input.due.map((card) => [card.cardId, card])).values()];
  const cap = Math.min(5, Math.max(0, Math.floor(input.cap ?? 5)));
  const unseen = [...input.materials]
    .sort((a, b) => a.order - b.order || a.conceptId.localeCompare(b.conceptId))
    .filter((material) => !introduced.has(material.conceptId) && material.cardIds.length > 0)
    .slice(0, cap);
  const newCardIds = unseen.flatMap((item) => item.cardIds);
  return { profileId: input.profileId, due, newConceptIds: unseen.map((item) => item.conceptId), newCardIds, orderedCardIds: [...due.map((item) => item.cardId), ...newCardIds] };
}
