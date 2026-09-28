import type { AppMetadata, DeviceMetadata } from "./types";
import { STORAGE_DATABASE_NAME, STORAGE_SCHEMA_VERSION } from "./types";

export const STORE_NAMES = [
  "profiles", "settings", "lessonProgress", "conceptStates", "reviewEvents",
  "pendingSync", "appMetadata", "deviceMetadata", "reviewStates",
] as const;
export type StoreName = (typeof STORE_NAMES)[number];

type Migration = (db: IDBDatabase, transaction: IDBTransaction) => void;

/** Add one migration per schema version. A migration only runs when upgrading to that version. */
export const migrations: Readonly<Record<number, Migration>> = {
  1(db, transaction) {
    for (const name of STORE_NAMES.filter((name) => name !== "reviewStates")) {
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
    }
    const now = new Date().toISOString();
    const app: AppMetadata = { id: "app", recordVersion: 1, updatedAt: now, contentVersion: "0", contentSchemaVersion: 1 };
    const device: DeviceMetadata = { id: "device", recordVersion: 1, updatedAt: now, deviceId: "", registeredAt: now };
    transaction.objectStore("appMetadata").put(app);
    transaction.objectStore("deviceMetadata").put(device);
  },
  2(db) {
    if (!db.objectStoreNames.contains("reviewStates")) db.createObjectStore("reviewStates", { keyPath: "id" });
  },
};

export function openLocalDatabase(name = STORAGE_DATABASE_NAME): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, STORAGE_SCHEMA_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction;
      if (!transaction) { request.onerror = () => reject(request.error); return; }
      for (let version = (event as IDBVersionChangeEvent).oldVersion + 1; version <= STORAGE_SCHEMA_VERSION; version++) {
        const migration = migrations[version];
        if (!migration) { transaction.abort(); reject(new Error(`Missing storage migration ${version}`)); return; }
        migration(db, transaction);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open local database"));
    request.onblocked = () => reject(new Error("Local database upgrade is blocked by another connection"));
  });
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export async function withStore<T>(
  db: IDBDatabase,
  name: StoreName,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const transaction = db.transaction(name, mode);
  const completed = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
  const resultPromise = requestResult(action(transaction.objectStore(name)));
  const [result] = await Promise.all([resultPromise, completed]);
  return result;
}
