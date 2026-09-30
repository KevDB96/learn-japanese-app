import { useEffect, useState } from 'react'
import { LearnContinue } from '../features/lessons/LearnContinue.tsx'
import { PROFILES, getLastSelectedProfile, profileTheme, rememberProfile } from '../lib/profiles/profiles.ts'
import type { LearnerProfileId } from '../lib/storage/types.ts'
import './app.css'
import { HiraganaProgress } from '../features/progress/HiraganaProgress.tsx'
import { CloudSavePanel } from '../features/sync/CloudSavePanel.tsx'
import { ProfileTransferPanel } from '../features/sync/ProfileTransferPanel.tsx'
import { MixedKanaPractice } from '../features/practice/MixedKanaPractice.tsx'
import { PlacementEntry } from '../features/placement/PlacementEntry.tsx'

const destinations = [
  { id: 'learn', label: 'Learn', title: 'Learn Japanese' },
  { id: 'practice', label: 'Practice', title: 'Practice' },
  { id: 'progress', label: 'Progress', title: 'Progress' },
  { id: 'more', label: 'More', title: 'More' },
] as const

type Destination = (typeof destinations)[number]['id']
const asset = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`

function destinationFromHash(): Destination {
  const id = window.location.hash.slice(1)
  return destinations.some((item) => item.id === id) ? (id as Destination) : 'learn'
}

export function App() {
  const [active, setActive] = useState<Destination>(destinationFromHash)
  const [profileId, setProfileId] = useState<LearnerProfileId | undefined>(() => getLastSelectedProfile())

  useEffect(() => {
    const restore = () => setActive(destinationFromHash())
    window.addEventListener('hashchange', restore)
    return () => window.removeEventListener('hashchange', restore)
  }, [])

  function navigate(id: Destination) {
    setActive(id)
    window.history.replaceState(null, '', `#${id}`)
  }

  const current = destinations.find((item) => item.id === active)!
  const profile = PROFILES.find((item) => item.id === profileId)

  return (
    <div className="app-shell" data-theme={profileId ? profileTheme(profileId) : 'kevin'}>
      <header className="app-header">
        <a className="brand-mark" href="#learn" onClick={() => navigate('learn')} aria-label="Japanese Garden home">
          <span aria-hidden="true">あ</span><span>Japanese Garden</span>
        </a>
        {profile && <button className="profile-switch" type="button" aria-label={`Switch profile from ${profile.name}`} onClick={() => setProfileId(undefined)}>
          <img src={asset(`avatars/${profile.id}.webp`)} alt="" />{profile.name}<span aria-hidden="true">⌄</span>
        </button>}
      </header>
      {!profileId ? <main id="main-content" className="page-content profile-picker" tabIndex={-1}>
        <section aria-labelledby="page-title" className="picker-content">
          <p className="eyebrow">A little Japanese, every day</p>
          <h1 id="page-title">Choose a profile</h1>
          <p className="picker-intro">Choose your garden to continue.</p>
          <div className="profile-options">{PROFILES.map((item) => <button className={`profile-card profile-card-${item.id}`} key={item.id} type="button" onClick={() => { rememberProfile(item.id); setProfileId(item.id) }}>
            <img src={asset(`avatars/${item.id}.webp`)} alt="" />
            <span className="profile-card-copy"><strong>{item.name}</strong><span>{item.id === 'kevin' ? 'Moonlit sakura garden' : 'Faerie blossom garden'}</span></span>
            <span className="profile-arrow" aria-hidden="true">→</span>
          </button>)}</div>
        </section>
      </main> : <>
        <main id="main-content" className={`page-content page-${active}`} tabIndex={-1}>
          <section aria-labelledby="page-title">
            <p className="eyebrow page-eyebrow">{active === 'learn' ? 'Your learning path' : profile?.name + '’s garden'}</p>
            <h1 id="page-title">{current.title}</h1>
            {active === 'learn' && <LearnHome profileId={profileId} />}
            {active === 'practice' && <PracticeHome profileId={profileId} onProgress={() => navigate('progress')} />}
            {active === 'progress' && <HiraganaProgress profileId={profileId} />}
            {active === 'more' && <MoreHome profileId={profileId} onProgress={() => navigate('progress')} />}
          </section>
        </main>
        <nav className="bottom-nav" aria-label="Main navigation">
          {destinations.map((item, index) => (
            <button className="nav-button" key={item.id} type="button" aria-label={item.label} aria-current={active === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>
              <span className="nav-icon" aria-hidden="true">{['◒', '✳', '▥', '⋯'][index]}</span><span>{item.label}</span>
            </button>
          ))}
        </nav>
      </>}
    </div>
  )
}

function LearnHome({ profileId }: { profileId: LearnerProfileId }) {
  return <div className="home-stack">
    <PlacementEntry profileId={profileId} />
    <section className="course-card featured-course" aria-label="Hiragana course">
      <img className="course-art" src={asset(`courses/${profileId}/hiragana.webp`)} alt="" />
      <div className="course-content"><span className="course-kicker">YOUR FIRST COURSE</span><h2>Hiragana</h2><p>Read the sounds and symbols of Japanese.</p><span className="course-status"><span className="status-dot" /> Ready to learn</span></div>
      <img className="course-status-art" src={asset(`status/learning-${profileId}.webp`)} alt="" />
    </section>
    <LearnContinue profileId={profileId} />
    <img className="garden-motif learn-motif" src={asset(profileId === 'kevin' ? 'motifs/spirit-cat.webp' : 'motifs/faerie.webp')} alt="" />
  </div>
}

function PracticeHome({ profileId, onProgress }: { profileId: LearnerProfileId; onProgress: () => void }) {
  return <div className="practice-stack">
    <p className="section-lead">Strengthen what you’ve already learned.</p>
    <section className="activity-card">
      <img src={asset(`activities/practice-${profileId}.webp`)} alt="" />
      <div><span className="course-kicker">HIRAGANA</span><h2>Kana practice</h2><p>Choose a character from your progress to practise it again.</p><button className="secondary-action" type="button" onClick={onProgress}>Choose characters</button></div>
    </section>
    <MixedKanaPractice profileId={profileId} />
    <section className="activity-card activity-card-listening">
      <img src={asset(`activities/listening-${profileId}.webp`)} alt="" />
      <div><span className="course-kicker">LISTENING</span><h2>Sound practice</h2><p>Listening activities will appear as they’re added to your course.</p><span className="coming-soon">Coming soon</span></div>
    </section>
    <img className="garden-motif practice-motif" src={asset(profileId === 'kevin' ? 'motifs/sakura-book.webp' : 'motifs/joyful-cat.webp')} alt="" />
  </div>
}

function MoreHome({ profileId, onProgress }: { profileId: LearnerProfileId; onProgress: () => void }) {
  return <div className="more-stack">
    <section className="more-profile-card"><img src={asset(`avatars/${profileId}.webp`)} alt="" /><div><span className="course-kicker">LEARNER PROFILE</span><h2>{profileId === 'kevin' ? 'Kevin' : 'Janne'}</h2><p>Progress is saved on this device.</p></div></section>
    <button className="more-link" type="button" onClick={onProgress}><span className="more-link-icon" aria-hidden="true">▥</span><span><strong>Your progress</strong><small>Review the hiragana you’ve learned</small></span><span aria-hidden="true">→</span></button>
    <CloudSavePanel profileId={profileId} />
    <ProfileTransferPanel profileId={profileId} />
    <img className="garden-motif more-motif" src={asset(profileId === 'kevin' ? 'motifs/joyful-cat.webp' : 'motifs/faerie.webp')} alt="" />
  </div>
}
