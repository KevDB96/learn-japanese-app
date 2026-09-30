import type { KanaConcept } from '../../lib/content/types.ts'
import type { ConceptState, ReviewEvent } from '../../lib/storage/types.ts'
import type { SrsState } from '../review/srs.ts'

export const KNOWN_KANA_CONFUSIONS = [
  { glyphs: ['ぬ', 'め'], ids: ['kana-hira-nu', 'kana-hira-me'] },
  { glyphs: ['れ', 'ね'], ids: ['kana-hira-re', 'kana-hira-ne'] },
  { glyphs: ['る', 'ろ'], ids: ['kana-hira-ru', 'kana-hira-ro'] },
  { glyphs: ['さ', 'ち'], ids: ['kana-hira-sa', 'kana-hira-ti'] },
  { glyphs: ['シ', 'ツ'], ids: ['kana-kata-shi', 'kana-kata-tsu'] },
  { glyphs: ['ソ', 'ン'], ids: ['kana-kata-so', 'kana-kata-n'] },
  { glyphs: ['ク', 'ケ'], ids: ['kana-kata-ku', 'kana-kata-ke'] },
  { glyphs: ['ワ', 'ウ'], ids: ['kana-kata-wa', 'kana-kata-u'] },
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
  return KNOWN_KANA_CONFUSIONS.filter(({ ids: [a, b] }) => confusionScore(a, b, events) >= threshold).map(({ glyphs }) => glyphs)
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

export function deriveKanaMastery(_conceptId: string, srs: SrsState | readonly SrsState[] | undefined, _concept: ConceptState | undefined): KanaMastery {
  const states: readonly SrsState[] = !srs ? [] : Array.isArray(srs) ? srs as readonly SrsState[] : [srs as SrsState]
  if (states.length === 0 || states.every((state) => state.reviewCount === 0)) return _concept ? 'introduced' : 'unseen'
  if (states.some(isStruggling)) return 'struggling'
  if (states.every((state) => state.reviewCount >= 4 && state.stability >= 5 && state.scheduler.state === 'Review')) return 'mastered'
  return 'learning'
}

export function deriveHiraganaProgress(kana: readonly KanaConcept[], concepts: readonly ConceptState[], states: readonly { conceptId: string; state: SrsState }[], events: readonly ReviewEvent[]): KanaProgress[] {
  const conceptMap = new Map(concepts.map((item) => [item.conceptId, item]))
  const srsMap = new Map<string, SrsState[]>()
  for (const item of states) { const group = srsMap.get(item.conceptId) ?? []; group.push(item.state); srsMap.set(item.conceptId, group) }
  return kana.filter((item) => item.reviewEligible !== false && item.form === 'base').map((item) => ({
    concept: item,
    state: deriveKanaMastery(item.id, srsMap.get(item.id), conceptMap.get(item.id)),
    reason: describe(item.id, srsMap.get(item.id), conceptMap.get(item.id)),
    confusionCount: events.filter((event) => event.confusedConceptId && (event.conceptId === item.id || event.confusedConceptId === item.id)).length,
  }))
}

function describe(_id: string, srs: readonly SrsState[] | undefined, concept: ConceptState | undefined): string {
  if (!srs || srs.every((state) => state.reviewCount === 0)) return concept ? 'Introduced; no reviews yet' : 'Not introduced yet'
  const reviewed = srs.filter((state) => state.reviewCount > 0)
  const lapses = reviewed.reduce((sum, state) => sum + state.lapseCount, 0)
  if (srs.some(isStruggling)) return `${lapses} lapses; practice recommended`
  if (srs.every((state) => state.reviewCount >= 4 && state.stability >= 5 && state.scheduler.state === 'Review')) return `Stable across ${srs.length} review forms`
  return `${reviewed.reduce((sum, state) => sum + state.reviewCount, 0)} reviews across ${reviewed.length} forms`
}

function isStruggling(srs: SrsState): boolean {
  return srs.scheduler.state === 'Relearning' || (srs.reviewCount >= 3 && srs.lapseCount / srs.reviewCount >= 0.4 && srs.scheduler.state !== 'Review')
}

export function kanaIdForGlyph(kana: readonly KanaConcept[], glyph: string): string | undefined {
  return kana.find((item) => item.glyph === glyph)?.id
}

export function kanaIdForAnswer(kana: readonly KanaConcept[], answer: string, script?: KanaConcept['script']): string | undefined {
  const normalized = answer.trim().toLocaleLowerCase()
  return kana.find((item) => item.reviewEligible !== false && (!script || item.script === script) && (item.glyph === answer.trim() || item.romanization.toLocaleLowerCase() === normalized))?.id
}

export function identifyKanaConfusion(kana: readonly KanaConcept[], prompt: string, expectedAnswer: string, selectedAnswer: string): { targetId: string; selectedId: string } | undefined {
  const normalizedAnswer = expectedAnswer.trim().toLocaleLowerCase()
  const candidates = kana.filter((item) => item.reviewEligible !== false && (item.glyph === expectedAnswer.trim() || item.romanization.toLocaleLowerCase() === normalizedAnswer))
  const target = candidates.find((item) => prompt.includes(item.glyph))
    ?? candidates.find((item) => item.script === (/\p{Script=Katakana}/u.test(prompt) ? 'katakana' : 'hiragana'))
  if (!target) return undefined
  const selectedId = kanaIdForAnswer(kana, selectedAnswer, target.script)
  if (!selectedId || selectedId === target.id) return undefined
  return { targetId: target.id, selectedId }
}
