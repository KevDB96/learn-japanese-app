import type { LearnerProfileId } from "../storage/types.ts";
import { openLocalRepositories } from "../storage/repositories.ts";
import { CLOUD_PROFILE_IDS, CLOUD_SAVE_SCHEMA_VERSION, type CloudSaveDocument, type CloudSavePayload } from "./cloud-save.ts";
import { rebuildSrsState } from "../../features/review/srs.ts";

export const PROFILE_STORES = ["settings", "lessonProgress", "conceptStates", "reviewEvents", "reviewStates", "pendingSync"] as const;
export type ProfileSnapshot = { state: CloudSavePayload; updatedAt?: string; revision: number; schemaVersion: number };
const snapshotKey = (profileId: LearnerProfileId) => `learn-japanese:last-known-good:${profileId}`;
const metadataKey = (profileId: LearnerProfileId) => `learn-japanese:cloud-metadata:${profileId}`;

export async function readProfileSnapshot(profileId: LearnerProfileId): Promise<ProfileSnapshot> {
  const repos = await openLocalRepositories(undefined, profileId);
  try {
    const values = await Promise.all([repos.settings.list(), repos.lessonProgress.list(), repos.conceptStates.list(), repos.reviews.list(), repos.reviews.getStates(), repos.pendingSync.list()]);
    const state = Object.fromEntries(PROFILE_STORES.map((name, index) => {
      if (name === "reviewEvents") return [name, values[index] as readonly Record<string, unknown>[]];
      if (name === "pendingSync") return [name, (values[index] as readonly Record<string, unknown>[]).filter((item) => item.operation !== "review-event")];
      return [name, values[index] as readonly Record<string, unknown>[]];
    }));
    const dateRecords = values.flatMap((items, index): Record<string, unknown>[] => {
      if (index === 3) return [];
      const records = items as Record<string, unknown>[];
      return index === 5 ? records.filter((item) => item.operation !== "review-event") : records;
    });
    const dates = dateRecords.map((value) => Date.parse((value as { updatedAt?: string }).updatedAt ?? "")).filter(Number.isFinite);
    const metadata = JSON.parse(localStorage.getItem(metadataKey(profileId)) ?? "null") as { revision?: number; schemaVersion?: number } | null;
    return { state, updatedAt: dates.length ? new Date(Math.max(...dates)).toISOString() : undefined, revision: metadata?.revision ?? 0, schemaVersion: metadata?.schemaVersion ?? CLOUD_SAVE_SCHEMA_VERSION };
  } finally { repos.close(); }
}

