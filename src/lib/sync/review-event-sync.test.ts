import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { openLocalRepositories } from "../storage/repositories.ts";
import { STORAGE_DATABASE_NAME } from "../storage/types.ts";
import type { CloudSaveAdapter, CloudSaveDocument } from "./cloud-save.ts";
import { REVIEW_EVENT_BATCH_SIZE, syncReviewEventHistory } from "./review-event-sync.ts";

class FakeCloud implements CloudSaveAdapter {
  events = new Map<string, Record<string, unknown>>();
  batches: number[] = [];
  reads = 0;
  partial = true;
  document?: CloudSaveDocument;
  async read(profileId: string) { return this.document?.profileId === profileId ? this.document : undefined; }
  async write(document: CloudSaveDocument, expectedRevision: number) { this.document = { ...document, revision: expectedRevision + 1 }; return this.document; }
  async writeReviewEvents(_profileId: string, events: readonly Record<string, unknown>[]) {
    this.batches.push(events.length);
    const ack: string[] = [];
    events.forEach((event, index) => {
      if (this.partial && index % 2 === 1) return;
      this.events.set(String(event.id), event);
      ack.push(String(event.id));
    });
    this.partial = false;
    return ack;
  }
  async readReviewEvents(_profileId: string, offset: number, limit: number) {
    this.reads++;
    return [...this.events.values()].sort((a, b) => String(a.reviewedAt).localeCompare(String(b.reviewedAt)) || String(a.id).localeCompare(String(b.id))).slice(offset, offset + limit);
  }
}

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(STORAGE_DATABASE_NAME);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
});

describe("append-only review cloud sync", () => {
  it("bounds batches and retries partial acknowledgements without losing UUIDs", async () => {
    const repos = await openLocalRepositories();
    const timestamp = "2026-01-01T00:00:00.000Z";
    for (let index = 0; index < 163; index++) {
      const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      await repos.reviews.append({ id, recordVersion: 1, updatedAt: timestamp, reviewedAt: timestamp, conceptId: `concept-${index}`, cardId: `card-${index}`, rating: "good", kind: "scheduled-review" });
    }
    repos.close();
    const adapter = new FakeCloud();
    const first = await syncReviewEventHistory(adapter, "kevin");
    expect(adapter.batches).toEqual([REVIEW_EVENT_BATCH_SIZE, REVIEW_EVENT_BATCH_SIZE, REVIEW_EVENT_BATCH_SIZE]);
    expect(first.remaining).toBeGreaterThan(0);
    expect(adapter.events.size).toBe(125);
    const second = await syncReviewEventHistory(adapter, "kevin");
    expect(second.remaining).toBe(0);
    expect(adapter.events.size).toBe(163);
    expect(adapter.batches.every((size) => size <= REVIEW_EVENT_BATCH_SIZE)).toBe(true);
    const check = await openLocalRepositories(undefined, "kevin");
    expect(await check.reviews.list()).toHaveLength(163);
    expect(await check.pendingSync.list()).toEqual([]);
    check.close();
  });

  it("uploads local changes without reading remote pages and uploads events arriving mid-pass", async () => {
    const repos = await openLocalRepositories(undefined, "kevin");
    const timestamp = "2026-01-01T00:00:00.000Z";
    const event = (id: string) => ({ id, recordVersion: 1, updatedAt: timestamp, reviewedAt: timestamp, conceptId: id, cardId: id, rating: "good" as const, kind: "scheduled-review" as const });
    await repos.reviews.append(event("00000000-0000-4000-8000-000000000001"));
    repos.close();
    const adapter = new FakeCloud();
    const write = adapter.writeReviewEvents.bind(adapter);
    let addedDuringWrite = false;
    adapter.writeReviewEvents = async (profileId, events) => {
      const ack = await write(profileId, events);
      if (!addedDuringWrite) {
        addedDuringWrite = true;
        const during = await openLocalRepositories(undefined, "kevin");
        await during.reviews.append(event("00000000-0000-4000-8000-000000000002"));
        during.close();
      }
      return ack;
    };
    const result = await syncReviewEventHistory(adapter, "kevin", false);
    expect(result.remaining).toBe(0);
    expect(adapter.events.size).toBe(2);
    expect(adapter.reads).toBe(0);
    await syncReviewEventHistory(adapter, "kevin");
    expect(adapter.reads).toBe(1);
  });
});
