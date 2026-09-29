import type { LearnerProfileId } from "../storage/types.ts";

export const CLOUD_PROFILE_IDS: Readonly<Record<LearnerProfileId, string>> = {
  kevin: "f32a6c14-8d1b-4b70-9a2e-61c5d9037f48",
  janne: "a91e5d27-3c84-46f0-bb12-72d8e4065a39",
};
export const CLOUD_SAVE_SCHEMA_VERSION = 1;
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
}
export type SyncState = "saved" | "saving" | "offline" | "conflict" | "unavailable";
export class CloudSaveConflictError extends Error { constructor() { super("Cloud save revision changed"); this.name = "CloudSaveConflictError"; } }

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
}

export function configuredCloudSave(env: Record<string, string | undefined> = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {}, client?: import("@supabase/supabase-js").SupabaseClient): CloudSaveAdapter | undefined {
  if (client) return new SupabaseCloudSaveAdapter(Promise.resolve(client));
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return undefined;
  return new SupabaseCloudSaveAdapter(import("@supabase/supabase-js").then(({ createClient }) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })));
}
