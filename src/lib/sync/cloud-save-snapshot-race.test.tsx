import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const readSnapshot = vi.hoisted(() => vi.fn());

vi.mock("./profile-snapshot.ts", async (importOriginal) => ({
  ...await importOriginal<typeof import("./profile-snapshot.ts")>(),
  readProfileSnapshot: readSnapshot,
}));

import { CloudSavePanel } from "../../features/sync/CloudSavePanel.tsx";
import { CLOUD_PROFILE_IDS, SupabaseCloudSaveAdapter, type CloudSaveDocument } from "./cloud-save.ts";

const emptySnapshot = {
  state: { settings: [], lessonProgress: [], conceptStates: [], reviewEvents: [], reviewStates: [], pendingSync: [] },
  revision: 0,
  schemaVersion: 1,
};

const completedSnapshot = {
  ...emptySnapshot,
  updatedAt: "2026-10-02T09:00:00.000Z",
  state: {
    ...emptySnapshot.state,
    lessonProgress: [{ id: "hiragana-a-row", profileId: "kevin", lessonId: "hiragana-a-row", status: "completed", recordVersion: 1, updatedAt: "2026-10-02T09:00:00.000Z" }],
  },
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  readSnapshot.mockReset();
});

describe("cloud save snapshot scheduling", () => {
  it("rechecks an initially empty snapshot and waits for a matching RPC acknowledgement before Saved", async () => {
    const readBoundaries: Array<{ state: { lessonProgress: readonly Record<string, unknown>[] } }> = [];
    readSnapshot.mockImplementation(async () => {
      const value = readBoundaries.length === 0 ? emptySnapshot : completedSnapshot;
      readBoundaries.push(value);
      return value;
    });
    let intercepted: Record<string, unknown> | undefined;
    let acknowledgement: CloudSaveDocument | undefined;
    let releaseRpc: (() => void) | undefined;

    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
      rpc: async (_name: string, args: Record<string, unknown>) => {
        intercepted = structuredClone(args);
        const row = {
          profile_id: args.p_profile_id,
          revision: Number(args.p_expected_revision) + 1,
          schema_version: args.p_schema_version,
          updated_at: args.p_updated_at,
          state: args.p_state,
        };
        return await new Promise<{ data: unknown; error: null }>((resolve) => {
          releaseRpc = () => {
            acknowledgement = {
              profileId: String(row.profile_id),
              revision: row.revision,
              schemaVersion: Number(row.schema_version),
              updatedAt: String(row.updated_at),
              state: row.state as CloudSaveDocument["state"],
            };
            resolve({ data: [row], error: null });
          };
        });
      },
    } as never;

    render(<CloudSavePanel profileId="kevin" adapter={new SupabaseCloudSaveAdapter(Promise.resolve(client))} />);
    await waitFor(() => expect(intercepted).toBeDefined(), { timeout: 3000 });

    expect(readBoundaries[0]?.state.lessonProgress).toEqual([]);
    expect(readBoundaries[1]?.state.lessonProgress).toEqual(expect.arrayContaining([
      expect.objectContaining({ lessonId: "hiragana-a-row", status: "completed" }),
    ]));
    expect(readSnapshot.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(intercepted).toMatchObject({
      p_profile_id: CLOUD_PROFILE_IDS.kevin,
      p_expected_revision: 0,
      p_state: { lessonProgress: expect.arrayContaining([expect.objectContaining({ lessonId: "hiragana-a-row", status: "completed" })]) },
    });
    expect(screen.getByText("Saving")).toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();

    releaseRpc?.();
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(acknowledgement?.profileId).toBe(CLOUD_PROFILE_IDS.kevin);
    expect(acknowledgement?.state.lessonProgress).toEqual(expect.arrayContaining([
      expect.objectContaining({ lessonId: "hiragana-a-row", status: "completed" }),
    ]));
  });
});