export function validateCloudDocument(value: unknown, profileId: LearnerProfileId): CloudSaveDocument {
  if (!value || typeof value !== "object") throw new TypeError("Invalid cloud save document");
  const doc = value as Partial<CloudSaveDocument>;
  if (doc.profileId !== CLOUD_PROFILE_IDS[profileId]) throw new TypeError("Cloud save belongs to another profile");
  if (!Number.isSafeInteger(doc.revision) || (doc.revision ?? 0) < 1) throw new TypeError("Invalid cloud save revision");
  if (doc.schemaVersion !== CLOUD_SAVE_SCHEMA_VERSION) throw new TypeError("Unsupported cloud save schema");
  if (typeof doc.updatedAt !== "string" || !Number.isFinite(Date.parse(doc.updatedAt))) throw new TypeError("Invalid cloud save timestamp");
  if (!doc.state || typeof doc.state !== "object" || Array.isArray(doc.state)) throw new TypeError("Invalid cloud save state");
  const state = doc.state as Record<string, unknown>;
  if (Object.keys(state).some((key) => !(PROFILE_STORES as readonly string[]).includes(key))) throw new TypeError("Unknown cloud save store");
  for (const name of PROFILE_STORES) {
    const records = state[name] ?? [];
    if (!Array.isArray(records) || records.some((item) => !item || typeof item !== "object" || Array.isArray(item) || typeof (item as { id?: unknown }).id !== "string" || !(item as { id: string }).id || ((item as { profileId?: unknown }).profileId !== undefined && (item as { profileId: unknown }).profileId !== profileId))) throw new TypeError(`Invalid cloud save ${name}`);
  }
  const events = state.reviewEvents as Record<string, unknown>[];
  if (events && events.some((event) => typeof event.conceptId !== "string" || typeof event.cardId !== "string" || typeof event.reviewedAt !== "string" || !Number.isFinite(Date.parse(event.reviewedAt)) || !["again", "hard", "good", "easy"].includes(String(event.rating)) || !["scheduled-review", "practice"].includes(String(event.kind)))) throw new TypeError("Invalid cloud review event");
  const settings = state.settings as Record<string, unknown>[];
  if (settings && settings.some((item) => !Number.isFinite(item.dailyGoal) || !["kana", "romaji"].includes(String(item.preferredReading)))) throw new TypeError("Invalid cloud settings");
  const progress = state.lessonProgress as Record<string, unknown>[];
  if (progress && progress.some((item) => typeof item.lessonId !== "string" || !["not-started", "in-progress", "completed"].includes(String(item.status)))) throw new TypeError("Invalid cloud lesson progress");
  return doc as CloudSaveDocument;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalValue(item)]));
}
const canonical = (value: unknown) => JSON.stringify(canonicalValue(value));
function newest<T extends Record<string, unknown>>(a: T, b: T): T {
  const av = Number(a.recordVersion ?? 0), bv = Number(b.recordVersion ?? 0);
  if (av !== bv) return av > bv ? a : b;
  const at = Date.parse(String(a.updatedAt ?? "")), bt = Date.parse(String(b.updatedAt ?? ""));
  if (at !== bt) return at > bt ? a : b;
  return canonical(a) >= canonical(b) ? a : b;
}
const statusRank = { "not-started": 0, "in-progress": 1, completed: 2 } as const;
const lifecycleRank = { UNSEEN: 0, INTRODUCED: 1, LEARNING: 2, FAMILIAR: 3, MASTERED: 4 } as const;
function mergeById(a: readonly Record<string, unknown>[], b: readonly Record<string, unknown>[], choose: (x: Record<string, unknown>, y: Record<string, unknown>) => Record<string, unknown> = newest) {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of [...a, ...b]) { const prev = map.get(String(item.id)); map.set(String(item.id), prev ? choose(prev, item) : item); }
  return [...map.values()].sort((x, y) => String(x.id).localeCompare(String(y.id)));
}
function mergeEvents(a: readonly Record<string, unknown>[], b: readonly Record<string, unknown>[]) {
  const events = new Map<string, Record<string, unknown>>();
  for (const event of [...a, ...b]) {
    const id = String(event.id), prior = events.get(id);
    if (prior && canonical(prior) !== canonical(event)) throw new TypeError(`Conflicting review event UUID: ${id}`);
    events.set(id, event);
  }
  return [...events.values()].sort((x, y) => String(x.reviewedAt).localeCompare(String(y.reviewedAt)) || String(x.id).localeCompare(String(y.id)));
}

export function mergeProfileSnapshots(local: ProfileSnapshot, cloud: CloudSaveDocument, profileId: LearnerProfileId): ProfileSnapshot {
  const remote = validateCloudDocument(cloud, profileId);
  const localRecords = local.state;
  const remoteRecords = remote.state;
  const reviewEvents = mergeEvents(localRecords.reviewEvents ?? [], remoteRecords.reviewEvents ?? []);
  const states = new Map<string, Record<string, unknown>>();
  for (const state of [...(localRecords.reviewStates ?? []), ...(remoteRecords.reviewStates ?? [])]) states.set(String(state.cardId ?? state.id), state);
  const state: CloudSavePayload = {
    settings: mergeById(localRecords.settings ?? [], remoteRecords.settings ?? []),
    lessonProgress: mergeById(localRecords.lessonProgress ?? [], remoteRecords.lessonProgress ?? [], (a, b) => {
      const ar = statusRank[String(a.status) as keyof typeof statusRank] ?? 0, br = statusRank[String(b.status) as keyof typeof statusRank] ?? 0;
      if (ar !== br) return ar > br ? a : b;
      return newest(a, b);
    }),
    conceptStates: mergeById(localRecords.conceptStates ?? [], remoteRecords.conceptStates ?? [], (a, b) => {
      const ar = lifecycleRank[String(a.lifecycle) as keyof typeof lifecycleRank] ?? 0, br = lifecycleRank[String(b.lifecycle) as keyof typeof lifecycleRank] ?? 0;
      const newer = newest(a, b);
      return { ...newer, lifecycle: ar >= br ? a.lifecycle : b.lifecycle, familiarity: Math.max(Number(a.familiarity ?? 0), Number(b.familiarity ?? 0)), lastReviewedAt: [a.lastReviewedAt, b.lastReviewedAt].filter((v): v is string => typeof v === "string").sort().at(-1) };
    }),
    reviewEvents,
    reviewStates: [...states.values()].sort((a, b) => String(a.cardId ?? a.id).localeCompare(String(b.cardId ?? b.id))),
    pendingSync: mergeById(localRecords.pendingSync ?? [], remoteRecords.pendingSync ?? []),
  };
  const times = [local.updatedAt, remote.updatedAt].filter((v): v is string => !!v);
  return { state, updatedAt: times.sort().at(-1), revision: remote.revision, schemaVersion: CLOUD_SAVE_SCHEMA_VERSION };
}

