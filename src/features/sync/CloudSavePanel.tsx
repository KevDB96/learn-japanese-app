import { useEffect, useState } from "react";
import type { LearnerProfileId } from "../../lib/storage/types.ts";
import { CLOUD_PROFILE_IDS, CLOUD_SAVE_SCHEMA_VERSION, CloudSaveConflictError, compareSaveMetadata, configuredCloudSave, type CloudSaveAdapter, type CloudSaveDocument, type SyncState } from "../../lib/sync/cloud-save.ts";
import { applyMergedProfileSnapshot, cloudSaveState, mergeProfileSnapshots, readProfileSnapshot, saveCloudMetadata, validateCloudDocument, validateCloudSaveAcknowledgement } from "../../lib/sync/profile-snapshot.ts";
import { retryPendingReviewEvents, syncReviewEventHistory } from "../../lib/sync/review-event-sync.ts";
import { openLocalRepositories } from "../../lib/storage/repositories.ts";

function boundedCloudState(state: CloudSaveDocument["state"]): CloudSaveDocument["state"] {
  const completeState = cloudSaveState(state);
  return {
    ...completeState,
    reviewEvents: [],
    pendingSync: (completeState.pendingSync ?? []).filter((item) => item.operation !== "review-event"),
  };
}

export function CloudSavePanel({ profileId, adapter }: { profileId: LearnerProfileId; adapter?: CloudSaveAdapter }) {
  const [cloudAdapter] = useState<CloudSaveAdapter | undefined>(() => adapter ?? configuredCloudSave());
  const [status, setStatus] = useState<SyncState>(cloudAdapter ? "saving" : "unavailable");
  const [cloud, setCloud] = useState<CloudSaveDocument>();
  const [local, setLocal] = useState<Awaited<ReturnType<typeof readProfileSnapshot>>>();
  const [message, setMessage] = useState("");
  const [pendingReviews, setPendingReviews] = useState(0);

  useEffect(() => {
    if (!cloudAdapter) { setStatus("unavailable"); return; }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let known: CloudSaveDocument | undefined;
    let localRevision = 0;
    let refreshChain = Promise.resolve();
    let syncingEvents = false;
    let queuedEventSync: boolean | undefined;
    const syncEvents = async (reconcile = true) => {
      if (!active || !navigator.onLine) return;
      if (syncingEvents) { queuedEventSync = queuedEventSync === undefined ? reconcile : queuedEventSync || reconcile; return; }
      syncingEvents = true;
      try {
        const result = await syncReviewEventHistory(cloudAdapter, profileId, reconcile);
        if (active) setPendingReviews(result.remaining);
        if (active && result.remaining > 0) retryTimer = setTimeout(() => void syncEvents(false), 2000);
      } catch (error) {
        if (active) {
          setStatus(error instanceof TypeError ? "conflict" : "offline");
          setMessage(error instanceof TypeError ? "Review history needs attention. Local reviews are preserved." : "");
          retryTimer = setTimeout(() => void syncEvents(reconcile), 30000);
        }
      } finally {
        syncingEvents = false;
        if (active && queuedEventSync !== undefined) { const nextReconcile = queuedEventSync; queuedEventSync = undefined; void syncEvents(nextReconcile); }
      }
    };
    const refresh = (allowWrite: boolean) => {
      refreshChain = refreshChain.then(async () => {
      const revisionAtStart = localRevision;
      try {
        const snapshot = await readProfileSnapshot(profileId);
        const rawRemote = await cloudAdapter.read(CLOUD_PROFILE_IDS[profileId]);
        const remote = rawRemote ? validateCloudDocument(rawRemote, profileId) : undefined;
        if (!active) return;
        if (revisionAtStart !== localRevision) { timer = setTimeout(() => void refresh(true), 0); return; }
        const previouslyKnown = known;
        setLocal(snapshot); setCloud(remote); known = remote;
        if (remote && !allowWrite && (snapshot.updatedAt ? compareSaveMetadata(snapshot, remote) !== "same" : true)) { setStatus("conflict"); return; }
        if (allowWrite && remote && !previouslyKnown && (!snapshot.updatedAt || compareSaveMetadata(snapshot, remote) !== "same")) { setStatus("conflict"); return; }
        if (allowWrite && remote && previouslyKnown && remote.revision !== previouslyKnown.revision) { setStatus("conflict"); return; }
        if (!navigator.onLine) { setStatus("offline"); return; }
        if (allowWrite && snapshot.updatedAt) {
          setStatus("saving");
          const submitted = { profileId: CLOUD_PROFILE_IDS[profileId], revision: (remote?.revision ?? 0) + 1, schemaVersion: CLOUD_SAVE_SCHEMA_VERSION, updatedAt: snapshot.updatedAt, state: boundedCloudState(snapshot.state) };
          const written = validateCloudSaveAcknowledgement(await cloudAdapter.write(submitted, remote?.revision ?? 0), profileId, submitted);
          if (active) {
            saveCloudMetadata(profileId, written.revision, written.schemaVersion); known = written; setCloud(written);
            if (revisionAtStart !== localRevision) { setStatus("saving"); timer = setTimeout(() => void refresh(true), 0); }
            else setStatus("saved");
          }
        } else if (!remote && snapshot.updatedAt) { setStatus("saving"); timer = setTimeout(() => void refresh(true), 800); }
        else setStatus("saved");
      } catch (error) { if (active) { setStatus(error instanceof CloudSaveConflictError ? "conflict" : error instanceof TypeError ? "conflict" : "offline"); setMessage(error instanceof TypeError ? "Cloud save is invalid or from an unsupported version. This device's data is preserved." : ""); } }
      });
      return refreshChain;
    };
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ profileId: string; origin?: string }>).detail;
      if (detail?.profileId !== profileId || detail.origin === "restore") return;
      localRevision++;
      if (timer) clearTimeout(timer);
      setStatus(navigator.onLine ? "saving" : "offline");
      timer = setTimeout(() => void refresh(true), 800);
      void syncEvents(false);
    };
    const onOnline = () => { void refresh(false); void syncEvents(); };
    const onOffline = () => setStatus("offline");
    window.addEventListener("learn-japanese:state-changed", onChange);
    window.addEventListener("online", onOnline); window.addEventListener("offline", onOffline);
    void refresh(false);
    void syncEvents();
    return () => { active = false; if (timer) clearTimeout(timer); if (retryTimer) clearTimeout(retryTimer); window.removeEventListener("learn-japanese:state-changed", onChange); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [cloudAdapter, profileId]);

  async function mergeSaves() {
    if (!cloud || !cloudAdapter || !local) return;
    setStatus("saving");
    try {
      const merged = mergeProfileSnapshots(local, cloud, profileId);
      await applyMergedProfileSnapshot(profileId, merged);
      const repos = await openLocalRepositories(undefined, profileId);
      try {
        for (const rawEvent of merged.state.reviewEvents ?? []) {
          const event = { ...rawEvent, id: String(rawEvent.id).replace(/^(review|practice|confusion|fluency)-(?=[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$)/i, "") };
          if (!(await repos.reviews.get(event.id))) await repos.reviews.append(event as never);
        }
      }
      finally { repos.close(); }
      await syncReviewEventHistory(cloudAdapter, profileId);
      const latest = await cloudAdapter.read(CLOUD_PROFILE_IDS[profileId]);
      const validLatest = latest ? validateCloudDocument(latest, profileId) : undefined;
      if (validLatest && validLatest.revision !== cloud.revision) throw new CloudSaveConflictError();
      const submitted = { profileId: CLOUD_PROFILE_IDS[profileId], revision: (validLatest?.revision ?? 0) + 1, schemaVersion: CLOUD_SAVE_SCHEMA_VERSION, updatedAt: merged.updatedAt ?? new Date().toISOString(), state: boundedCloudState(merged.state) };
      const written = validateCloudSaveAcknowledgement(await cloudAdapter.write(submitted, validLatest?.revision ?? 0), profileId, submitted);
      saveCloudMetadata(profileId, written.revision, written.schemaVersion);
      setLocal(await readProfileSnapshot(profileId)); setCloud(written); setStatus("saved"); setMessage("");
    } catch (error) { setStatus("conflict"); setMessage(error instanceof TypeError ? "Cloud save could not be merged. This device's data is preserved." : "Save changed during merge. Compare again."); }
  }

  async function retryReviews() {
    if (!cloudAdapter) return;
    await retryPendingReviewEvents(profileId);
    await syncReviewEventHistory(cloudAdapter, profileId, false).then((result) => setPendingReviews(result.remaining));
  }

  const label = status === "saved" ? "Saved" : status === "saving" ? "Saving" : status === "offline" ? "Offline" : status === "conflict" ? "Conflict" : "Device only";
  return <section className="save-status" aria-live="polite">
    <div><strong>{label}</strong>{status === "unavailable" && <p>Cloud saves are not configured.</p>}{status === "conflict" && <><p>Review histories will be merged when compatible.</p><div className="save-actions">{cloud && local && <button type="button" onClick={() => void mergeSaves()}>Merge saves</button>}</div></>}{pendingReviews > 0 && <button type="button" onClick={() => void retryReviews()}>Retry pending reviews</button>}{message && <p role="alert">{message}</p>}</div>
  </section>;
}
