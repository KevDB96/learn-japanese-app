import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CloudSavePanel } from "../../features/sync/CloudSavePanel.tsx";
import { LessonSession } from "../../features/lessons/LessonSession.tsx";
import { contentCatalog } from "../content/catalog.ts";
import { openLocalRepositories } from "../storage/repositories.ts";
import { STORAGE_DATABASE_NAME } from "../storage/types.ts";
import { CLOUD_PROFILE_IDS, compareSaveMetadata, type CloudSaveAdapter, type CloudSaveDocument } from "./cloud-save.ts";

class FakeCloud implements CloudSaveAdapter {
  document?: CloudSaveDocument;
  writes = 0;
  eventReads = 0;
  events = new Map<string, Record<string, unknown>>();
  async read(profileId: string) { return this.document?.profileId === profileId ? this.document : undefined; }
  async write(document: CloudSaveDocument, expectedRevision: number) {
    if ((this.document?.revision ?? 0) !== expectedRevision) throw new Error("revision conflict");
    this.writes += 1;
    this.document = { ...document, revision: expectedRevision + 1 };
    return this.document;
  }
  async writeReviewEvents(_profileId: string, events: readonly Record<string, unknown>[]) { for (const event of events) this.events.set(String(event.id), event); return events.map((event) => String(event.id)); }
  async readReviewEvents(_profileId: string, offset: number, limit: number) { this.eventReads++; return [...this.events.values()].slice(offset, offset + limit); }
}

