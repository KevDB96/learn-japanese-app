import { grammarFixtures } from '../../content/grammar-fixtures.ts'
import { kanaFixtures, katakanaFixtures } from '../../content/kana-fixtures.ts'
import { phraseFixtures } from '../../content/phrase-fixtures.ts'
import { vocabularyFixtures } from '../../content/vocabulary-fixtures.ts'
import { contentCatalog } from '../../lib/content/catalog.ts'
import type { ConceptState, LessonProgress, ReviewEvent } from '../../lib/storage/types.ts'
import { selectWeakConcepts } from '../review/weakness.ts'
import { deriveKanaMastery } from './hiragana.ts'

export interface ProgressSummary {
  course: { completed: number; total: number }
  kana: { mastered: number; total: number }
  vocabulary: { learned: number; total: number }
  grammar: { learned: number; total: number }
  weakAreas: string[]
  activity: { event: ReviewEvent; label: string }[]
}

export function deriveProgressSummary(input: {
  lessons: readonly LessonProgress[]
  concepts: readonly ConceptState[]
  states: readonly { conceptId: string; state: import('../review/srs.ts').SrsState }[]
  events: readonly ReviewEvent[]
  now: number
}): ProgressSummary {
  const completed = new Set(input.lessons.filter((item) => item.status === 'completed').map((item) => item.lessonId))
  const courseLessons = contentCatalog.courses.flatMap((course) => {
    const units = new Map(contentCatalog.units.map((unit) => [unit.id, unit]))
    return course.unitIds.flatMap((id) => units.get(id)?.lessonIds ?? [])
  })
  const conceptIds = new Set(input.concepts.map((item) => item.conceptId))
  const stateByConcept = new Map<string, typeof input.states>()
  for (const state of input.states) stateByConcept.set(state.conceptId, [...(stateByConcept.get(state.conceptId) ?? []), state])
  const kana = [...kanaFixtures, ...katakanaFixtures].filter((item) => item.reviewEligible !== false && item.form === 'base')
  const masteredKana = kana.filter((item) => deriveKanaMastery(item.id, stateByConcept.get(item.id)?.map((state) => state.state), input.concepts.find((concept) => concept.conceptId === item.id)) === 'mastered').length
  const learnedCount = (ids: readonly string[]) => ids.filter((id) => conceptIds.has(id)).length
  const names = new Map<string, string>([
    ...contentCatalog.concepts.map((item) => [item.id, item.display] as [string, string]),
    ...vocabularyFixtures.map((item) => [item.id, `${item.written} · ${item.meanings[0]}`] as [string, string]),
    ...grammarFixtures.map((item) => [item.id, item.display] as [string, string]),
    ...phraseFixtures.map((item) => [item.id, item.meaning] as [string, string]),
    ...kana.map((item) => [item.id, `${item.glyph} (${item.romanization})`] as [string, string]),
  ])
  return {
    course: { completed: courseLessons.filter((id) => completed.has(id)).length, total: courseLessons.length },
    kana: { mastered: masteredKana, total: kana.length },
    vocabulary: { learned: learnedCount(vocabularyFixtures.map((item) => item.id)), total: vocabularyFixtures.length },
    grammar: { learned: learnedCount(grammarFixtures.map((item) => item.id)), total: grammarFixtures.length },
    weakAreas: selectWeakConcepts(input.events, input.now).slice(0, 3).map((item) => names.get(item.conceptId) ?? 'Learning concept'),
    activity: input.events.slice().sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt) || b.id.localeCompare(a.id)).slice(0, 5)
      .map((event) => ({ event, label: names.get(event.conceptId) ?? 'Learning activity' })),
  }
}
