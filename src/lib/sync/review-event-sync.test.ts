import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { openLocalRepositories } from "../storage/repositories.ts";
import { STORAGE_DATABASE_NAME } from "../storage/types.ts";
import type { CloudSaveAdapter, CloudSaveDocument } from "./cloud-save.ts";
import { REVIEW_EVENT_BATCH_SIZE, retryPendingReviewEvents, syncReviewEventHistory } from "./review-event-sync.ts";

class FakeCloud implements CloudSaveAdapter {
  events = new Map<string, Record<string, unknown>>();
  batches: number[] = [];
  reads = 0;
  partial = true;
  document?: CloudSaveDocument;
  async read(profileId: string) { return this.document?.profileId === profileId ? this.document : undefined; }
  async write(document: CloudSaveDocument, expectedRevision: number) { this.document = { ...document, revision: expectedRevision + 1 }; return this.document; }
  async writeReviewEvents(profileId: string, events: readonly Record<string, unknown>[]) {
    this.batches.push(events.length);
    const ack: string[] = [];
    events.forEach((event, index) => {
      if (this.partial && index % 2 === 1) return;
      this.events.set(`${profileId}:${String(event.id)}`, event);
      ack.push(String(event.id));
    });
    this.partial = false;
    return ack;
  }
  async readReviewEvents(profileId: string, offset: number, limit: number) {
    this.reads++;
    return [...this.events.entries()].filter(([key]) => key.startsWith(`${profileId}:`)).map(([, event]) => event).sort((a, b) => String(a.reviewedAt).localeCompare(String(b.reviewedAt)) || String(a.id).localeCompare(String(b.id))).slice(offset, offset + limit);
  }
}

afterEach(async () => {
  for (const name of [STORAGE_DATABASE_NAME, "jla-device-a", "jla-device-b"]) await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
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

  it("persists device origin and retry state, then recovers a stuck operation without deleting it", async () => {
    const repos = await openLocalRepositories(undefined, "kevin");
    const timestamp = "2026-01-01T00:00:00.000Z";
    const event = { id: "00000000-0000-4000-8000-000000000003", recordVersion: 1, updatedAt: timestamp, reviewedAt: timestamp, conceptId: "c", cardId: "c", rating: "good" as const, kind: "scheduled-review" as const };
    await repos.reviews.append(event);
    repos.close();
    const adapter = new FakeCloud();
    const write = adapter.writeReviewEvents.bind(adapter);
    let fail = true;
    adapter.writeReviewEvents = async (...args) => { if (fail) throw new Error("offline"); return write(...args); };

    expect((await syncReviewEventHistory(adapter, "kevin", false)).remaining).toBe(1);
    const failed = await openLocalRepositories(undefined, "kevin");
    const queued = (await failed.pendingSync.list())[0]!;
    const firstDeviceId = (await failed.deviceMetadata.get("device"))?.deviceId;
    expect(queued).toMatchObject({ attempts: 1 });
    expect(queued.nextAttemptAt).toBeTruthy();
    expect(firstDeviceId).toMatch(/^[0-9a-f-]{36}$/i);
    failed.close();

    await syncReviewEventHistory(adapter, "kevin", false);
    expect(adapter.batches).toHaveLength(0);
    expect(await retryPendingReviewEvents("kevin")).toBe(1);
    fail = false;
    await syncReviewEventHistory(adapter, "kevin", false);
    expect(adapter.events.get(`f32a6c14-8d1b-4b70-9a2e-61c5d9037f48:${event.id}`)).toMatchObject({ originDeviceId: firstDeviceId });
    const complete = await openLocalRepositories(undefined, "kevin");
    expect(await complete.pendingSync.list()).toEqual([]);
    expect((await complete.deviceMetadata.get("device"))?.deviceId).toBe(firstDeviceId);
    complete.close();
  });

  it("reconciles two independent device stores for both fixed profiles without cross-profile events", async () => {
    const timestamp = "2026-02-01T00:00:00.000Z";
    const ids = [
      ["kevin", "00000000-0000-4000-8000-000000000101", "jla-device-a"],
      ["kevin", "00000000-0000-4000-8000-000000000102", "jla-device-b"],
      ["janne", "00000000-0000-4000-8000-000000000201", "jla-device-a"],
      ["janne", "00000000-0000-4000-8000-000000000202", "jla-device-b"],
    ] as const;
    for (const [profile, id, dbName] of ids) {
      const device = await openLocalRepositories(dbName, profile);
      await device.reviews.append({ id, recordVersion: 1, updatedAt: timestamp, reviewedAt: timestamp, conceptId: `${profile}-${id}`, cardId: `${profile}-${id}`, rating: "good", kind: "scheduled-review" });
      device.close();
    }

    const adapter = new FakeCloud();
    await Promise.all([
      syncReviewEventHistory(adapter, "kevin", true, "jla-device-a"),
      syncReviewEventHistory(adapter, "kevin", true, "jla-device-b"),
      syncReviewEventHistory(adapter, "janne", true, "jla-device-a"),
      syncReviewEventHistory(adapter, "janne", true, "jla-device-b"),
    ]);

    const kevinCloud = await adapter.readReviewEvents!("f32a6c14-8d1b-4b70-9a2e-61c5d9037f48", 0, 100);
    const janneCloud = await adapter.readReviewEvents!("a91e5d27-3c84-46f0-bb12-72d8e4065a39", 0, 100);
    expect(kevinCloud.map((event) => event.id).sort()).toEqual(ids.slice(0, 2).map(([, id]) => id).sort());
    expect(janneCloud.map((event) => event.id).sort()).toEqual(ids.slice(2).map(([, id]) => id).sort());
    for (const [profile, , dbName] of ids) {
      const device = await openLocalRepositories(dbName, profile);
      expect(await device.pendingSync.list()).toEqual([]);
      expect((await device.reviews.list()).every((event) => event.profileId === profile)).toBe(true);
      device.close();
    }
  });
});
