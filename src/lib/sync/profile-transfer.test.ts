import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { openLocalRepositories } from "../storage/repositories.ts";
import { STORAGE_DATABASE_NAME } from "../storage/types.ts";
import { importProfile, exportProfile, validateProfileExport } from "./profile-transfer.ts";
import { readProfileSnapshot } from "./profile-snapshot.ts";
import type { ReviewRating } from "../../features/review/srs.ts";

const opened: Array<Awaited<ReturnType<typeof openLocalRepositories>>> = [];
async function repositories() { const repos = await openLocalRepositories(); opened.push(repos); return repos; }
const portable = (state: Awaited<ReturnType<typeof readProfileSnapshot>>["state"]) => Object.fromEntries(Object.entries(state).map(([key, rows]) => [key, rows?.map(({ profileId: _profileId, ...row }) => row)]));

afterEach(async () => {
  opened.splice(0).forEach((repo) => repo.close());
  localStorage.clear();
  await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(STORAGE_DATABASE_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
});

describe("profile recovery file", () => {
  it("round trips a profile after clearing it and rebuilds SRS while preserving review IDs", async () => {
    const repos = await repositories();
    const stamp = "2026-02-03T04:05:06.000Z";
    await repos.settings.put({ id: "prefs", recordVersion: 1, updatedAt: stamp, dailyGoal: 12, preferredReading: "kana" });
    await repos.lessonProgress.put({ id: "hiragana", lessonId: "hiragana", status: "completed", recordVersion: 1, updatedAt: stamp });
    await repos.conceptStates.put({ id: "a", conceptId: "a", familiarity: 3, recordVersion: 1, updatedAt: stamp });
    await repos.reviews.record({ id: "event-stable-id", conceptId: "a", cardId: "a", rating: "Got It" as ReviewRating, reviewedAt: stamp });
    const before = await readProfileSnapshot("kevin");
    const file = await exportProfile("kevin", "Kevin", new Date(stamp));
    const empty = await exportProfile("kevin", "Kevin", new Date(stamp));
    await importProfile(empty, "kevin");
    await importProfile(file, "kevin");
    const after = await readProfileSnapshot("kevin");
    expect(portable(after.state)).toEqual(portable(before.state));
    expect(after.state.reviewEvents?.map((event) => event.id)).toEqual(["event-stable-id"]);
    expect((after.state.reviewStates?.[0]?.state as { reviewCount: number }).reviewCount).toBe(1);
    expect(localStorage.getItem("learn-japanese:pre-import:kevin")).toBeTruthy();
  });

  it("rejects malformed, wrong-profile, future-version, and secret-bearing data", async () => {
    const file = await exportProfile("kevin", "Kevin");
    expect(JSON.stringify(file)).not.toMatch(/supabase|deviceId/i);
    expect(() => validateProfileExport({ ...file, profile: { id: "janne", displayName: "Janne" } }, "kevin")).toThrow(/belongs to/);
    expect(() => validateProfileExport({ ...file, schemaVersion: 2 }, "kevin")).toThrow(/version/);
    expect(() => validateProfileExport({ ...file, state: { ...file.state, settings: "bad" } }, "kevin")).toThrow(/settings/);
    expect(() => validateProfileExport({ ...file, credential: "x" }, "kevin")).toThrow(/sensitive/);
    const repos = await repositories();
    await repos.settings.put({ id: "keep", recordVersion: 1, updatedAt: new Date().toISOString(), dailyGoal: 5, preferredReading: "romaji" });
    await expect(importProfile({ ...file, profile: { id: "janne", displayName: "Janne" } }, "kevin")).rejects.toThrow(/belongs to/);
    await expect(importProfile({ ...file, state: { ...file.state, settings: "invalid" } }, "kevin")).rejects.toThrow(/settings/);
    expect(await repos.settings.get("keep")).toBeTruthy();
    expect(localStorage.getItem("learn-japanese:pre-import:kevin")).toBeNull();
  });
});
