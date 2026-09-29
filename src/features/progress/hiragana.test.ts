import { describe, expect, it } from 'vitest'
import { kanaFixtures } from '../../content/kana-fixtures.ts'
import type { ReviewEvent } from '../../lib/storage/types.ts'
import { createSrsState, reviewSrsState } from '../review/srs.ts'
import { deriveKanaMastery, confusionScore, getTargetedConfusions, targetedConfusionIds } from './hiragana.ts'

const event = (id: string, target: string, chosen: string): ReviewEvent => ({ id, recordVersion: 1, updatedAt: '2026-01-01T00:00:00.000Z', reviewedAt: '2026-01-01T00:00:00.000Z', conceptId: target, confusedConceptId: chosen, cardId: target, rating: 'again', kind: 'practice' })
const day = 86_400_000

describe('Hiragana progress derivation', () => {
  it('does not treat lesson completion or introduction as mastery', () => {
    expect(deriveKanaMastery('kana-hira-a', undefined, { id: 'kana-hira-a', recordVersion: 1, updatedAt: '', conceptId: 'kana-hira-a', lifecycle: 'MASTERED', familiarity: 1 })).toBe('introduced')
  })

  it('reaches Mastered through repeated stable success', () => {
    let srs = createSrsState('kana-hira-a', Date.UTC(2026, 0, 1))
    for (let i = 0; i < 6; i += 1) srs = reviewSrsState(srs, 'Got It', Date.UTC(2026, 0, 1) + i * day)
    expect(deriveKanaMastery('kana-hira-a', srs, undefined)).toBe('mastered')
  })

  it('requires review evidence across every scheduled form before showing Mastered', () => {
    let stable = createSrsState('kana-hira-a', Date.UTC(2026, 0, 1))
    for (let i = 0; i < 6; i += 1) stable = reviewSrsState(stable, 'Got It', Date.UTC(2026, 0, 1) + i * day)
    expect(deriveKanaMastery('kana-hira-a', [stable, createSrsState('kana-hira-a', Date.UTC(2026, 0, 1))], undefined)).toBe('learning')
    expect(deriveKanaMastery('kana-hira-a', [stable, stable], undefined)).toBe('mastered')
  })

  it('lets lapses lower the derived state', () => {
    let srs = createSrsState('kana-hira-a', Date.UTC(2026, 0, 1))
    for (let i = 0; i < 4; i += 1) srs = reviewSrsState(srs, 'Got It', Date.UTC(2026, 0, 1) + i * day)
    expect(deriveKanaMastery('kana-hira-a', srs, undefined)).toBe('mastered')
    srs = reviewSrsState(srs, 'Forgot', Date.UTC(2026, 0, 5))
    srs = reviewSrsState(srs, 'Forgot', Date.UTC(2026, 0, 5) + day)
    expect(deriveKanaMastery('kana-hira-a', srs, undefined)).toBe('struggling')
  })

  it('triggers remediation for repeated specific confusion and ignores unrelated mistakes', () => {
    const events = [event('1', 'kana-hira-nu', 'kana-hira-me'), event('2', 'kana-hira-nu', 'kana-hira-me'), event('3', 'kana-hira-a', 'kana-hira-i')]
    expect(confusionScore('kana-hira-nu', 'kana-hira-me', events)).toBe(2)
    expect(getTargetedConfusions(events)).toContainEqual(['ぬ', 'め'])
    expect(targetedConfusionIds(events, kanaFixtures)).toEqual(expect.arrayContaining(['kana-hira-nu', 'kana-hira-me']))
    expect(confusionScore('kana-hira-re', 'kana-hira-ne', events)).toBe(0)
    expect(getTargetedConfusions([event('unrelated', 'kana-hira-a', 'kana-hira-i')])).toEqual([])
  })
})
