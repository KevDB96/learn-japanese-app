import type { LearnerProfileId } from "../storage/types.ts";
import { PROFILE_SAVE_SCHEMA_VERSION } from "./save-schema.ts";

export const CLOUD_PROFILE_IDS: Readonly<Record<LearnerProfileId, string>> = {
  kevin: "f32a6c14-8d1b-4b70-9a2e-61c5d9037f48",
  janne: "a91e5d27-3c84-46f0-bb12-72d8e4065a39",
};
export const CLOUD_SAVE_SCHEMA_VERSION = PROFILE_SAVE_SCHEMA_VERSION;
export type CloudSavePayload = Readonly<Record<string, readonly Record<string, unknown>[]>>;
export interface CloudSaveDocument {
  profileId: string;
  revision: number;
  schemaVersion: number;
  updatedAt: string;
  state: CloudSavePayload;
}
export interface CloudSaveAdapter {
  read(profileId: string): Promise<CloudSaveDocument | undefined>;
  write(document: CloudSaveDocument, expectedRevision: number): Promise<CloudSaveDocument>;
  writeReviewEvents?(profileId: string, events: readonly Record<string, unknown>[]): Promise<string[]>;
  readReviewEvents?(profileId: string, offset: number, limit: number): Promise<Record<string, unknown>[]>;
}
export type SyncState = "saved" | "saving" | "offline" | "conflict" | "unavailable";
export class CloudSaveConflictError extends Error { constructor() { super("Cloud save revision changed"); this.name = "CloudSaveConflictError"; } }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
}

export function compareSaveMetadata(local: { updatedAt?: string } | undefined, cloud: CloudSaveDocument | undefined): "local-only" | "cloud-only" | "same" | "local-newer" | "cloud-newer" | "conflict" {
  if (!local && !cloud) return "same";
  if (local && !cloud) return "local-only";
  if (!local && cloud) return "cloud-only";
  const localAt = Date.parse(local!.updatedAt ?? "");
  const cloudAt = Date.parse(cloud!.updatedAt);
  if (localAt === cloudAt) return "same";
  if (!Number.isFinite(localAt) || !Number.isFinite(cloudAt)) return "conflict";
  return localAt > cloudAt ? "local-newer" : "cloud-newer";
}

export class SupabaseCloudSaveAdapter implements CloudSaveAdapter {
  constructor(private readonly client: Promise<import("@supabase/supabase-js").SupabaseClient>) {}
  async read(profileId: string) {
    const client = await this.client;
    const { data, error } = await client.from("profile_saves").select("profile_id,revision,schema_version,updated_at,state").eq("profile_id", profileId).maybeSingle();
    if (error) throw error;
    return data ? { profileId: data.profile_id, revision: data.revision, schemaVersion: data.schema_version, updatedAt: data.updated_at, state: data.state as CloudSavePayload } : undefined;
  }
  async write(document: CloudSaveDocument, expectedRevision: number) {
    const client = await this.client;
    const { data, error } = await client.rpc("write_profile_save", {
      p_profile_id: document.profileId, p_expected_revision: expectedRevision,
      p_schema_version: document.schemaVersion, p_updated_at: document.updatedAt, p_state: document.state,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new CloudSaveConflictError();
    return { profileId: row.profile_id, revision: row.revision, schemaVersion: row.schema_version, updatedAt: row.updated_at, state: row.state as CloudSavePayload };
  }
  async writeReviewEvents(profileId: string, events: readonly Record<string, unknown>[]) {
    const client = await this.client;
    if (events.length < 1 || events.length > 50 || new TextEncoder().encode(JSON.stringify(events)).byteLength > 65536) throw new TypeError("Review event batch exceeds cloud limits");
    const rows = events.map((event) => ({ profile_id: profileId, event_id: event.id, reviewed_at: event.reviewedAt, event }));
    const { error: writeError } = await client.from("profile_review_events").upsert(rows, { onConflict: "profile_id,event_id", ignoreDuplicates: true });
    if (writeError) throw writeError;
    const ids = events.map((event) => String(event.id));
    const { data, error } = await client.from("profile_review_events").select("event_id,event").eq("profile_id", profileId).in("event_id", ids);
    if (error) throw error;
    if (!Array.isArray(data)) throw new TypeError("Invalid review event acknowledgement");
    const expected = new Map(events.map((event) => [String(event.id), JSON.stringify(canonical(event))]));
    for (const row of data) if (expected.get(row.event_id) !== JSON.stringify(canonical(row.event))) throw new TypeError(`Conflicting review event UUID: ${row.event_id}`);
    return data.map((row) => row.event_id as string);
  }
  async readReviewEvents(profileId: string, offset: number, limit: number) {
    const client = await this.client;
    const { data, error } = await client.from("profile_review_events").select("event").eq("profile_id", profileId).order("reviewed_at").order("event_id").range(offset, offset + Math.min(100, limit) - 1);
    if (error) throw error;
    if (!Array.isArray(data) || data.some((row) => !row.event || typeof row.event !== "object" || Array.isArray(row.event))) throw new TypeError("Invalid cloud review events");
    return data.map((row) => row.event as Record<string, unknown>);
  }
}

export function configuredCloudSave(env: Record<string, string | undefined> = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {}, client?: import("@supabase/supabase-js").SupabaseClient): CloudSaveAdapter | undefined {
  if (client) return new SupabaseCloudSaveAdapter(Promise.resolve(client));
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return undefined;
  return new SupabaseCloudSaveAdapter(import("@supabase/supabase-js").then(({ createClient }) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })));
}
