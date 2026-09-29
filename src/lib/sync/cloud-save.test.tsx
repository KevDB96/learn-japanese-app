import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CloudSavePanel } from "../../features/sync/CloudSavePanel.tsx";
import { openLocalRepositories } from "../storage/repositories.ts";
import { CLOUD_PROFILE_IDS, compareSaveMetadata, type CloudSaveAdapter, type CloudSaveDocument } from "./cloud-save.ts";

class FakeCloud implements CloudSaveAdapter {
  document?: CloudSaveDocument;
  writes = 0;
  async read(profileId: string) { return this.document?.profileId === profileId ? this.document : undefined; }
  async write(document: CloudSaveDocument, expectedRevision: number) {
    if ((this.document?.revision ?? 0) !== expectedRevision) throw new Error("revision conflict");
    this.writes += 1;
    this.document = { ...document, revision: expectedRevision + 1 };
    return this.document;
  }
}

afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("cloud convenience saves", () => {
  it("uses exactly two opaque fixed slots and compares metadata", () => {
    expect(Object.keys(CLOUD_PROFILE_IDS).sort()).toEqual(["janne", "kevin"]);
    expect(CLOUD_PROFILE_IDS.kevin).not.toContain("kevin");
    expect(CLOUD_PROFILE_IDS.janne).not.toContain("janne");
    expect(compareSaveMetadata(undefined, undefined)).toBe("same");
    expect(compareSaveMetadata({ updatedAt: "2026-01-02T00:00:00.000Z" }, { profileId: CLOUD_PROFILE_IDS.kevin, revision: 1, schemaVersion: 1, updatedAt: "2026-01-01T00:00:00.000Z", state: {} })).toBe("local-newer");
  });

  it("debounces local durable changes and writes a versioned save through the fake adapter", async () => {
    const adapter = new FakeCloud();
    const repos = await openLocalRepositories();
    await repos.lessonProgress.put({ id: "lesson-cloud-test", lessonId: "lesson-cloud-test", status: "completed", recordVersion: 1, updatedAt: "2026-01-01T00:00:00.000Z" });
    repos.close();
    render(<CloudSavePanel profileId="kevin" adapter={adapter} />);
    await waitFor(() => expect(adapter.writes).toBe(1), { timeout: 3000 });
    expect(adapter.document).toMatchObject({ profileId: CLOUD_PROFILE_IDS.kevin, revision: 1, schemaVersion: 1, state: { lessonProgress: [{ lessonId: "lesson-cloud-test" }] } });
    expect(screen.getByText("Saved")).toBeInTheDocument();
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
});
