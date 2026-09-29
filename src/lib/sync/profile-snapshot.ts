import type { LearnerProfileId } from "../storage/types.ts";
import type { CloudSavePayload } from "./cloud-save.ts";
import { openLocalRepositories } from "../storage/repositories.ts";

const stores = ["settings", "lessonProgress", "conceptStates", "reviewEvents", "reviewStates", "pendingSync"] as const;
export async function readProfileSnapshot(profileId: LearnerProfileId): Promise<{ state: CloudSavePayload; updatedAt?: string }> {
  const repos = await openLocalRepositories(undefined, profileId);
  try {
    const values = await Promise.all([repos.settings.list(), repos.lessonProgress.list(), repos.conceptStates.list(), repos.reviews.list(), repos.reviews.getStates(), repos.pendingSync.list()]);
    const state = Object.fromEntries(stores.map((name, index) => [name, values[index] as readonly Record<string, unknown>[]]));
    const dates = values.flat().map((value) => Date.parse((value as { updatedAt: string }).updatedAt)).filter(Number.isFinite);
    return { state, updatedAt: dates.length ? new Date(Math.max(...dates)).toISOString() : undefined };
  } finally { repos.close(); }
}

export async function replaceProfileSnapshot(profileId: LearnerProfileId, payload: CloudSavePayload): Promise<void> {
  const repos = await openLocalRepositories(undefined, profileId);
  try {
    const db = repos.db;
    const tx = db.transaction([...stores], "readwrite");
    for (const name of stores) {
      const store = tx.objectStore(name);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { if ((cursor.value as { profileId?: string }).profileId === profileId) cursor.delete(); cursor.continue(); return; }
        for (const value of payload[name] ?? []) { const record = value as { id: string }; store.put({ ...value, id: `${profileId}::${record.id}`, profileId }); }
      };
    }
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  } finally { repos.close(); }
  window.dispatchEvent(new CustomEvent("learn-japanese:state-changed", { detail: { profileId, origin: "restore" } }));
}
