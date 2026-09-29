import { useEffect, useState } from "react";
import type { LearnerProfileId } from "../../lib/storage/types.ts";
import { CLOUD_PROFILE_IDS, CLOUD_SAVE_SCHEMA_VERSION, CloudSaveConflictError, compareSaveMetadata, configuredCloudSave, type CloudSaveAdapter, type CloudSaveDocument, type SyncState } from "../../lib/sync/cloud-save.ts";
import { readProfileSnapshot, replaceProfileSnapshot } from "../../lib/sync/profile-snapshot.ts";

export function CloudSavePanel({ profileId, adapter }: { profileId: LearnerProfileId; adapter?: CloudSaveAdapter }) {
  const [cloudAdapter] = useState<CloudSaveAdapter | undefined>(() => adapter ?? configuredCloudSave());
  const [status, setStatus] = useState<SyncState>(cloudAdapter ? "saving" : "unavailable");
  const [cloud, setCloud] = useState<CloudSaveDocument>();
  const [local, setLocal] = useState<Awaited<ReturnType<typeof readProfileSnapshot>>>();
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!cloudAdapter) { setStatus("unavailable"); return; }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let known: CloudSaveDocument | undefined;
    const refresh = async (allowWrite: boolean) => {
      try {
        const snapshot = await readProfileSnapshot(profileId);
        const remote = await cloudAdapter.read(CLOUD_PROFILE_IDS[profileId]);
        if (!active) return;
        const previouslyKnown = known;
        setLocal(snapshot); setCloud(remote); known = remote;
        if (remote && !allowWrite && (snapshot.updatedAt ? compareSaveMetadata(snapshot, remote) !== "same" : true)) { setStatus("conflict"); return; }
        if (allowWrite && remote && !previouslyKnown && (!snapshot.updatedAt || compareSaveMetadata(snapshot, remote) !== "same")) { setStatus("conflict"); return; }
        if (allowWrite && remote && previouslyKnown && remote.revision !== previouslyKnown.revision) { setStatus("conflict"); return; }
        if (!navigator.onLine) { setStatus("offline"); return; }
        if (allowWrite && snapshot.updatedAt) {
          setStatus("saving");
          const written = await cloudAdapter.write({ profileId: CLOUD_PROFILE_IDS[profileId], revision: (remote?.revision ?? 0) + 1, schemaVersion: CLOUD_SAVE_SCHEMA_VERSION, updatedAt: snapshot.updatedAt, state: snapshot.state }, remote?.revision ?? 0);
          if (active) { known = written; setCloud(written); setStatus("saved"); }
        } else if (!remote && snapshot.updatedAt) { setStatus("saving"); timer = setTimeout(() => void refresh(true), 800); }
        else setStatus("saved");
      } catch (error) { if (active) setStatus(error instanceof CloudSaveConflictError ? "conflict" : "offline"); }
    };
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ profileId: string; origin?: string }>).detail;
      if (detail?.profileId !== profileId || detail.origin === "restore") return;
      if (timer) clearTimeout(timer);
      setStatus(navigator.onLine ? "saving" : "offline");
      timer = setTimeout(() => void refresh(true), 800);
    };
    const onOnline = () => void refresh(false);
    const onOffline = () => setStatus("offline");
    window.addEventListener("learn-japanese:state-changed", onChange);
    window.addEventListener("online", onOnline); window.addEventListener("offline", onOffline);
    void refresh(false);
    return () => { active = false; if (timer) clearTimeout(timer); window.removeEventListener("learn-japanese:state-changed", onChange); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [cloudAdapter, profileId]);

  async function keepThisDevice() {
    if (!cloudAdapter || !local) return;
    setStatus("saving");
    try {
      const latest = await cloudAdapter.read(CLOUD_PROFILE_IDS[profileId]);
      const result = await cloudAdapter.write({ profileId: CLOUD_PROFILE_IDS[profileId], revision: (latest?.revision ?? 0) + 1, schemaVersion: CLOUD_SAVE_SCHEMA_VERSION, updatedAt: local.updatedAt ?? new Date().toISOString(), state: local.state }, latest?.revision ?? 0);
      setCloud(result); setStatus("saved"); setMessage("");
    } catch { setStatus("conflict"); setMessage("Save changed. Compare again."); }
  }
  async function useCloud() {
    if (!cloud) return;
    setStatus("saving");
    try { await replaceProfileSnapshot(profileId, cloud.state); setLocal(await readProfileSnapshot(profileId)); setStatus("saved"); setMessage(""); }
    catch { setStatus("conflict"); setMessage("Could not restore cloud save."); }
  }

  const label = status === "saved" ? "Saved" : status === "saving" ? "Saving" : status === "offline" ? "Offline" : status === "conflict" ? "Conflict" : "Device only";
  return <section className="save-status" aria-live="polite">
    <div><strong>{label}</strong>{status === "unavailable" && <p>Cloud saves are not configured.</p>}{status === "conflict" && <><p>Choose which save to keep.</p><div className="save-actions"><button type="button" onClick={() => void keepThisDevice()}>Keep this device</button>{cloud && <button type="button" onClick={() => void useCloud()}>Use cloud</button>}</div></>}{message && <p role="alert">{message}</p>}</div>
  </section>;
}