afterEach(async () => {
  cleanup(); window.localStorage.clear();
  await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(STORAGE_DATABASE_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
});

describe("cloud convenience saves", () => {
  it("uses exactly two opaque fixed slots and compares metadata", () => {
    expect(Object.keys(CLOUD_PROFILE_IDS).sort()).toEqual(["janne", "kevin"]);
    expect(CLOUD_PROFILE_IDS.kevin).not.toContain("kevin");
    expect(CLOUD_PROFILE_IDS.janne).not.toContain("janne");
    expect(compareSaveMetadata(undefined, undefined)).toBe("same");
    expect(compareSaveMetadata({ updatedAt: "2026-01-02T00:00:00.000Z" }, { profileId: CLOUD_PROFILE_IDS.kevin, revision: 1, schemaVersion: 1, updatedAt: "2026-01-01T00:00:00.000Z", state: {} })).toBe("local-newer");
  });

  it("writes the selected profile's completed lesson progress in the cloud snapshot", async () => {
    const adapter = new FakeCloud();
    const repos = await openLocalRepositories(undefined, "kevin");
    await repos.lessonProgress.put({ id: "introduction", lessonId: "introduction", status: "completed", recordVersion: 1, updatedAt: "2026-01-01T00:00:00.000Z" });
    await repos.lessonProgress.put({ id: "hiragana-a-row", lessonId: "hiragana-a-row", status: "completed", recordVersion: 1, updatedAt: "2026-01-01T00:01:00.000Z" });
    repos.close();
    render(<CloudSavePanel profileId="kevin" adapter={adapter} />);
    await waitFor(() => expect(adapter.writes).toBe(1), { timeout: 3000 });
    expect(adapter.document?.state.lessonProgress).toEqual(expect.arrayContaining([
      expect.objectContaining({ lessonId: "introduction", status: "completed" }),
      expect.objectContaining({ lessonId: "hiragana-a-row", status: "completed" }),
    ]));
    expect(adapter.document).toMatchObject({ profileId: CLOUD_PROFILE_IDS.kevin, revision: 1, schemaVersion: 1 });
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("fails closed when the cloud acknowledgement omits submitted lesson progress", async () => {
    const adapter = new FakeCloud();
    const write = adapter.write.bind(adapter);
    adapter.write = async (document, revision) => {
      const acknowledged = await write(document, revision);
      const { lessonProgress: _omitted, ...state } = acknowledged.state;
      return { ...acknowledged, state };
    };
    const repos = await openLocalRepositories(undefined, "kevin");
    await repos.lessonProgress.put({ id: "hiragana-a-row", lessonId: "hiragana-a-row", status: "completed", recordVersion: 1, updatedAt: "2026-01-01T00:00:00.000Z" });
    repos.close();
    render(<CloudSavePanel profileId="kevin" adapter={adapter} />);
    expect(await screen.findByText("Conflict", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    const check = await openLocalRepositories(undefined, "kevin");
    expect(await check.lessonProgress.get("hiragana-a-row")).toMatchObject({ status: "completed" });
    check.close();
  });

  it("keeps a lesson completion pending until its completed progress reaches the cloud snapshot", async () => {
    const adapter = new FakeCloud() as FakeCloud & { pauseNextWrite?: boolean; writeStarted?: boolean; releaseWrite?: () => void };
    const write = adapter.write.bind(adapter);
    adapter.write = async (document, revision) => {
      if (adapter.pauseNextWrite) {
        adapter.pauseNextWrite = false;
        adapter.writeStarted = true;
        await new Promise<void>((resolve) => { adapter.releaseWrite = resolve; });
      }
      return write(document, revision);
    };
    const lesson = contentCatalog.lessons.find((item) => item.id === "hiragana-a-row") ?? contentCatalog.lessons[0]!;
    render(<><LessonSession lesson={lesson} profileId="kevin" /><CloudSavePanel profileId="kevin" adapter={adapter} /></>);
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    await screen.findByRole("button", { name: /Continue|Complete lesson/ });

    while (!screen.queryByRole("button", { name: "Complete lesson" })) {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await waitFor(() => expect(screen.queryByRole("button", { name: "Continue" }) || screen.queryByRole("button", { name: "Complete lesson" })).toBeTruthy());
    }
    adapter.pauseNextWrite = true;
    fireEvent.click(screen.getByRole("button", { name: "Complete lesson" }));
    await screen.findByText("Lesson complete");
    expect(screen.queryByRole("button", { name: "Complete lesson" })).not.toBeInTheDocument();
    await waitFor(() => expect(adapter.writeStarted).toBe(true));
    expect(screen.getByText("Saving")).toBeInTheDocument();
    adapter.releaseWrite?.();
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(adapter.document?.state.lessonProgress).toEqual(expect.arrayContaining([
      expect.objectContaining({ lessonId: lesson.id, status: "completed" }),
    ]));
  });

  it("syncs review UUIDs separately from the bounded profile snapshot", async () => {
    const adapter = new FakeCloud();
    const repos = await openLocalRepositories();
    const id = "00000000-0000-4000-8000-000000000042";
    await repos.reviews.record({ id, conceptId: "kana-a", cardId: "kana-a", rating: "Got It", reviewedAt: "2026-01-01T00:00:00.000Z" });
    repos.close();
    render(<CloudSavePanel profileId="kevin" adapter={adapter} />);
    await waitFor(() => expect(adapter.events.has(id)).toBe(true));
    await waitFor(() => expect(adapter.eventReads).toBeGreaterThan(0));
    const startupReads = adapter.eventReads;
    const nextId = "00000000-0000-4000-8000-000000000043";
    const changed = await openLocalRepositories(undefined, "kevin");
    await changed.reviews.record({ id: nextId, conceptId: "kana-i", cardId: "kana-i", rating: "Got It", reviewedAt: "2026-01-02T00:00:00.000Z" });
    changed.close();
    await waitFor(() => expect(adapter.events.has(nextId)).toBe(true));
    expect(adapter.eventReads).toBe(startupReads);
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(adapter.eventReads).toBeGreaterThan(startupReads));
    expect(adapter.document).toBeUndefined();
  });

  it("merges local and cloud saves instead of replacing learner history", async () => {
    const adapter = new FakeCloud();
    adapter.document = { profileId: CLOUD_PROFILE_IDS.kevin, revision: 4, schemaVersion: 1, updatedAt: "2026-01-02T00:00:00.000Z", state: { settings: [{ id: "settings-cloud", recordVersion: 1, updatedAt: "2026-01-02T00:00:00.000Z", dailyGoal: 12, preferredReading: "kana" }] } };
    const repos = await openLocalRepositories();
    await repos.settings.put({ id: "settings-local", dailyGoal: 8, preferredReading: "romaji", recordVersion: 1, updatedAt: "2026-01-01T00:00:00.000Z" });
    repos.close();
    render(<CloudSavePanel profileId="kevin" adapter={adapter} />);
    expect(await screen.findByText("Conflict")).toBeInTheDocument();
    expect(adapter.writes).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Merge saves" }));
    const check = await openLocalRepositories();
    await waitFor(async () => expect(await check.settings.get("settings-cloud")).toMatchObject({ dailyGoal: 12 }));
    expect(await check.settings.get("settings-local")).toMatchObject({ dailyGoal: 8 });
    check.close();
    await waitFor(() => expect(adapter.writes).toBe(1));
    expect(window.localStorage.getItem("learn-japanese:last-known-good:kevin")).toContain("settings-local");
    expect(JSON.parse(window.localStorage.getItem("learn-japanese:cloud-metadata:kevin") ?? "{}")).toMatchObject({ revision: 5, schemaVersion: 1 });
  });

  it("rejects malformed remote state while preserving the local profile and last known good snapshot", async () => {
    const adapter = new FakeCloud();
    adapter.document = { profileId: CLOUD_PROFILE_IDS.kevin, revision: 7, schemaVersion: 1, updatedAt: "2026-01-02T00:00:00.000Z", state: { settings: [{ id: "poison", dailyGoal: "invalid", preferredReading: "kana" }] } };
    const repos = await openLocalRepositories(undefined, "kevin");
    await repos.settings.put({ id: "safe-local", dailyGoal: 8, preferredReading: "romaji", recordVersion: 1, updatedAt: "2026-01-01T00:00:00.000Z" });
    repos.close();
    const knownGood = JSON.stringify({ revision: 6, state: { settings: [{ id: "known-good" }] } });
    window.localStorage.setItem("learn-japanese:last-known-good:kevin", knownGood);
    render(<CloudSavePanel profileId="kevin" adapter={adapter} />);

    expect(await screen.findByText("Conflict")).toBeInTheDocument();
    const check = await openLocalRepositories(undefined, "kevin");
    expect(await check.settings.get("safe-local")).toMatchObject({ dailyGoal: 8, preferredReading: "romaji" });
    expect(await check.settings.get("poison")).toBeUndefined();
    check.close();
    expect(adapter.writes).toBe(0);
    expect(window.localStorage.getItem("learn-japanese:last-known-good:kevin")).toBe(knownGood);
  });

  it("stops a merge when the cloud revision changes after the comparison was loaded", async () => {
    const adapter = new FakeCloud();
    adapter.document = { profileId: CLOUD_PROFILE_IDS.kevin, revision: 4, schemaVersion: 1, updatedAt: "2026-01-02T00:00:00.000Z", state: { settings: [{ id: "remote-pref", recordVersion: 1, updatedAt: "2026-01-02T00:00:00.000Z", dailyGoal: 12, preferredReading: "kana" }] } };
    const repos = await openLocalRepositories(undefined, "kevin");
    await repos.settings.put({ id: "local-pref", dailyGoal: 8, preferredReading: "romaji", recordVersion: 1, updatedAt: "2026-01-01T00:00:00.000Z" });
    repos.close();
    render(<CloudSavePanel profileId="kevin" adapter={adapter} />);
    expect(await screen.findByText("Conflict")).toBeInTheDocument();

    adapter.document = { ...adapter.document, revision: 5, updatedAt: "2026-01-03T00:00:00.000Z" };
    fireEvent.click(screen.getByRole("button", { name: "Merge saves" }));
    await waitFor(() => expect(screen.getByText("Conflict")).toBeInTheDocument());
    expect(adapter.writes).toBe(0);
    expect(adapter.document.revision).toBe(5);
    const check = await openLocalRepositories(undefined, "kevin");
    expect(await check.settings.get("local-pref")).toMatchObject({ dailyGoal: 8 });
    expect(await check.settings.get("remote-pref")).toMatchObject({ dailyGoal: 12 });
    check.close();
  });
});
