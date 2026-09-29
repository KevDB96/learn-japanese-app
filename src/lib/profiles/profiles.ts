import type { LearnerProfileId } from "../storage/types.ts";

export const PROFILES = [
  { id: "kevin", name: "Kevin", theme: "kevin" },
  { id: "janne", name: "Janne", theme: "janne" },
] as const satisfies readonly { id: LearnerProfileId; name: string; theme: string }[];

const LAST_PROFILE_KEY = "learn-japanese.last-profile";

export function getLastSelectedProfile(storage: Pick<Storage, "getItem"> = localStorage): LearnerProfileId | undefined {
  const value = storage.getItem(LAST_PROFILE_KEY);
  return value === "kevin" || value === "janne" ? value : undefined;
}

export function rememberProfile(profileId: LearnerProfileId, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(LAST_PROFILE_KEY, profileId);
}

export function profileTheme(profileId: LearnerProfileId) {
  return PROFILES.find((profile) => profile.id === profileId)!.theme;
}
