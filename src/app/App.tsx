import { useEffect, useState } from 'react'
import { LearnContinue } from '../features/lessons/LearnContinue.tsx'
import { PROFILES, getLastSelectedProfile, profileTheme, rememberProfile } from '../lib/profiles/profiles.ts'
import type { LearnerProfileId } from '../lib/storage/types.ts'
import './app.css'
import { HiraganaProgress } from '../features/progress/HiraganaProgress.tsx'

const destinations = [
  { id: 'learn', label: 'Learn', title: 'Learn Japanese', message: 'Your next lesson will appear here.' },
  { id: 'practice', label: 'Practice', title: 'Practice', message: 'Practice is coming soon.' },
  { id: 'progress', label: 'Progress', title: 'Progress', message: 'Your progress will appear here.' },
] as const

type Destination = (typeof destinations)[number]['id']

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

  return (
    <div className="app-shell" data-theme={profileId ? profileTheme(profileId) : 'kevin'}>
      <header className="app-header">
        <p className="eyebrow">Japanese, one step at a time</p>
        {profileId && <button className="profile-switch" type="button" onClick={() => setProfileId(undefined)}>{PROFILES.find((profile) => profile.id === profileId)?.name} · Switch profile</button>}
      </header>
      {!profileId ? <main id="main-content" className="page-content profile-picker" tabIndex={-1}>
        <section aria-labelledby="page-title"><h1 id="page-title">Choose a profile</h1><div className="profile-options">{PROFILES.map((profile) => <button key={profile.id} type="button" onClick={() => { rememberProfile(profile.id); setProfileId(profile.id) }}>{profile.name}</button>)}</div></section>
      </main> : <>
      <main id="main-content" className="page-content" tabIndex={-1}>
        <section aria-labelledby="page-title">
          <h1 id="page-title">{current.title}</h1>
          {active === 'learn' ? <LearnContinue profileId={profileId} /> : active === 'progress' ? <HiraganaProgress profileId={profileId} /> : <p className="empty-state">{current.message}</p>}
        </section>
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {destinations.map((item) => (
          <button
            className="nav-button"
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-current={active === item.id ? 'page' : undefined}
            onClick={() => navigate(item.id)}
          >
            <span className="nav-indicator" aria-hidden="true">{active === item.id ? '●' : '○'}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      </>}
    </div>
  )
}
