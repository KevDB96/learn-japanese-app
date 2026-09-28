import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createAuthAdapter, type AuthAdapter, type AuthListener, type Identity } from './auth'
import { claimGuestSnapshot, exportGuestSnapshot, type GuestClaimSink } from './guest-migration'
import { openLocalRepositories } from '../storage/repositories'

class FakeAuth implements AuthAdapter {
  available = true
  identity: Identity = { kind: 'guest', id: 'guest-fixed' }
  listeners = new Set<AuthListener>()
  fail = false
  current() { return this.identity }
  subscribe(listener: AuthListener) { this.listeners.add(listener); listener(this.identity); return () => this.listeners.delete(listener) }
  private emit(identity: Identity) { this.identity = identity; this.listeners.forEach((listener) => listener(identity)) }
  async signIn(_email: string, _password: string) { if (this.fail) throw new Error('Invalid credentials'); this.emit({ kind: 'account', id: 'user-1', email: 'learner@example.test' }) }
  async createAccount(_email: string, _password: string) { if (this.fail) throw new Error('Invalid credentials'); this.emit({ kind: 'account', id: 'user-1', email: 'learner@example.test' }); return 'signed-in' as const }
  async signOut() { this.emit({ kind: 'guest', id: 'guest-fixed' }) }
}

describe('auth boundary', () => {
  it('starts with durable guest identity when Supabase values are absent', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } } as unknown as Storage
    const a = createAuthAdapter({ env: {}, storage })
    const firstId = a.current().id
    const b = createAuthAdapter({ env: {}, storage })
    expect(a.current().kind).toBe('guest')
    expect(b.current().id).toBe(firstId)
    expect(a.available).toBe(false)
  })

  it('notifies account transition and returns to the same guest on sign-out', async () => {
    const auth = new FakeAuth()
    const seen: Identity[] = []
    auth.subscribe((identity) => seen.push(identity))
    await auth.signIn('learner@example.test', 'password')
    expect(auth.current().kind).toBe('account')
    await auth.signOut()
    expect(auth.current()).toEqual({ kind: 'guest', id: 'guest-fixed' })
    expect(seen.map((identity) => identity.kind)).toEqual(['guest', 'account', 'guest'])
  })

  it('leaves guest identity intact on a failed sign-in', async () => {
    const auth = new FakeAuth()
    auth.fail = true
    const repos = await openLocalRepositories('auth-failed-signin-test')
    try {
      const progress = { id: 'lesson-kept', lessonId: 'lesson-kept', status: 'in-progress' as const, recordVersion: 1, updatedAt: '2026-01-01T00:00:00Z' }
      await repos.lessonProgress.put(progress)
      await expect(auth.signIn('learner@example.test', 'wrong')).rejects.toThrow('Invalid credentials')
      expect(auth.current()).toEqual({ kind: 'guest', id: 'guest-fixed' })
      expect(await repos.lessonProgress.get('lesson-kept')).toEqual(progress)
    } finally { repos.close() }
  })

  it('exports state and repeats guest claims with one stable idempotency key without deleting local data', async () => {
    const repos = await openLocalRepositories('auth-migration-test')
    try {
      await repos.lessonProgress.put({ id: 'lesson-a', lessonId: 'lesson-a', status: 'in-progress', recordVersion: 1, updatedAt: '2026-01-01T00:00:00Z' })
      const snapshot = await exportGuestSnapshot('guest-fixed', repos)
      const accepted = new Map<string, string>()
      const sink: GuestClaimSink = { async claim({ idempotencyKey, snapshot: data }) { accepted.set(idempotencyKey, JSON.stringify(data)) } }
      await claimGuestSnapshot('user-1', snapshot, sink)
      await claimGuestSnapshot('user-1', snapshot, sink)
      expect(accepted.size).toBe(1)
      expect([...accepted.keys()][0]).toBe('guest-claim:v1:guest-fixed:user-1')
      expect(await repos.lessonProgress.get('lesson-a')).toBeDefined()
    } finally { repos.close() }
  })
})
