import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs'

export const REVIEW_RATINGS = ['Forgot', 'Hard', 'Got It', 'Easy'] as const
export type ReviewRating = (typeof REVIEW_RATINGS)[number]
export type FsrsRating = Rating.Again | Rating.Hard | Rating.Good | Rating.Easy

export interface SrsState {
  schemaVersion: 1
  conceptId: string
  difficulty: number
  stability: number
  lastReviewedAt: string | null
  nextDueAt: string
  reviewCount: number
  lapseCount: number
  scheduler: {
    state: 'New' | 'Learning' | 'Review' | 'Relearning'
    elapsedDays: number
    scheduledDays: number
    learningSteps: number
    repetitions: number
  }
}

export interface ManualPracticeActivity {
  kind: 'practice'
  conceptId: string
  occurredAt: string
  affectsSchedule: false
}

export interface DueReviewCandidate {
  readonly cardId: string;
  readonly conceptId: string;
  readonly dueAt: string;
  readonly overdueMs: number;
}

export interface SchedulingReviewEvent {
  readonly id: string;
  readonly conceptId: string;
  readonly cardId: string;
  readonly reviewedAt: string;
  readonly rating: ReviewRating;
  readonly kind: 'scheduled-review' | 'practice';
}

const fsrsScheduler = fsrs({ enable_fuzz: false })

const ratingMap: Record<ReviewRating, FsrsRating> = {
  Forgot: Rating.Again,
  Hard: Rating.Hard,
  'Got It': Rating.Good,
  Easy: Rating.Easy,
}

export function toFsrsRating(rating: ReviewRating): FsrsRating {
  return ratingMap[rating]
}

function iso(timestamp: number): string {
  if (!Number.isFinite(timestamp)) throw new RangeError('Timestamp must be finite')
  return new Date(timestamp).toISOString()
}

export function createSrsState(conceptId: string, at: number): SrsState {
  const card = createEmptyCard(at)
  return {
    schemaVersion: 1,
    conceptId,
    difficulty: card.difficulty,
    stability: card.stability,
    lastReviewedAt: null,
    nextDueAt: card.due.toISOString(),
    reviewCount: 0,
    lapseCount: 0,
    scheduler: {
      state: State[card.state] as SrsState['scheduler']['state'],
      elapsedDays: card.elapsed_days,
      scheduledDays: card.scheduled_days,
      learningSteps: card.learning_steps,
      repetitions: card.reps,
    },
  }
}

export function applyReviewEvent(state: SrsState | undefined, event: SchedulingReviewEvent): SrsState | undefined {
  if (event.kind === 'practice') return state;
  const at = Date.parse(event.reviewedAt);
  if (!Number.isFinite(at)) throw new RangeError('Review timestamp must be valid');
  return reviewSrsState(state ?? createSrsState(event.conceptId, at), event.rating, at);
}

/** Due cards sort most overdue first, then by scheduler due time and stable card identity. */
export function selectDueReviews(states: readonly { readonly cardId: string; readonly conceptId: string; readonly state: SrsState }[], now: number): DueReviewCandidate[] {
  return states.flatMap(({ cardId, conceptId, state }) => {
    const dueAt = Date.parse(state.nextDueAt);
    return dueAt <= now ? [{ cardId, conceptId, dueAt: state.nextDueAt, overdueMs: now - dueAt }] : [];
  }).sort((a, b) => b.overdueMs - a.overdueMs || a.dueAt.localeCompare(b.dueAt) || a.cardId.localeCompare(b.cardId));
}

export function rebuildSrsState(events: readonly SchedulingReviewEvent[], conceptId: string, cardId: string): SrsState | undefined {
  let state: SrsState | undefined;
  const ordered = events.filter((event) => event.conceptId === conceptId && event.cardId === cardId && event.kind === 'scheduled-review')
    .slice().sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt) || a.id.localeCompare(b.id));
  for (const event of ordered) state = applyReviewEvent(state, event);
  return state;
}

export function reviewSrsState(state: SrsState, rating: ReviewRating, reviewedAt: number): SrsState {
  const card = {
    due: new Date(state.nextDueAt),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.scheduler.elapsedDays,
    scheduled_days: state.scheduler.scheduledDays,
    learning_steps: state.scheduler.learningSteps,
    reps: state.scheduler.repetitions,
    lapses: state.lapseCount,
    state: State[state.scheduler.state],
    ...(state.lastReviewedAt ? { last_review: new Date(state.lastReviewedAt) } : {}),
  }
  const result = fsrsScheduler.next(card, reviewedAt, toFsrsRating(rating)).card
  return {
    schemaVersion: 1,
    conceptId: state.conceptId,
    difficulty: result.difficulty,
    stability: result.stability,
    lastReviewedAt: iso(reviewedAt),
    nextDueAt: result.due.toISOString(),
    reviewCount: state.reviewCount + 1,
    lapseCount: state.lapseCount + (rating === 'Forgot' ? 1 : 0),
    scheduler: {
      state: State[result.state] as SrsState['scheduler']['state'],
      elapsedDays: result.elapsed_days,
      scheduledDays: result.scheduled_days,
      learningSteps: result.learning_steps,
      repetitions: result.reps,
    },
  }
}

export function recordManualPractice(conceptId: string, occurredAt: number): ManualPracticeActivity {
  return { kind: 'practice', conceptId, occurredAt: iso(occurredAt), affectsSchedule: false }
}

export function serializeSrsState(state: SrsState): string {
  return JSON.stringify(state)
}

export function restoreSrsState(serialized: string): SrsState {
  const value: unknown = JSON.parse(serialized)
  if (!isSrsState(value)) throw new TypeError('Invalid SRS state')
  return value
}

function isSrsState(value: unknown): value is SrsState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<SrsState>
  const scheduler = state.scheduler
  return state.schemaVersion === 1
    && typeof state.conceptId === 'string'
    && typeof state.difficulty === 'number' && Number.isFinite(state.difficulty)
    && typeof state.stability === 'number' && Number.isFinite(state.stability)
    && (state.lastReviewedAt === null || typeof state.lastReviewedAt === 'string')
    && typeof state.nextDueAt === 'string'
    && Number.isInteger(state.reviewCount) && (state.reviewCount ?? -1) >= 0
    && Number.isInteger(state.lapseCount) && (state.lapseCount ?? -1) >= 0
    && !!scheduler && ['New', 'Learning', 'Review', 'Relearning'].includes(scheduler.state)
    && Number.isFinite(scheduler.elapsedDays) && Number.isFinite(scheduler.scheduledDays)
    && Number.isInteger(scheduler.learningSteps) && Number.isInteger(scheduler.repetitions)
}
