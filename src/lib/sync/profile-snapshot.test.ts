import { describe, expect, it } from "vitest";
import { CLOUD_PROFILE_IDS, CLOUD_SAVE_SCHEMA_VERSION } from "./cloud-save.ts";
import { mergeProfileSnapshots, rebuildDerivedReviewStates, validateCloudDocument, type ProfileSnapshot } from "./profile-snapshot.ts";

const local: ProfileSnapshot = { revision: 0, schemaVersion: CLOUD_SAVE_SCHEMA_VERSION, updatedAt: "2026-01-01T00:00:00Z", state: {
  settings: [{ id: "prefs", recordVersion: 1, updatedAt: "2026-01-01T00:00:00Z", dailyGoal: 8, preferredReading: "romaji" }],
  lessonProgress: [{ id: "lesson-a", lessonId: "lesson-a", status: "in-progress", currentStep: 3, recordVersion: 1, updatedAt: "2026-01-01T00:00:00Z" }],
  conceptStates: [{ id: "concept-a", conceptId: "concept-a", lifecycle: "LEARNING", familiarity: 2, recordVersion: 1, updatedAt: "2026-01-01T00:00:00Z" }],
  reviewEvents: [{ id: "event-local", conceptId: "concept-a", cardId: "card-a", rating: "good", kind: "scheduled-review", reviewedAt: "2026-01-01T00:00:00Z", recordVersion: 1, updatedAt: "2026-01-01T00:00:00Z" }],
  reviewStates: [], pendingSync: [],
} };
const cloud = { profileId: CLOUD_PROFILE_IDS.kevin, revision: 4, schemaVersion: CLOUD_SAVE_SCHEMA_VERSION, updatedAt: "2026-01-02T00:00:00Z", state: {
  settings: [{ id: "prefs", recordVersion: 2, updatedAt: "2026-01-02T00:00:00Z", dailyGoal: 12, preferredReading: "kana" }],
  lessonProgress: [{ id: "lesson-a", lessonId: "lesson-a", status: "completed", recordVersion: 2, updatedAt: "2026-01-02T00:00:00Z" }],
  conceptStates: [{ id: "concept-a", conceptId: "concept-a", lifecycle: "MASTERED", familiarity: 5, recordVersion: 2, updatedAt: "2026-01-02T00:00:00Z" }],
  reviewEvents: [{ id: "event-cloud", conceptId: "concept-a", cardId: "card-a", rating: "easy", kind: "scheduled-review", reviewedAt: "2026-01-02T00:00:00Z", recordVersion: 1, updatedAt: "2026-01-02T00:00:00Z" }],
  reviewStates: [], pendingSync: [],
} };

describe("profile save reconciliation", () => {
  it("unions offline event histories and deduplicates a retried event UUID", () => {
    const duplicated = { ...cloud, state: { ...cloud.state, reviewEvents: [...cloud.state.reviewEvents, cloud.state.reviewEvents[0]!] } };
    const merged = mergeProfileSnapshots(local, duplicated, "kevin");
    expect(merged.state.reviewEvents?.map((event) => event.id)).toEqual(["event-local", "event-cloud"]);
  });
  it("rejects reuse of an event UUID for different review content", () => {
    const conflict = { ...cloud, state: { ...cloud.state, reviewEvents: [{ ...local.state.reviewEvents![0]!, rating: "again" }] } };
    expect(() => mergeProfileSnapshots(local, conflict, "kevin")).toThrow(/Conflicting review event UUID/);
  });
  it("applies explicit settings, lesson progress, and concept-state rules", () => {
    const merged = mergeProfileSnapshots(local, cloud, "kevin");
    expect(merged.state.settings).toEqual(cloud.state.settings);
    expect(merged.state.lessonProgress?.[0]?.status).toBe("completed");
    expect(merged.state.conceptStates?.[0]).toMatchObject({ lifecycle: "MASTERED", familiarity: 5 });
  });
  it("rebuilds derived scheduled SRS state from the merged event history", () => {
    const events = [...local.state.reviewEvents!, ...cloud.state.reviewEvents!];
    const states = rebuildDerivedReviewStates(events);
    expect(states).toHaveLength(1);
    expect(states[0]?.state).toMatchObject({ reviewCount: 2, lastReviewedAt: "2026-01-02T00:00:00.000Z" });
  });
  it("rejects malformed JSON shapes, unsupported schemas, and cross-profile documents", () => {
    expect(() => validateCloudDocument({ ...cloud, state: "not-json" }, "kevin")).toThrow(/state/);
    expect(() => validateCloudDocument({ ...cloud, schemaVersion: 0 }, "kevin")).toThrow(/schema/);
    expect(() => validateCloudDocument({ ...cloud, profileId: CLOUD_PROFILE_IDS.janne }, "kevin")).toThrow(/another profile/);
  });
});
