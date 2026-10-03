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

/** Stable daily selection: scheduler order first, then unseen curriculum order, capped by new cards. */
export function buildDailyQueue(input: DailyQueueInput): DailyQueue {
  const introduced = new Set(input.introducedConceptIds);
  // reviews.due() supplies the scheduler's established overdue/due-time/card-ID order.
  const due = [...new Map(input.due.map((card) => [card.cardId, card])).values()];
  const cap = Math.min(5, Math.max(0, Math.floor(input.cap ?? 5)));
  const unseen: DailyMaterial[] = [];
  let newCardCount = 0;
  for (const material of [...input.materials].sort((a, b) => a.order - b.order || a.conceptId.localeCompare(b.conceptId))) {
    if (introduced.has(material.conceptId) || material.cardIds.length === 0) continue;
    if (newCardCount + material.cardIds.length > cap) continue;
    unseen.push(material);
    newCardCount += material.cardIds.length;
  }
  const newCardIds = unseen.flatMap((item) => item.cardIds);
  return { profileId: input.profileId, due, newConceptIds: unseen.map((item) => item.conceptId), newCardIds, orderedCardIds: [...due.map((item) => item.cardId), ...newCardIds] };
}
