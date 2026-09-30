import type { LearnerProfileId, ReviewEvent } from "../storage/types.ts";
import { openLocalRepositories } from "../storage/repositories.ts";
import { CLOUD_PROFILE_IDS, type CloudSaveAdapter } from "./cloud-save.ts";

export const REVIEW_EVENT_BATCH_SIZE = 50;
const MAX_UPLOAD_BATCHES_PER_PASS = 3;
const REMOTE_PAGE_SIZE = 100;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
}

function validEvent(value: Record<string, unknown>): value is Record<string, unknown> & ReviewEvent {
  return typeof value.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)
    && typeof value.conceptId === "string" && typeof value.cardId === "string"
    && typeof value.reviewedAt === "string" && Number.isFinite(Date.parse(value.reviewedAt))
    && ["again", "hard", "good", "easy"].includes(String(value.rating))
    && ["scheduled-review", "practice"].includes(String(value.kind));
}

/** Flushes a bounded outbox slice, then downloads the append-only cloud history in bounded pages. */
export async function syncReviewEventHistory(adapter: CloudSaveAdapter, profileId: LearnerProfileId): Promise<{ remaining: number }> {
  if (!adapter.writeReviewEvents || !adapter.readReviewEvents) return { remaining: 0 };
  const repos = await openLocalRepositories(undefined, profileId);
  try {
    let pending = (await repos.pendingSync.list()).filter((item) => item.operation === "review-event");
    let batches = 0;
    while (pending.length && batches < MAX_UPLOAD_BATCHES_PER_PASS) {
      const batch = pending.slice(0, REVIEW_EVENT_BATCH_SIZE);
      const events = batch.map((item) => item.payload as Record<string, unknown>);
      if (events.some((event) => !validEvent(event))) throw new TypeError("Invalid pending review event");
      const acknowledged = new Set(await adapter.writeReviewEvents(CLOUD_PROFILE_IDS[profileId], events));
      for (const item of batch) if (acknowledged.has(item.entityId)) await repos.pendingSync.delete(item.id);
      pending = (await repos.pendingSync.list()).filter((item) => item.operation === "review-event");
      batches++;
      if (acknowledged.size === 0) break;
    }

    for (let offset = 0; ; offset += REMOTE_PAGE_SIZE) {
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
    return { remaining: pending.length };
  } finally { repos.close(); }
}
