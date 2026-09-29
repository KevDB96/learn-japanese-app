import { useEffect, useState } from 'react'
import { kanaFixtures } from '../../content/kana-fixtures.ts'
import { openLocalRepositories } from '../../lib/storage/repositories.ts'
import { deriveHiraganaProgress, type KanaProgress } from './hiragana.ts'
import type { LearnerProfileId } from '../../lib/storage/types.ts'

const names = { unseen: 'Not introduced', introduced: 'Introduced', learning: 'Learning', mastered: 'Mastered', struggling: 'Struggling' } as const

export function HiraganaProgress({ profileId }: { profileId: LearnerProfileId }) {
  const [items, setItems] = useState<KanaProgress[]>([])
  const [selected, setSelected] = useState<KanaProgress>()
  const [error, setError] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    let cancelled = false
    void openLocalRepositories(undefined, profileId).then(async (repos) => {
      try {
        const [concepts, states, events] = await Promise.all([repos.conceptStates.list(), repos.reviews.getStates(), repos.reviews.list()])
        if (!cancelled) setItems(deriveHiraganaProgress(kanaFixtures, concepts, states, events))
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
    <h2>Hiragana</h2>
    <p>Introduced · Learning · Mastered · Struggling</p>
    <ul className="progress-kana-grid">{items.map((item) => <li key={item.concept.id}>
      <button type="button" aria-pressed={selected?.concept.id === item.concept.id} onClick={() => setSelected(item)}>
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
