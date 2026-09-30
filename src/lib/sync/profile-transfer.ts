import type { LearnerProfileId } from "../storage/types.ts";
import { openLocalRepositories } from "../storage/repositories.ts";
import { PROFILE_STORES, readProfileSnapshot, rebuildDerivedReviewStates, type ProfileSnapshot } from "./profile-snapshot.ts";

export const PROFILE_EXPORT_SCHEMA_VERSION = 1;
const BACKUP_STORES = PROFILE_STORES;
const backupKey = (profileId: LearnerProfileId) => `learn-japanese:pre-import:${profileId}`;

export interface ProfileExport {
  format: "learn-japanese-profile";
  schemaVersion: number;
  exportedAt: string;
  profile: { id: LearnerProfileId; displayName: string };
  summary: { lessonCount: number; completedLessonCount: number; reviewEventCount: number; conceptCount: number };
  state: ProfileSnapshot["state"];
}

const forbiddenKey = /(?:secret|password|credential|supabase|api.?key|access.?token|device.?id|device.?secret)/i;
function assertSafeJson(value: unknown, path = "file"): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) { value.forEach((item, index) => assertSafeJson(item, `${path}[${index}]`)); return; }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenKey.test(key)) throw new TypeError(`Unsupported sensitive field at ${path}.${key}`);
    assertSafeJson(item, `${path}.${key}`);
  }
}

export async function exportProfile(profileId: LearnerProfileId, displayName: string, now = new Date()): Promise<ProfileExport> {
  const snapshot = await readProfileSnapshot(profileId);
  const state = Object.fromEntries(BACKUP_STORES.map((name) => [name, (snapshot.state[name] ?? []).map((record) => {
    const { profileId: _profileId, ...portable } = record;
    return portable;
  })])) as ProfileSnapshot["state"];
  assertSafeJson(state);
  const progress = state.lessonProgress ?? [];
  return {
    format: "learn-japanese-profile", schemaVersion: PROFILE_EXPORT_SCHEMA_VERSION, exportedAt: now.toISOString(),
    profile: { id: profileId, displayName },
    summary: { lessonCount: progress.length, completedLessonCount: progress.filter((record) => record.status === "completed").length, reviewEventCount: (state.reviewEvents ?? []).length, conceptCount: (state.conceptStates ?? []).length },
    state,
  };
}

function validTimestamp(value: unknown) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
export function validateProfileExport(value: unknown, profileId: LearnerProfileId): ProfileExport {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid profile file");
  assertSafeJson(value);
  const doc = value as Partial<ProfileExport>;
  if (doc.format !== "learn-japanese-profile") throw new TypeError("Unrecognized profile file");
  if (doc.schemaVersion !== PROFILE_EXPORT_SCHEMA_VERSION) throw new TypeError("Unsupported profile file version");
  if (doc.profile?.id !== profileId) throw new TypeError(`This file belongs to ${doc.profile?.displayName ?? "another profile"}`);
  const expectedName = profileId === "kevin" ? "Kevin" : "Janne";
  if (doc.profile.displayName !== expectedName || !validTimestamp(doc.exportedAt)) throw new TypeError("Invalid profile metadata");
  const state = doc.state as Record<string, unknown> | undefined;
  if (!state || typeof state !== "object" || Array.isArray(state) || Object.keys(state).some((key) => !(BACKUP_STORES as readonly string[]).includes(key)) || BACKUP_STORES.some((name) => !Object.hasOwn(state, name))) throw new TypeError("Invalid learning state");
  for (const name of BACKUP_STORES) {
    const records = state[name] ?? [];
    if (!Array.isArray(records)) throw new TypeError(`Invalid ${name}`);
    const ids = new Set<string>();
    for (const item of records) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError(`Invalid ${name} record`);
      const record = item as Record<string, unknown>;
      if (typeof record.id !== "string" || !record.id || ids.has(record.id) || !Number.isSafeInteger(record.recordVersion) || Number(record.recordVersion) < 1 || !validTimestamp(record.updatedAt)) throw new TypeError(`Invalid ${name} record`);
      ids.add(record.id);
      if (record.profileId !== undefined && record.profileId !== profileId) throw new TypeError("Learning state belongs to another profile");
      if (name === "settings" && (!Number.isFinite(record.dailyGoal) || !["kana", "romaji"].includes(String(record.preferredReading)))) throw new TypeError("Invalid settings");
      if (name === "lessonProgress" && (typeof record.lessonId !== "string" || !["not-started", "in-progress", "completed"].includes(String(record.status)))) throw new TypeError("Invalid lesson progress");
      if (name === "conceptStates" && (typeof record.conceptId !== "string" || !Number.isFinite(record.familiarity))) throw new TypeError("Invalid concept state");
      if (name === "reviewEvents" && (typeof record.conceptId !== "string" || typeof record.cardId !== "string" || !validTimestamp(record.reviewedAt) || !["again", "hard", "good", "easy"].includes(String(record.rating)) || !["scheduled-review", "practice"].includes(String(record.kind)))) throw new TypeError("Invalid review event");
    }
  }
  const summary = doc.summary;
  if (!summary || !Number.isSafeInteger(summary.lessonCount) || !Number.isSafeInteger(summary.completedLessonCount) || !Number.isSafeInteger(summary.reviewEventCount) || !Number.isSafeInteger(summary.conceptCount)) throw new TypeError("Invalid profile summary");
  const lessons = state.lessonProgress as Record<string, unknown>[] | undefined ?? [];
  if (summary.lessonCount !== lessons.length || summary.completedLessonCount !== lessons.filter((record) => record.status === "completed").length || summary.reviewEventCount !== (state.reviewEvents as unknown[] | undefined ?? []).length || summary.conceptCount !== (state.conceptStates as unknown[] | undefined ?? []).length) throw new TypeError("Profile summary does not match learning state");
  return doc as ProfileExport;
}

