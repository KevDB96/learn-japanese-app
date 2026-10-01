import type { LearnerProfileId, ReviewEvent } from "../storage/types.ts";
import { openLocalRepositories } from "../storage/repositories.ts";
import { CLOUD_PROFILE_IDS, type CloudSaveAdapter } from "./cloud-save.ts";

export const REVIEW_EVENT_BATCH_SIZE = 50;
const MAX_UPLOAD_BATCHES_PER_PASS = 3;
const REMOTE_PAGE_SIZE = 100;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

function stableDeviceId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function getDeviceId(repos: Awaited<ReturnType<typeof openLocalRepositories>>): Promise<string> {
  const metadata = await repos.deviceMetadata.get("device");
  if (metadata?.deviceId) return metadata.deviceId;
  const now = new Date().toISOString();
  const deviceId = stableDeviceId();
  await repos.deviceMetadata.put({ id: "device", deviceId, registeredAt: now, updatedAt: now, recordVersion: 1 });
  return deviceId;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => key !== "originDeviceId").sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
}

function validEvent(value: Record<string, unknown>): value is Record<string, unknown> & ReviewEvent {
  return typeof value.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)
    && typeof value.conceptId === "string" && typeof value.cardId === "string"
    && typeof value.reviewedAt === "string" && Number.isFinite(Date.parse(value.reviewedAt))
    && ["again", "hard", "good", "easy"].includes(String(value.rating))
    && ["scheduled-review", "practice"].includes(String(value.kind));
}

/** Flushes a bounded outbox slice and optionally reconciles the append-only cloud history. */
export async function syncReviewEventHistory(adapter: CloudSaveAdapter, profileId: LearnerProfileId, reconcile = true, databaseName?: string): Promise<{ remaining: number }> {
  if (!adapter.writeReviewEvents || (reconcile && !adapter.readReviewEvents)) return { remaining: 0 };
  const repos = await openLocalRepositories(databaseName, profileId);
  try {
    const deviceId = await getDeviceId(repos);
    const now = Date.now();
    let pending = (await repos.pendingSync.list()).filter((item) => item.operation === "review-event" && (!item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= now));
    let batches = 0;
    while (pending.length && batches < MAX_UPLOAD_BATCHES_PER_PASS) {
      const batch = pending.slice(0, REVIEW_EVENT_BATCH_SIZE);
      const events = batch.map((item) => ({ ...item.payload, originDeviceId: deviceId }));
      if (events.some((event) => !validEvent(event))) throw new TypeError("Invalid pending review event");
      let acknowledged: Set<string>;
      try {
        acknowledged = new Set(await adapter.writeReviewEvents(CLOUD_PROFILE_IDS[profileId], events));
      } catch (error) {
        const attemptedAt = Date.now();
        for (const item of batch) {
          const attempts = (item.attempts ?? 0) + 1;
          const delay = Math.min(1000 * 2 ** Math.min(attempts - 1, 16), MAX_RETRY_DELAY_MS);
          await repos.pendingSync.put({ ...item, attempts, lastAttemptAt: new Date(attemptedAt).toISOString(), nextAttemptAt: new Date(attemptedAt + delay).toISOString() });
        }
        if (error instanceof TypeError) throw error;
        break;
      }
      for (const item of batch) if (acknowledged.has(item.entityId)) await repos.pendingSync.delete(item.id);
      pending = (await repos.pendingSync.list()).filter((item) => item.operation === "review-event");
      batches++;
      if (acknowledged.size === 0) break;
    }

    if (reconcile && adapter.readReviewEvents) for (let offset = 0; ; offset += REMOTE_PAGE_SIZE) {
      const page = await adapter.readReviewEvents(CLOUD_PROFILE_IDS[profileId], offset, REMOTE_PAGE_SIZE);
      for (const raw of page) {
        const event = raw as Record<string, unknown>;
        if (!validEvent(event)) throw new TypeError("Invalid cloud review event");
        const existing = await repos.reviews.get(event.id);
        if (!existing) await repos.reviews.append(event, false);
        else if (JSON.stringify(canonical(existing)) !== JSON.stringify(canonical(event))) throw new TypeError(`Conflicting review event UUID: ${event.id}`);
      }
      if (page.length < REMOTE_PAGE_SIZE) break;
    }
    const remaining = (await repos.pendingSync.list()).filter((item) => item.operation === "review-event").length;
    return { remaining };
  } finally { repos.close(); }
}

/** Release review events from a delayed retry without deleting their durable outbox records. */
export async function retryPendingReviewEvents(profileId: LearnerProfileId, databaseName?: string): Promise<number> {
  const repos = await openLocalRepositories(databaseName, profileId);
  try {
    let released = 0;
    for (const item of await repos.pendingSync.list()) if (item.operation === "review-event" && item.nextAttemptAt) {
      const { nextAttemptAt: _nextAttemptAt, ...rest } = item;
      await repos.pendingSync.put(rest);
      released++;
    }
    return released;
  } finally { repos.close(); }
}
