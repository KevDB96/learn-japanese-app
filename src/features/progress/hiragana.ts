import type { KanaConcept } from '../../lib/content/types.ts'
import type { ConceptState, ReviewEvent } from '../../lib/storage/types.ts'
import type { SrsState } from '../review/srs.ts'

export const KNOWN_HIRAGANA_CONFUSIONS = [
  { glyphs: ['ぬ', 'め'], ids: ['kana-hira-nu', 'kana-hira-me'] },
  { glyphs: ['れ', 'ね'], ids: ['kana-hira-re', 'kana-hira-ne'] },
  { glyphs: ['る', 'ろ'], ids: ['kana-hira-ru', 'kana-hira-ro'] },
  { glyphs: ['さ', 'ち'], ids: ['kana-hira-sa', 'kana-hira-ti'] },
] as const

export type KanaMastery = 'unseen' | 'introduced' | 'learning' | 'mastered' | 'struggling'
export interface KanaProgress { readonly concept: KanaConcept; readonly state: KanaMastery; readonly reason: string; readonly confusionCount: number }

export function confusionEvidence(events: readonly ReviewEvent[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const event of events) if (event.confusedConceptId && event.confusedConceptId !== event.conceptId) {
    const key = [event.conceptId, event.confusedConceptId].sort().join('|')
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

export function confusionScore(a: string, b: string, events: readonly ReviewEvent[]): number {
  return confusionEvidence(events).get([a, b].sort().join('|')) ?? 0
}

export function getTargetedConfusions(events: readonly ReviewEvent[], threshold = 2): readonly (readonly [string, string])[] {
  return KNOWN_HIRAGANA_CONFUSIONS.filter(({ ids: [a, b] }) => confusionScore(a, b, events) >= threshold).map(({ glyphs }) => glyphs)
}

export function targetedConfusionIds(events: readonly ReviewEvent[], kana: readonly KanaConcept[], threshold = 2): string[] {
  const ids = new Set<string>()
  for (const [a, b] of getTargetedConfusions(events, threshold)) {
    const first = kanaIdForGlyph(kana, a)
    const second = kanaIdForGlyph(kana, b)
    if (first) ids.add(first)
    if (second) ids.add(second)
  }
  return [...ids]
}

export function targetedContrastGroups(events: readonly ReviewEvent[], kana: readonly KanaConcept[], threshold = 2): { conceptIds: string[]; glyphs: string[] }[] {
  return getTargetedConfusions(events, threshold).flatMap((glyphs) => {
    const conceptIds = glyphs.map((glyph) => kanaIdForGlyph(kana, glyph)).filter((id): id is string => !!id)
    return conceptIds.length === glyphs.length ? [{ conceptIds, glyphs: [...glyphs] }] : []
  })
}

export function deriveKanaMastery(_conceptId: string, srs: SrsState | undefined, _concept: ConceptState | undefined): KanaMastery {
  if (!srs || srs.reviewCount === 0) return _concept ? 'introduced' : 'unseen'
  if (isStruggling(srs)) return 'struggling'
  if (srs.reviewCount >= 4 && srs.stability >= 5 && srs.scheduler.state === 'Review') return 'mastered'
  return 'learning'
}

export function deriveHiraganaProgress(kana: readonly KanaConcept[], concepts: readonly ConceptState[], states: readonly { conceptId: string; state: SrsState }[], events: readonly ReviewEvent[]): KanaProgress[] {
  const conceptMap = new Map(concepts.map((item) => [item.conceptId, item]))
  const srsMap = new Map(states.map((item) => [item.conceptId, item.state]))
  return kana.filter((item) => item.reviewEligible !== false && item.form === 'base').map((item) => ({
    concept: item,
    state: deriveKanaMastery(item.id, srsMap.get(item.id), conceptMap.get(item.id)),
    reason: describe(item.id, srsMap.get(item.id), conceptMap.get(item.id)),
    confusionCount: events.filter((event) => event.confusedConceptId && (event.conceptId === item.id || event.confusedConceptId === item.id)).length,
  }))
}

function describe(_id: string, srs: SrsState | undefined, concept: ConceptState | undefined): string {
  if (!srs || srs.reviewCount === 0) return concept ? 'Introduced; no reviews yet' : 'Not introduced yet'
  if (isStruggling(srs)) return `${srs.lapseCount} lapses; practice recommended`
  if (srs.reviewCount >= 4 && srs.stability >= 5 && srs.scheduler.state === 'Review') return `Stable across ${srs.reviewCount} reviews`
  return `${srs.reviewCount} reviews; building stability`
}

function isStruggling(srs: SrsState): boolean {
  return srs.scheduler.state === 'Relearning' || (srs.reviewCount >= 3 && srs.lapseCount / srs.reviewCount >= 0.4 && srs.scheduler.state !== 'Review')
}

export function kanaIdForGlyph(kana: readonly KanaConcept[], glyph: string): string | undefined {
  return kana.find((item) => item.script === 'hiragana' && item.glyph === glyph)?.id
}

export function kanaIdForAnswer(kana: readonly KanaConcept[], answer: string): string | undefined {
  const normalized = answer.trim().toLocaleLowerCase()
  return kana.find((item) => item.script === 'hiragana' && (item.glyph === answer.trim() || item.romanization.toLocaleLowerCase() === normalized))?.id
}
