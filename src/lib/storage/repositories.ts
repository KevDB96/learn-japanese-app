import type { AppMetadata, ConceptState, DeviceMetadata, LessonProgress, LocalProfile, PendingSyncOperation, ReviewEvent, UserSettings } from "./types";
import type { StoreName } from "./database";
import { openLocalDatabase, withStore } from "./database";

export interface Repository<T extends { readonly id: string }> {
  get(id: string): Promise<T | undefined>;
  put(value: T): Promise<void>;
  list(): Promise<T[]>;
}

function repository<T extends { readonly id: string }>(db: IDBDatabase, store: StoreName): Repository<T> {
  return {
    async get(id) { return (await withStore<T | undefined>(db, store, "readonly", (s) => s.get(id))) ?? undefined; },
    async put(value) { await withStore(db, store, "readwrite", (s) => s.put(value)); },
    async list() { return withStore<T[]>(db, store, "readonly", (s) => s.getAll()); },
  };
}

export function createRepositories(db: IDBDatabase) {
  return {
    profiles: repository<LocalProfile>(db, "profiles"),
    settings: repository<UserSettings>(db, "settings"),
    lessonProgress: repository<LessonProgress>(db, "lessonProgress"),
    conceptStates: repository<ConceptState>(db, "conceptStates"),
    pendingSync: repository<PendingSyncOperation>(db, "pendingSync"),
    appMetadata: repository<AppMetadata>(db, "appMetadata"),
    deviceMetadata: repository<DeviceMetadata>(db, "deviceMetadata"),
    reviews: {
      async get(id: string) { return withStore<ReviewEvent | undefined>(db, "reviewEvents", "readonly", (s) => s.get(id)); },
      async list() { return withStore<ReviewEvent[]>(db, "reviewEvents", "readonly", (s) => s.getAll()); },
      /** add() is intentionally used instead of put(): duplicate event IDs reject and never overwrite. */
      async append(event: ReviewEvent) { await withStore(db, "reviewEvents", "readwrite", (s) => s.add(event)); },
    },
  };
}

export async function openLocalRepositories(name?: string) {
  const db = await openLocalDatabase(name);
  return { db, ...createRepositories(db), close: () => db.close() };
}
