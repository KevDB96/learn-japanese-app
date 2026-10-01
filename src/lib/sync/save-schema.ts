import type { CloudSavePayload } from "./cloud-save.ts";

/** Versioned format shared by local profile snapshots, exports and cloud saves. */
export const PROFILE_SAVE_SCHEMA_VERSION = 1;

type SaveMigration = (state: CloudSavePayload) => CloudSavePayload;

/** Keys are the schema version produced by each deterministic migration. */
export const profileSaveMigrations: Readonly<Record<number, SaveMigration>> = {
  1(state) {
    const stores = ["settings", "lessonProgress", "conceptStates", "reviewEvents", "reviewStates", "pendingSync"] as const;
    return Object.fromEntries(stores.map((store) => [store, state[store] ?? []]));
  },
};

export function migrateProfileSave(schemaVersion: number, state: CloudSavePayload): CloudSavePayload {
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1 || schemaVersion > PROFILE_SAVE_SCHEMA_VERSION) {
    throw new TypeError("Profile save version is not supported. Data is preserved; export this profile and restore it with a compatible app version.");
  }
  let migrated = state;
  for (let version = schemaVersion; version <= PROFILE_SAVE_SCHEMA_VERSION; version++) {
    const migration = profileSaveMigrations[version];
    if (!migration) throw new TypeError(`Missing profile save migration ${version}`);
    migrated = migration(migrated);
  }
  return migrated;
}
