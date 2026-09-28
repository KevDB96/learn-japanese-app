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
    expect(STORAGE_SCHEMA_VERSION).toBe(2);
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
    expect(await repos.reviews.get(event.id)).toEqual(event);
    expect(await repos.reviews.list()).toEqual([event]);
  });

  it("applies an event idempotently, persists derived state offline, and rebuilds from the append-only log", async () => {
    const { db, repos } = await fresh();
    const input = { id: "review-1", conceptId: "kana-a", cardId: "kana-a", rating: "Forgot" as const, reviewedAt: "2026-01-01T00:00:00.000Z" };
    await repos.reviews.record(input);
    await repos.reviews.record(input);
    expect(await repos.reviews.list()).toHaveLength(1);
    expect(await repos.reviews.getStates()).toMatchObject([{ id: "kana-a", state: { reviewCount: 1, lapseCount: 1, nextDueAt: "2026-01-01T00:01:00.000Z" } }]);
    db.close();
    const reopened = await openLocalDatabase(`${STORAGE_DATABASE_NAME}-test`);
    opened.push(reopened);
    const afterReload = createRepositories(reopened);
    const before = await afterReload.reviews.getStates();
    expect(await afterReload.reviews.rebuild()).toEqual(before);
    const due = await afterReload.reviews.due(Date.parse("2026-01-01T00:02:00.000Z"));
    expect(due).toMatchObject([{ cardId: "kana-a", conceptId: "kana-a" }]);
    const plan = composeSession({ dueReviewIds: due.map((candidate) => candidate.conceptId as ContentId), weakConceptIds: [], newMaterialCap: 0 });
    expect(plan.items).toEqual([{ kind: "review", conceptId: "kana-a" }]);
    expect(plan.summary.reviewCount).toBe(1);
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
    expect(await again.lessonProgress.get("lesson-a")).toEqual(state);
    expect(await again.appMetadata.get("app")).toMatchObject({ contentVersion: "0" });
  });
});
