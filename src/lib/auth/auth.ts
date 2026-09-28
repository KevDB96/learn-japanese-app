import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type Identity = { kind: 'guest'; id: string } | { kind: 'account'; id: string; email: string }
export type AuthListener = (identity: Identity) => void

export interface AuthAdapter {
  readonly available: boolean
  current(): Identity
  subscribe(listener: AuthListener): () => void
  signIn(email: string, password: string): Promise<void>
  createAccount(email: string, password: string): Promise<'signed-in' | 'check-email'>
  signOut(): Promise<void>
}

const GUEST_ID_KEY = 'learn-japanese.guest-id'

function getGuestId(storage: Storage): string {
  let id = storage.getItem(GUEST_ID_KEY)
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() ?? `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`
    storage.setItem(GUEST_ID_KEY, id)
  }
  return id
}

export function createGuestIdentity(storage: Storage = localStorage): Identity {
  return { kind: 'guest', id: getGuestId(storage) }
}

export function configuredSupabase(env: Record<string, string | undefined> = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {}) {
  const url = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || env.VITE_SUPABASE_ANON_KEY?.trim()
  return url && key ? { url, key } : undefined
}

export function createAuthAdapter(options: {
  env?: Record<string, string | undefined>
  storage?: Storage
  client?: SupabaseClient
} = {}): AuthAdapter {
  const storage = options.storage ?? localStorage
  const guest = createGuestIdentity(storage)
  const credentials = configuredSupabase(options.env)
  if (!credentials && !options.client) return new GuestAuthAdapter(guest)
  const client = options.client ?? createClient(credentials!.url, credentials!.key)
  return new SupabaseAuthAdapter(client, guest)
}

class GuestAuthAdapter implements AuthAdapter {
  readonly available = false
  private listeners = new Set<AuthListener>()
  constructor(private identity: Identity) {}
  current() { return this.identity }
  subscribe(listener: AuthListener) { this.listeners.add(listener); listener(this.identity); return () => this.listeners.delete(listener) }
  async signIn(_email: string, _password: string) { throw new Error('Account sign-in is not configured') }
  async createAccount(_email: string, _password: string): Promise<'signed-in' | 'check-email'> { throw new Error('Account sign-up is not configured') }
  async signOut() { this.emit(this.identity) }
  private emit(identity: Identity) { this.identity = identity; for (const listener of this.listeners) listener(identity) }
}

class SupabaseAuthAdapter implements AuthAdapter {
  readonly available = true
  private identity: Identity
  private listeners = new Set<AuthListener>()
  constructor(private client: SupabaseClient, private guest: Identity) {
    this.identity = guest
    void client.auth.getSession().then(({ data }) => this.setFromUser(data.session?.user))
    client.auth.onAuthStateChange((_event, session) => this.setFromUser(session?.user))
  }
  current() { return this.identity }
  subscribe(listener: AuthListener) { this.listeners.add(listener); listener(this.identity); return () => this.listeners.delete(listener) }
  async signIn(email: string, password: string) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (!data.user) throw new Error('Sign-in did not return an account')
    this.setFromUser(data.user)
  }
  async createAccount(email: string, password: string) {
    const { data, error } = await this.client.auth.signUp({ email, password })
    if (error) throw error
    if (!data.user) throw new Error('Account creation did not return an account')
    if (!data.session) return 'check-email'
    this.setFromUser(data.user)
    return 'signed-in'
  }
  async signOut() {
    const { error } = await this.client.auth.signOut()
    if (error) throw error
    this.setFromUser(undefined)
  }
  private setFromUser(user?: { id: string; email?: string } | null) {
    this.identity = user ? { kind: 'account', id: user.id, email: user.email ?? '' } : this.guest
    for (const listener of this.listeners) listener(this.identity)
  }
}
