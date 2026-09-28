import { useEffect, useState, type FormEvent } from 'react'
import type { AuthAdapter, Identity } from '../../lib/auth/auth'

export function AccountPanel({ auth }: { auth: AuthAdapter }) {
  const [identity, setIdentity] = useState<Identity>(() => auth.current())
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const configured = auth.available

  useEffect(() => auth.subscribe(setIdentity), [auth])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await run('sign-in')
  }

  async function run(mode: 'sign-in' | 'create') {
    setError(''); setMessage(''); setBusy(true)
    try {
      if (mode === 'sign-in') await auth.signIn(email, password)
      else {
        const result = await auth.createAccount(email, password)
        if (result === 'check-email') setMessage('Check your email to finish creating your account.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Account request failed')
    } finally { setBusy(false) }
  }

  if (identity.kind === 'account') return <div className="account-panel">
    <p>Signed in as {identity.email}</p>
    <button type="button" onClick={() => { setError(''); void auth.signOut().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Sign-out failed')) }}>Sign Out</button>
    {error && <p role="alert">{error}</p>}
  </div>

  return <div className="account-panel">
    <p>Guest mode</p>
    {!configured && <p>Account sign-in is unavailable. Your learning stays on this device.</p>}
    {configured && <form onSubmit={(event) => void submit(event)}>
      <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <div className="account-actions">
        <button type="submit" disabled={busy}>Sign In</button>
        <button type="button" disabled={busy || !email || !password} onClick={() => void run('create')}>Create Account</button>
      </div>
    </form>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <button type="button" onClick={() => { setError(''); void auth.signOut().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Sign-out failed')) }}>Continue as Guest</button>
  </div>
}
