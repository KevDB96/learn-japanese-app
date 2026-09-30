import type { ReviewEvent } from "../../lib/storage/types.ts";

/** Tunable evidence thresholds live here, independent of UI wording. */
export const WEAKNESS_POLICY = {
  recentWindowDays: 30,
  minimumEvents: 3,
  minimumFailureEvents: 2,
  failureWeight: 2,
  hardWeight: 1,
  confusionWeight: 2,
  responseTimeMinimumSamples: 3,
  slowResponseMs: 12_000,
  slowResponseWeight: 1,
  weaknessScoreThreshold: 4,
  confusionWindowDays: 60,
  confusionMinimumErrors: 2,
  confusionRecoveryStreak: 3,
} as const;

export type ConceptFamily = "kana" | "vocabulary" | "grammar" | "phrase";
export interface ConceptConfusion {
  readonly conceptIds: readonly [string, string];
  /** Counts retain target -> selected direction; the pair itself is symmetric. */
  readonly directionalErrors: Readonly<Record<string, number>>;
  readonly errorCount: number;
  readonly recoveryStreak: number;
  readonly active: boolean;
}

/** Infer meaningful concept pairs from recorded answer choices, never from a static hint list. */
export function inferConceptConfusions(
  events: readonly ReviewEvent[], families: ReadonlyMap<string, ConceptFamily>, now: number,
): ConceptConfusion[] {
  if (!Number.isFinite(now)) throw new RangeError("Current time must be finite");
  const cutoff = now - WEAKNESS_POLICY.confusionWindowDays * 86_400_000;
  const pairs = new Map<string, { ids: [string, string]; errors: Map<string, number>; streak: number; active: boolean }>();
  const ordered = events.filter((event) => {
    const at = Date.parse(event.reviewedAt);
    return Number.isFinite(at) && at >= cutoff && at <= now;
  }).slice().sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt) || a.id.localeCompare(b.id));
  for (const event of ordered) {
    const otherId = event.confusedConceptId ?? event.contrastConceptId;
    if (!otherId || otherId === event.conceptId) continue;
    const aFamily = families.get(event.conceptId), bFamily = families.get(otherId);
    if (!aFamily || aFamily !== bFamily) continue;
    const ids: [string, string] = [event.conceptId, otherId].sort() as [string, string];
    const key = `${ids[0]}|${ids[1]}`;
    const pair = pairs.get(key) ?? { ids, errors: new Map<string, number>(), streak: 0, active: false };
    if (event.confusedConceptId) {
      const direction = `${event.conceptId}->${otherId}`;
      pair.errors.set(direction, (pair.errors.get(direction) ?? 0) + 1);
      pair.streak = 0;
      pair.active = [...pair.errors.values()].reduce((sum, count) => sum + count, 0) >= WEAKNESS_POLICY.confusionMinimumErrors;
    } else if (event.contrastConceptId && (event.rating === "good" || event.rating === "easy")) {
      pair.streak += 1;
      if (pair.streak >= WEAKNESS_POLICY.confusionRecoveryStreak) pair.active = false;
    }
    pairs.set(key, pair);
  }
  return [...pairs.values()].map((pair) => ({
    conceptIds: pair.ids, directionalErrors: Object.fromEntries(pair.errors),
    errorCount: [...pair.errors.values()].reduce((sum, count) => sum + count, 0),
    recoveryStreak: pair.streak, active: pair.active,
  })).filter((pair) => pair.errorCount > 0)
    .sort((a, b) => Number(b.active) - Number(a.active) || b.errorCount - a.errorCount || a.conceptIds[0].localeCompare(b.conceptIds[0]));
}

export interface ConceptWeakness {
  readonly conceptId: string;
  readonly score: number;
  readonly failureCount: number;
  readonly lapseCount: number;
  readonly confusionCount: number;
  readonly reliableResponseCount: number;
  readonly medianResponseTimeMs?: number;
  readonly isWeak: boolean;
}

/** Derive deterministic, recent weakness evidence without changing FSRS state. */
export function rankWeakConcepts(events: readonly ReviewEvent[], now: number): ConceptWeakness[] {
  if (!Number.isFinite(now)) throw new RangeError("Current time must be finite");
  const cutoff = now - WEAKNESS_POLICY.recentWindowDays * 86_400_000;
  const concepts = new Map<string, ReviewEvent[]>();
  for (const event of events) {
    const at = Date.parse(event.reviewedAt);
    if (event.kind !== "scheduled-review" || !Number.isFinite(at) || at < cutoff || at > now) continue;
    const group = concepts.get(event.conceptId) ?? [];
    group.push(event);
    concepts.set(event.conceptId, group);
  }
  return [...concepts.entries()].map(([conceptId, history]) => {
    const ordered = history.slice().sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt) || a.id.localeCompare(b.id));
    const failures = ordered.filter((event) => event.rating === "again");
    const hardCount = ordered.filter((event) => event.rating === "hard").length;
    const confusions = ordered.filter((event) => !!event.confusedConceptId && event.confusedConceptId !== conceptId);
    const responseTimes = ordered.map((event) => event.responseTimeMs).filter((value): value is number => Number.isFinite(value) && value! > 0 && value! <= 120_000).sort((a, b) => a - b);
    const medianResponseTimeMs = responseTimes.length ? responseTimes[Math.floor(responseTimes.length / 2)] : undefined;
    const slowResponse = responseTimes.length >= WEAKNESS_POLICY.responseTimeMinimumSamples && medianResponseTimeMs! >= WEAKNESS_POLICY.slowResponseMs;
    const score = failures.length * WEAKNESS_POLICY.failureWeight + hardCount * WEAKNESS_POLICY.hardWeight
      + confusions.length * WEAKNESS_POLICY.confusionWeight + (slowResponse ? WEAKNESS_POLICY.slowResponseWeight : 0);
    return {
      conceptId, score, failureCount: failures.length, lapseCount: failures.length,
      confusionCount: confusions.length, reliableResponseCount: responseTimes.length,
      ...(medianResponseTimeMs === undefined ? {} : { medianResponseTimeMs }),
      isWeak: ordered.length >= WEAKNESS_POLICY.minimumEvents && failures.length >= WEAKNESS_POLICY.minimumFailureEvents && score >= WEAKNESS_POLICY.weaknessScoreThreshold,
    };
  }).sort((a, b) => b.score - a.score || b.failureCount - a.failureCount || a.conceptId.localeCompare(b.conceptId));
}

/** Return weak concepts in the same deterministic priority order as the full ranking. */
export function selectWeakConcepts(events: readonly ReviewEvent[], now: number): ConceptWeakness[] {
  return rankWeakConcepts(events, now).filter((concept) => concept.isWeak);
}
