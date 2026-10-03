import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { openLocalDatabase } from "./database";
import { createRepositories } from "./repositories";
import { STORAGE_DATABASE_NAME, STORAGE_SCHEMA_VERSION } from "./types";
import { composeSession } from "../session/session.ts";
import type { ContentId } from "../content/types.ts";

const opened: IDBDatabase[] = [];
async function fresh() {
  const db = await openLocalDatabase(`${STORAGE_DATABASE_NAME}-test`);
  opened.push(db);
  return { db, repos: createRepositories(db) };
}
afterEach(async () => {
  opened.splice(0).forEach((db) => db.close());
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(`${STORAGE_DATABASE_NAME}-test`);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

describe("local storage repositories", () => {
  it("initializes an empty database with all stores and default metadata", async () => {
    const { db, repos } = await fresh();
    expect(STORAGE_SCHEMA_VERSION).toBe(4);
    expect([...db.objectStoreNames].sort()).toEqual(["appMetadata", "conceptStates", "deviceMetadata", "lessonProgress", "pendingSync", "profiles", "reviewEvents", "reviewStates", "settings"].sort());
    expect(await repos.appMetadata.get("app")).toMatchObject({ contentVersion: "0", contentSchemaVersion: 1 });
    expect(await repos.deviceMetadata.get("device")).toMatchObject({ deviceId: "" });
    expect(await repos.lessonProgress.list()).toEqual([]);
  });

  it("creates, reads and updates settings and lesson/concept state", async () => {
    const { repos } = await fresh();
    const stamp = new Date(0).toISOString();
    await repos.settings.put({ id: "user", recordVersion: 1, updatedAt: stamp, dailyGoal: 10, preferredReading: "kana" });
    await repos.lessonProgress.put({ id: "lesson-a", lessonId: "lesson-a", recordVersion: 1, updatedAt: stamp, status: "in-progress" });
    await repos.conceptStates.put({ id: "concept-a", conceptId: "concept-a", recordVersion: 1, updatedAt: stamp, familiarity: 2 });
    await repos.settings.put({ id: "user", recordVersion: 1, updatedAt: stamp, dailyGoal: 15, preferredReading: "romaji" });
    expect(await repos.settings.get("user")).toMatchObject({ dailyGoal: 15, preferredReading: "romaji" });
    expect(await repos.lessonProgress.get("lesson-a")).toMatchObject({ status: "in-progress" });
    expect(await repos.conceptStates.get("concept-a")).toMatchObject({ familiarity: 2 });
  });

  it("keeps review events append-only and rejects duplicate IDs", async () => {
    const { repos } = await fresh();
    const event = { id: "event-1", recordVersion: 1, updatedAt: new Date(0).toISOString(), conceptId: "concept-a", cardId: "concept-a", reviewedAt: new Date(0).toISOString(), rating: "good" as const, kind: "scheduled-review" as const };
    await repos.reviews.append(event);
    await expect(repos.reviews.append({ ...event, rating: "easy" })).rejects.toBeTruthy();
    expect(await repos.reviews.get(event.id)).toEqual({ ...event, profileId: "kevin" });
    expect(await repos.reviews.list()).toEqual([{ ...event, profileId: "kevin" }]);
    expect(await repos.pendingSync.list()).toMatchObject([{ entityId: event.id, operation: "review-event" }]);
  });

  it("applies an event idempotently, persists derived state offline, and rebuilds from the append-only log", async () => {
    const { db, repos } = await fresh();
    const input = { id: "review-1", conceptId: "kana-a", cardId: "kana-a", rating: "Forgot" as const, reviewedAt: "2026-01-01T00:00:00.000Z", responseTimeMs: 2_450 };
    await repos.reviews.record(input);
    await repos.reviews.record(input);
    expect(await repos.reviews.list()).toHaveLength(1);
    expect(await repos.reviews.get("review-1")).toMatchObject({ responseTimeMs: 2_450 });
    expect(await repos.reviews.getStates()).toMatchObject([{ id: "kana-a", state: { reviewCount: 1, lapseCount: 1, nextDueAt: "2026-01-01T00:01:00.000Z" } }]);
    db.close();
    const reopened = await openLocalDatabase(`${STORAGE_DATABASE_NAME}-test`);
    opened.push(reopened);
    const afterReload = createRepositories(reopened);
    const before = await afterReload.reviews.getStates();
    expect(await afterReload.reviews.rebuild()).toEqual(before);
    const due = await afterReload.reviews.due(Date.parse("2026-01-01T00:02:00.000Z"));
    expect(due).toMatchObject([{ cardId: "kana-a", conceptId: "kana-a" }]);
    const plan = composeSession({ dueReviews: due.map((candidate) => ({ conceptId: candidate.conceptId as ContentId, cardId: candidate.cardId, formId: "kana-glyph-to-sound" })), weakConceptIds: [], newMaterialCap: 0 });
    expect(plan.items).toEqual([{ kind: "review", conceptId: "kana-a", cardId: "kana-a", formId: "kana-glyph-to-sound" }]);
    expect(plan.summary.reviewCount).toBe(1);
  });

  it("introduces each card idempotently within its learner profile", async () => {
    const db = await openLocalDatabase(`${STORAGE_DATABASE_NAME}-test`);
    opened.push(db);
    const kevin = createRepositories(db, "kevin");
    const janne = createRepositories(db, "janne");
    const at = Date.parse("2026-01-01T00:00:00.000Z");
    await kevin.reviews.introduce("kana-a", at, "kana-a--glyph");
    await kevin.reviews.introduce("kana-a", at + 1, "kana-a--glyph");
    await janne.reviews.introduce("kana-a", at, "kana-a--glyph");
    expect(await kevin.reviews.getStates()).toHaveLength(1);
    expect(await janne.reviews.getStates()).toHaveLength(1);
    expect((await kevin.reviews.getStates())[0]?.state.nextDueAt).toBe(new Date(at).toISOString());
  });

  it("repairs derived state from long out-of-order history without changing source events", async () => {
    const { repos } = await fresh();
    const origin = Date.parse("2024-01-01T00:00:00.000Z");
    const ratings = ["Got It", "Hard", "Forgot", "Easy"] as const;
    const history = Array.from({ length: 240 }, (_, index) => ({
      id: `history-${String(index).padStart(3, "0")}`,
      conceptId: "kana-a", cardId: "kana-a", rating: ratings[index % ratings.length]!,
      reviewedAt: new Date(origin + index * 3 * 86_400_000).toISOString(),
    }));
    for (const index of [...history.keys()].reverse()) {
      const event = history[index]!;
      await repos.reviews.append({
        ...event, recordVersion: 1, updatedAt: event.reviewedAt,
        rating: ({ "Got It": "good", Hard: "hard", Forgot: "again", Easy: "easy" } as const)[event.rating],
        kind: "scheduled-review",
      });
    }
    const sourceBefore = await repos.reviews.list();
    const once = await repos.reviews.rebuild();
    expect(once).toHaveLength(1);
    expect(once[0]?.state).toMatchObject({ reviewCount: 240, lapseCount: 60, lastReviewedAt: history.at(-1)?.reviewedAt });
    expect(await repos.reviews.list()).toEqual(sourceBefore);
    expect(await repos.reviews.rebuild()).toEqual(once);
    expect(await repos.reviews.list()).toEqual(sourceBefore);
  });

  it("repairs damaged projections and removes eventless reviewed states while preserving introduced cards", async () => {
    const { db, repos } = await fresh();
    await repos.reviews.introduce("new-card", Date.parse("2026-01-01T00:00:00.000Z"));
    await repos.reviews.record({ id: "review-a", conceptId: "kana-a", cardId: "kana-a", rating: "Got It", reviewedAt: "2026-01-01T00:00:00.000Z" });
    const state = (await repos.reviews.getStates()).find((item) => item.cardId === "kana-a")!;
    const introduced = (await repos.reviews.getStates()).find((item) => item.cardId === "new-card")!;
    const write = db.transaction("reviewStates", "readwrite");
    write.objectStore("reviewStates").put({ ...state, id: "kevin::kana-a", state: { ...state.state, reviewCount: 99 } });
    write.objectStore("reviewStates").put({ ...introduced, state: { ...introduced.state, reviewCount: 2 } });
    await new Promise<void>((resolve, reject) => { write.oncomplete = () => resolve(); write.onerror = () => reject(write.error); });
    await repos.reviews.rebuild();
    const source = await repos.reviews.list();
    expect(await repos.reviews.getStates()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cardId: "new-card", state: expect.objectContaining({ reviewCount: 0 }) }),
      expect.objectContaining({ cardId: "kana-a", state: expect.objectContaining({ reviewCount: 1 }) }),
    ]));
    expect(await repos.reviews.list()).toEqual(source);
  });

  it("records practice without creating scheduled state", async () => {
    const { repos } = await fresh();
    await repos.reviews.record({ id: "practice-1", conceptId: "kana-b", cardId: "kana-b", rating: "Got It", reviewedAt: "2026-01-01T00:00:00.000Z", kind: "practice" });
    expect(await repos.reviews.getStates()).toEqual([]);
    expect((await repos.reviews.list())[0]?.kind).toBe("practice");
  });

  it("preserves state across re-open and does not repeat initialization destructively", async () => {
    const { db, repos } = await fresh();
    const state = { id: "lesson-a", lessonId: "lesson-a", recordVersion: 1, updatedAt: new Date(0).toISOString(), status: "completed" as const };
    await repos.lessonProgress.put(state);
    db.close();
    const reopened = await openLocalDatabase(`${STORAGE_DATABASE_NAME}-test`);
    opened.push(reopened);
    const again = createRepositories(reopened);
    expect(await again.lessonProgress.get("lesson-a")).toEqual({ ...state, profileId: "kevin" });
    expect(await again.appMetadata.get("app")).toMatchObject({ contentVersion: "0" });
  });

  it("isolates every learner store by profile while keeping global metadata shared", async () => {
    const { db, repos: kevin } = await fresh();
    const janne = createRepositories(db, "janne");
    const stamp = new Date(0).toISOString();
    await kevin.settings.put({ id: "settings", profileId: "kevin", recordVersion: 1, updatedAt: stamp, dailyGoal: 10, preferredReading: "kana" });
    await kevin.lessonProgress.put({ id: "lesson-a", profileId: "kevin", lessonId: "lesson-a", recordVersion: 1, updatedAt: stamp, status: "completed" });
    await kevin.conceptStates.put({ id: "concept-a", profileId: "kevin", conceptId: "concept-a", recordVersion: 1, updatedAt: stamp, familiarity: 2 });
    await kevin.pendingSync.put({ id: "sync-a", profileId: "kevin", operation: "upsert", entityId: "lesson-a", payload: {}, recordVersion: 1, updatedAt: stamp });
    await kevin.reviews.record({ id: "same-event", conceptId: "kana-kata-shi", confusedConceptId: "kana-kata-tsu", cardId: "same-card", rating: "Got It", reviewedAt: stamp });
    await janne.reviews.record({ id: "same-event", conceptId: "kana-kata-so", confusedConceptId: "kana-kata-n", cardId: "same-card", rating: "Forgot", reviewedAt: stamp });
    expect(await janne.settings.list()).toEqual([]);
    expect(await janne.lessonProgress.list()).toEqual([]);
    expect(await janne.conceptStates.list()).toEqual([]);
    expect(await janne.pendingSync.list()).toMatchObject([{ operation: "review-event", entityId: "same-event" }]);
    expect(await kevin.reviews.list()).toMatchObject([{ conceptId: "kana-kata-shi", confusedConceptId: "kana-kata-tsu" }]);
    expect(await janne.reviews.list()).toMatchObject([{ conceptId: "kana-kata-so", confusedConceptId: "kana-kata-n" }]);
    expect(await kevin.reviews.getStates()).toMatchObject([{ cardId: "same-card", state: { reviewCount: 1, lapseCount: 0 } }]);
    expect(await janne.reviews.getStates()).toMatchObject([{ cardId: "same-card", state: { reviewCount: 1, lapseCount: 1 } }]);
    expect(await janne.appMetadata.get("app")).toEqual(await kevin.appMetadata.get("app"));
  });

  it("migrates existing unscoped learner records to Kevin exactly once", async () => {
    const name = `${STORAGE_DATABASE_NAME}-test`;
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of ["profiles", "settings", "lessonProgress", "conceptStates", "reviewEvents", "pendingSync", "appMetadata", "deviceMetadata", "reviewStates"]) db.createObjectStore(store, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    old.transaction("lessonProgress", "readwrite").objectStore("lessonProgress").put({ id: "lesson-x", lessonId: "lesson-x", status: "completed", recordVersion: 1, updatedAt: "2026-01-01T00:00:00.000Z" });
    await new Promise<void>((resolve) => { old.close(); resolve(); });
    const migrated = await openLocalDatabase(name);
    opened.push(migrated);
    const kevin = createRepositories(migrated, "kevin");
    const janne = createRepositories(migrated, "janne");
    expect(await kevin.lessonProgress.get("lesson-x")).toMatchObject({ status: "completed", profileId: "kevin" });
    expect(await janne.lessonProgress.get("lesson-x")).toBeUndefined();
    migrated.close();
    const reopened = await openLocalDatabase(name);
    opened.push(reopened);
    expect(await createRepositories(reopened, "kevin").lessonProgress.list()).toHaveLength(1);
  });

  it("backfills old review history into the UUID outbox and normalizes prefixed UUIDs", async () => {
    const name = `${STORAGE_DATABASE_NAME}-test`;
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 3);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of ["profiles", "settings", "lessonProgress", "conceptStates", "reviewEvents", "pendingSync", "appMetadata", "deviceMetadata", "reviewStates"]) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const eventId = "00000000-0000-4000-8000-000000000001";
    old.transaction("reviewEvents", "readwrite").objectStore("reviewEvents").put({ id: `kevin::review-${eventId}`, profileId: "kevin", recordVersion: 1, updatedAt: "2026-01-01T00:00:00.000Z", reviewedAt: "2026-01-01T00:00:00.000Z", conceptId: "kana-a", cardId: "kana-a", rating: "good", kind: "scheduled-review" });
    old.close();
    const upgraded = await openLocalDatabase(name);
    opened.push(upgraded);
    const repos = createRepositories(upgraded);
    expect(await repos.reviews.get(eventId)).toMatchObject({ id: eventId, profileId: "kevin" });
    expect(await repos.pendingSync.get(`review-event::${eventId}`)).toMatchObject({ operation: "review-event", entityId: eventId, payload: { id: eventId } });
  });

  it("fails closed and preserves a database created by a newer app version", async () => {
    const name = `${STORAGE_DATABASE_NAME}-test`;
    const future = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, STORAGE_SCHEMA_VERSION + 1);
      request.onupgradeneeded = () => request.result.createObjectStore("futureData", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const write = future.transaction("futureData", "readwrite");
    write.objectStore("futureData").put({ id: "keep", value: "preserved" });
    await new Promise<void>((resolve) => { write.oncomplete = () => resolve(); });
    future.close();
    await expect(openLocalDatabase(name)).rejects.toThrow(/Data is preserved.*compatible app version/);
    const read = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const preserved = await new Promise<unknown>((resolve, reject) => {
      const request = read.transaction("futureData").objectStore("futureData").get("keep");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(preserved).toEqual({ id: "keep", value: "preserved" });
    read.close();
  });
});
