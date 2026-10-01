import { describe, expect, it } from 'vitest'
import { vocabularyFixtures } from '../../content/vocabulary-fixtures.ts'
import { contentCatalog } from '../../lib/content/catalog.ts'
import type { ConceptState, LessonProgress, ReviewEvent } from '../../lib/storage/types.ts'
import { createSrsState, reviewSrsState } from '../review/srs.ts'
import { deriveProgressSummary } from './summary.ts'

const stamp = '2026-09-30T12:00:00.000Z'
const concept = (conceptId: string): ConceptState => ({ id: conceptId, conceptId, recordVersion: 1, updatedAt: stamp, familiarity: 1, lifecycle: 'INTRODUCED' })
const event = (id: string, conceptId: string, rating: ReviewEvent['rating']): ReviewEvent => ({ id, conceptId, cardId: conceptId, recordVersion: 1, updatedAt: stamp, reviewedAt: stamp, rating, kind: 'scheduled-review' })

describe('progress summary', () => {
  it('derives course, kana, vocabulary, grammar, weak areas and activity from the supplied profile records', () => {
    const firstUnit = contentCatalog.units.find((unit) => contentCatalog.courses[0].unitIds.includes(unit.id))!
    const firstLesson = firstUnit.lessonIds[0]
    const vocabId = vocabularyFixtures[0].id
    const events = [event('a', vocabId, 'again'), event('b', vocabId, 'again'), event('c', vocabId, 'good')]
    const summary = deriveProgressSummary({
      lessons: [{ id: firstLesson, lessonId: firstLesson, recordVersion: 1, updatedAt: stamp, status: 'completed' } as LessonProgress],
      concepts: [concept(vocabId)], states: [], events, now: Date.parse(stamp),
    })
    expect(summary.course.completed).toBe(1)
    expect(summary.course.total).toBeGreaterThan(1)
    expect(summary.kana).toEqual({ mastered: 0, total: expect.any(Number) })
    expect(summary.vocabulary).toEqual({ learned: 1, total: vocabularyFixtures.length })
    expect(summary.grammar.learned).toBe(0)
    expect(summary.weakAreas).toEqual([expect.stringContaining(vocabularyFixtures[0].written)])
    expect(summary.activity.map((item) => item.event.id)).toEqual(['c', 'b', 'a'])
  })

  it('counts kana mastery from stable review evidence', () => {
    let state = createSrsState('kana-hira-a', Date.parse(stamp))
    for (let index = 1; index <= 6; index += 1) state = reviewSrsState(state, 'Got It', Date.parse(stamp) + index * 86_400_000)
    const summary = deriveProgressSummary({ lessons: [], concepts: [], states: [{ conceptId: 'kana-hira-a', state }], events: [], now: Date.parse(stamp) + 7 * 86_400_000 })
    expect(summary.kana.mastered).toBe(1)
  })
})
