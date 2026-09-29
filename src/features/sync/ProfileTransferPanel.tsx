import { useRef, useState } from "react";
import type { LearnerProfileId } from "../../lib/storage/types.ts";
import { exportProfile, importProfile, validateProfileExport } from "../../lib/sync/profile-transfer.ts";

const names = { kevin: "Kevin", janne: "Janne" } as const;

export function ProfileTransferPanel({ profileId }: { profileId: LearnerProfileId }) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true); setMessage("");
    try {
      const file = await exportProfile(profileId, names[profileId]);
      const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `japanese-garden-${profileId}-profile.json`; anchor.click();
      URL.revokeObjectURL(url);
      setMessage(`${names[profileId]}'s profile exported.`);
    } catch { setMessage(`Could not export ${names[profileId]}'s profile.`); }
    finally { setBusy(false); }
  }

  async function selectFile(file?: File) {
    if (!file) return;
    setBusy(true); setMessage("");
    try {
      const parsed: unknown = JSON.parse(await file.text());
      validateProfileExport(parsed, profileId);
      await importProfile(parsed, profileId);
      setMessage(`${names[profileId]}'s profile restored.`);
    } catch (error) {
      setMessage(error instanceof SyntaxError ? "This file is not valid JSON." : error instanceof Error ? error.message : "Could not restore this profile.");
    } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  return <section className="save-status profile-transfer" aria-labelledby="profile-transfer-title">
    <div>
      <strong id="profile-transfer-title">{names[profileId]}'s backup</strong>
      <p>Export or restore this profile on any device.</p>
      <div className="save-actions">
        <button type="button" disabled={busy} onClick={() => void download()}>Export profile</button>
        <button type="button" disabled={busy} onClick={() => input.current?.click()}>Import profile</button>
        <input ref={input} type="file" accept="application/json,.json" aria-label={`Choose ${names[profileId]}'s profile file`} onChange={(event) => void selectFile(event.currentTarget.files?.[0])} hidden />
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  </section>;
}
