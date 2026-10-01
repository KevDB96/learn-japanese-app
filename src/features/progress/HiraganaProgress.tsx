import { useEffect, useState } from 'react'
import { kanaFixtures } from '../../content/kana-fixtures.ts'
import { openLocalRepositories } from '../../lib/storage/repositories.ts'
import { deriveHiraganaProgress, type KanaProgress } from './hiragana.ts'
import type { LearnerProfileId } from '../../lib/storage/types.ts'
import { deriveProgressSummary, type ProgressSummary } from './summary.ts'

const names = { unseen: 'Not introduced', introduced: 'Introduced', learning: 'Learning', mastered: 'Mastered', struggling: 'Struggling' } as const

export function HiraganaProgress({ profileId }: { profileId: LearnerProfileId }) {
  const [items, setItems] = useState<KanaProgress[]>([])
  const [selected, setSelected] = useState<KanaProgress>()
  const [error, setError] = useState(false)
  const [saved, setSaved] = useState(false)
  const [summary, setSummary] = useState<ProgressSummary>()
  useEffect(() => {
    let cancelled = false
    void openLocalRepositories(undefined, profileId).then(async (repos) => {
      try {
        const [lessons, concepts, states, events] = await Promise.all([repos.lessonProgress.list(), repos.conceptStates.list(), repos.reviews.getStates(), repos.reviews.list()])
        if (!cancelled) {
          setItems(deriveHiraganaProgress(kanaFixtures, concepts, states, events))
          setSummary(deriveProgressSummary({ lessons, concepts, states, events, now: Date.now() }))
        }
      } catch { if (!cancelled) setError(true) } finally { repos.close() }
    }).catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [saved, profileId])
  const practice = async (item: KanaProgress) => {
    const repos = await openLocalRepositories(undefined, profileId)
    try {
      const reviewedAt = new Date().toISOString()
      await repos.reviews.record({ id: `practice-${crypto.randomUUID()}`, conceptId: item.concept.id, cardId: item.concept.id, rating: 'Got It', reviewedAt, kind: 'practice' })
      setSaved((value) => !value)
    } finally { repos.close() }
  }
  if (error) return <p role="status">Progress is unavailable.</p>
  return <div className="hiragana-progress">
    {summary && <section className="progress-overview" aria-label="Learning overview">
      <h2>Your progress</h2>
      <div className="progress-metrics">
        <article><span>Course</span><strong>{summary.course.completed} / {summary.course.total}</strong><small>lessons complete</small></article>
        <article><span>Kana mastered</span><strong>{summary.kana.mastered} / {summary.kana.total}</strong><small>hiragana + katakana</small></article>
        <article><span>Vocabulary</span><strong>{summary.vocabulary.learned} / {summary.vocabulary.total}</strong><small>introduced</small></article>
        <article><span>Grammar</span><strong>{summary.grammar.learned} / {summary.grammar.total}</strong><small>introduced</small></article>
      </div>
      <div className="progress-lists">
        <section aria-labelledby="weak-areas-heading"><h3 id="weak-areas-heading">Needs practice</h3>
          {summary.weakAreas.length ? <ul>{summary.weakAreas.map((name) => <li key={name}>{name}</li>)}</ul> : <p>No weak areas right now</p>}
        </section>
        <section aria-labelledby="recent-activity-heading"><h3 id="recent-activity-heading">Recent activity</h3>
          {summary.activity.length ? <ul>{summary.activity.map(({ event, label }) => <li key={event.id}><span>{event.kind === 'scheduled-review' ? 'Review' : 'Practice'} · {label}</span><time dateTime={event.reviewedAt}>{new Date(event.reviewedAt).toLocaleDateString()}</time></li>)}</ul> : <p>No activity yet</p>}
        </section>
      </div>
    </section>}
    <h2>Hiragana</h2>
    <p>Introduced · Learning · Mastered · Struggling</p>
    <ul className="progress-kana-grid">{items.map((item) => <li key={item.concept.id}>
      <button type="button" aria-label={`${item.concept.glyph}, ${item.concept.romanization}, ${names[item.state]}. View details`} aria-pressed={selected?.concept.id === item.concept.id} onClick={() => setSelected(item)}>
        <span lang="ja">{item.concept.glyph}</span><span lang="ja-Latn">{item.concept.romanization}</span><span>{names[item.state]}</span>
      </button>
    </li>)}</ul>
    {selected && <section className="kana-progress-detail" aria-live="polite">
      <h3><span lang="ja">{selected.concept.glyph}</span> {selected.concept.romanization}</h3>
      <p>{names[selected.state]} · {selected.reason}</p>
      <button type="button" onClick={() => void practice(selected)}>Practice</button>
    </section>}
  </div>
}