export function rebuildDerivedReviewStates(events: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const event of events) if (event.kind === "scheduled-review") { const card = String(event.cardId); grouped.set(card, [...(grouped.get(card) ?? []), event]); }
  return [...grouped].flatMap(([cardId, group]) => {
    const event = group[0]!;
    const normalized = group.map((item) => ({ ...item, rating: ({ again: "Forgot", hard: "Hard", good: "Got It", easy: "Easy" } as const)[String(item.rating) as "again" | "hard" | "good" | "easy"] }));
    const srs = rebuildSrsState(normalized as unknown as Parameters<typeof rebuildSrsState>[0], String(event.conceptId), cardId);
    return srs ? [{ id: cardId, recordVersion: 1, updatedAt: srs.lastReviewedAt ?? srs.nextDueAt, conceptId: event.conceptId, cardId, state: srs }] : [];
  });
}

export async function applyMergedProfileSnapshot(profileId: LearnerProfileId, snapshot: ProfileSnapshot): Promise<void> {
  const current = await readProfileSnapshot(profileId);
  localStorage.setItem(snapshotKey(profileId), JSON.stringify(current));
  const derived = rebuildDerivedReviewStates(snapshot.state.reviewEvents ?? []);
  await replaceProfileSnapshot(profileId, { ...snapshot.state, reviewStates: derived });
  saveCloudMetadata(profileId, snapshot.revision, snapshot.schemaVersion);
}

export function saveCloudMetadata(profileId: LearnerProfileId, revision: number, schemaVersion: number): void {
  localStorage.setItem(metadataKey(profileId), JSON.stringify({ revision, schemaVersion }));
}

export async function replaceProfileSnapshot(profileId: LearnerProfileId, payload: CloudSavePayload): Promise<void> {
  const repos = await openLocalRepositories(undefined, profileId);
  try {
    const tx = repos.db.transaction([...PROFILE_STORES], "readwrite");
    for (const name of PROFILE_STORES) {
      const store = tx.objectStore(name);
      if (name === "reviewEvents") continue;
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          if ((cursor.value as { profileId?: string }).profileId === profileId) {
            const value = cursor.value as { id: string; operation?: string };
            if (name === "pendingSync" && value.operation === "review-event") { cursor.continue(); return; }
            cursor.delete();
          }
          cursor.continue(); return;
        }
        const records = payload[name] ?? [];
        for (const raw of records) {
          if (raw.profileId !== undefined && raw.profileId !== profileId) { tx.abort(); return; }
          const record = raw as { id: string };
          if (name === "pendingSync" && (raw as { operation?: string }).operation === "review-event") continue;
          store.put({ ...raw, id: `${profileId}::${record.id}`, profileId });
        }
      };
    }
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new TypeError("Snapshot profile mismatch")); });
  } finally { repos.close(); }
  window.dispatchEvent(new CustomEvent("learn-japanese:state-changed", { detail: { profileId, origin: "restore" } }));
}

export function readLastKnownGood(profileId: LearnerProfileId): ProfileSnapshot | undefined {
  const value = localStorage.getItem(snapshotKey(profileId));
  return value ? JSON.parse(value) as ProfileSnapshot : undefined;
}