export async function importProfile(value: unknown, profileId: LearnerProfileId): Promise<void> {
  const doc = validateProfileExport(value, profileId);
  const current = await readProfileSnapshot(profileId);
  // Snapshot persistence completes before the IndexedDB transaction can mutate the profile.
  localStorage.setItem(backupKey(profileId), JSON.stringify({ ...current, backupCreatedAt: new Date().toISOString() }));
  const state = { ...doc.state, reviewStates: rebuildDerivedReviewStates(doc.state.reviewEvents ?? []) } as ProfileSnapshot["state"];
  const repos = await openLocalRepositories(undefined, profileId);
  try {
    const tx = repos.db.transaction([...BACKUP_STORES], "readwrite");
    for (const name of BACKUP_STORES) {
      const store = tx.objectStore(name);
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (item) {
          if ((item.value as { profileId?: string }).profileId === profileId) item.delete();
          item.continue();
          return;
        }
        for (const record of state[name] ?? []) {
          if (record.profileId !== undefined && record.profileId !== profileId) { tx.abort(); return; }
          store.put({ ...record, id: `${profileId}::${record.id}`, profileId });
        }
      };
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Profile import failed"));
      tx.onabort = () => reject(tx.error ?? new Error("Profile import was rolled back"));
    });
    const events = await repos.reviews.list();
    const sync = repos.db.transaction("pendingSync", "readwrite");
    const pending = sync.objectStore("pendingSync");
    const cursor = pending.openCursor();
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (item) {
        if ((item.value as { profileId?: string; operation?: string }).profileId === profileId && (item.value as { operation?: string }).operation === "review-event") item.delete();
        item.continue(); return;
      }
      for (const event of events) pending.put({ id: `${profileId}::review-event::${event.id}`, profileId, recordVersion: 1, updatedAt: event.reviewedAt, operation: "review-event", entityId: event.id, payload: { ...event, profileId } });
    };
    await new Promise<void>((resolve, reject) => { sync.oncomplete = () => resolve(); sync.onerror = () => reject(sync.error ?? new Error("Profile review queue failed")); sync.onabort = () => reject(sync.error ?? new Error("Profile review queue aborted")); });
  } finally { repos.close(); }
  window.dispatchEvent(new CustomEvent("learn-japanese:state-changed", { detail: { profileId, origin: "restore" } }));
}

export function readPreImportBackup(profileId: LearnerProfileId): ProfileSnapshot | undefined {
  const serialized = localStorage.getItem(backupKey(profileId));
  if (!serialized) return undefined;
  const value = JSON.parse(serialized) as ProfileSnapshot & { backupCreatedAt?: string };
  return value;
}
