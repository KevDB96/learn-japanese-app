import { describe, expect, it } from 'vitest'
import {
  createSrsState,
  recordManualPractice,
  restoreSrsState,
  selectDueReviews,
  reviewSrsState,
  serializeSrsState,
  toFsrsRating,
} from './srs'
import { Rating } from 'ts-fsrs'

const start = Date.parse('2026-01-01T00:00:00.000Z')

describe('SRS scheduling', () => {
  it('starts a new concept due immediately with valid empty scheduler state', () => {
    expect(createSrsState('kana:a', start)).toEqual({
      schemaVersion: 1,
      conceptId: 'kana:a',
      difficulty: 0,
      stability: 0,
      lastReviewedAt: null,
      nextDueAt: '2026-01-01T00:00:00.000Z',
      reviewCount: 0,
      lapseCount: 0,
      scheduler: { state: 'New', elapsedDays: 0, scheduledDays: 0, learningSteps: 0, repetitions: 0 },
    })
  })

  it('maps the four user ratings explicitly to FSRS grades', () => {
    expect([
      toFsrsRating('Forgot'), toFsrsRating('Hard'), toFsrsRating('Got It'), toFsrsRating('Easy'),
    ]).toEqual([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy])
  })

  it.each([
    ['Forgot', '2026-01-01T00:01:00.000Z', 0.212],
    ['Hard', '2026-01-01T00:06:00.000Z', 1.2931],
    ['Got It', '2026-01-01T00:10:00.000Z', 2.3065],
    ['Easy', '2026-01-09T00:00:00.000Z', 8.2956],
  ] as const)('schedules a new item for %s deterministically', (rating, due, stability) => {
    const next = reviewSrsState(createSrsState('vocab:水', start), rating, start)
    expect(next.lastReviewedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(next.nextDueAt).toBe(due)
    expect(next.stability).toBe(stability)
    expect(next.reviewCount).toBe(1)
    expect(next.lapseCount).toBe(rating === 'Forgot' ? 1 : 0)
  })

  it('moves repeated successes from short learning steps into longer intervals', () => {
    let state = createSrsState('kanji:日', start)
    const due: string[] = []
    for (let day = 0; day < 5; day += 1) {
      state = reviewSrsState(state, 'Got It', start + day * 86_400_000)
      due.push(state.nextDueAt)
    }
    expect(due).toEqual([
      '2026-01-01T00:10:00.000Z',
      '2026-01-09T00:00:00.000Z',
      '2026-01-15T00:00:00.000Z',
      '2026-01-20T00:00:00.000Z',
      '2026-01-26T00:00:00.000Z',
    ])
    expect(state.reviewCount).toBe(5)
    expect(state.scheduler.state).toBe('Review')
  })

  it('records repeated lapses without a fixed interval ladder', () => {
    let state = createSrsState('grammar:です', start)
    const due: string[] = []
    for (let minute = 0; minute < 3; minute += 1) {
      state = reviewSrsState(state, 'Forgot', start + minute * 60_000)
      due.push(state.nextDueAt)
    }
    expect(due).toEqual([
      '2026-01-01T00:01:00.000Z',
      '2026-01-01T00:02:00.000Z',
      '2026-01-01T00:03:00.000Z',
    ])
    expect(state.reviewCount).toBe(3)
    expect(state.lapseCount).toBe(3)
    expect(state.stability).toBeLessThan(0.212)
  })

  it('round-trips persisted state and resumes identical deterministic scheduling', () => {
    const reviewed = reviewSrsState(createSrsState('word:猫', start), 'Easy', start)
    const restored = restoreSrsState(serializeSrsState(reviewed))
    expect(restored).toEqual(reviewed)
    expect(reviewSrsState(restored, 'Got It', start + 8 * 86_400_000)).toEqual(
      reviewSrsState(reviewed, 'Got It', start + 8 * 86_400_000),
    )
    expect(() => restoreSrsState('{"schemaVersion":99}')).toThrow('Invalid SRS state')
  })

  it('represents manual practice without scheduling changes', () => {
    const state = createSrsState('word:犬', start)
    const activity = recordManualPractice(state.conceptId, start + 5_000)
    expect(activity).toEqual({
      kind: 'practice', conceptId: 'word:犬', occurredAt: '2026-01-01T00:00:05.000Z', affectsSchedule: false,
    })
    expect(state).toEqual(createSrsState('word:犬', start))
  })

  it('selects due cards by overdue priority and stable tie breaking', () => {
    const dueAt = (id: string, due: number) => ({ cardId: id, conceptId: id, state: createSrsState(id, due) })
    expect(selectDueReviews([
      dueAt('later', start - 60_000), dueAt('same-b', start - 120_000), dueAt('same-a', start - 120_000), dueAt('future', start + 1),
    ], start)).toMatchObject([
      { cardId: 'same-a', overdueMs: 120_000 }, { cardId: 'same-b', overdueMs: 120_000 }, { cardId: 'later', overdueMs: 60_000 },
    ])
  })
})
