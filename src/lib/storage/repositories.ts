import type { AppMetadata, ConceptState, DeviceMetadata, LessonProgress, LocalProfile, PendingSyncOperation, ReviewCardState, ReviewEvent, UserSettings } from "./types";
import type { StoreName } from "./database";
import { openLocalDatabase, withStore } from "./database";
import { applyReviewEvent, createSrsState, rebuildSrsState, selectDueReviews, type ReviewRating, type SchedulingReviewEvent, type SrsState } from "../../features/review/srs.ts";

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
      async getStates() { return withStore<ReviewCardState[]>(db, "reviewStates", "readonly", (s) => s.getAll()); },
      async due(now: number) { return selectDueReviews(await this.getStates(), now); },
      async introduce(conceptId: string, at: number) {
        const state = createSrsState(conceptId, at);
        const cardId = conceptId;
        const existing = await withStore<ReviewCardState | undefined>(db, "reviewStates", "readonly", (s) => s.get(cardId));
        if (!existing) await withStore(db, "reviewStates", "readwrite", (s) => s.add({ id: cardId, recordVersion: 1, updatedAt: new Date(at).toISOString(), conceptId, cardId, state } satisfies ReviewCardState));
      },
      async record(input: { id: string; conceptId: string; cardId: string; rating: ReviewRating; reviewedAt: string; sessionId?: string; kind?: "scheduled-review" | "practice"; confusedConceptId?: string }) {
        const kind = input.kind ?? "scheduled-review";
        const event: ReviewEvent = {
          id: input.id, recordVersion: 1, updatedAt: input.reviewedAt, conceptId: input.conceptId,
          cardId: input.cardId, reviewedAt: input.reviewedAt,
          rating: ({ Forgot: "again", Hard: "hard", "Got It": "good", Easy: "easy" } as const)[input.rating],
          kind, ...(input.sessionId ? { sessionId: input.sessionId } : {}), ...(input.confusedConceptId ? { confusedConceptId: input.confusedConceptId } : {}),
        };
        const scheduled: SchedulingReviewEvent = { ...input, kind };
        const tx = db.transaction(["reviewEvents", "reviewStates"], "readwrite");
        const events = tx.objectStore("reviewEvents");
        const states = tx.objectStore("reviewStates");
        const existing = events.get(event.id);
        existing.onsuccess = () => {
          if (existing.result) return;
          const stateRequest = states.get(input.cardId);
          stateRequest.onsuccess = () => {
            events.add(event);
            const next: SrsState | undefined = applyReviewEvent(stateRequest.result?.state, scheduled);
            if (next) states.put({ id: input.cardId, recordVersion: 1, updatedAt: input.reviewedAt, conceptId: input.conceptId, cardId: input.cardId, state: next } satisfies ReviewCardState);
          };
        };
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error("Review transaction failed"));
          tx.onabort = () => reject(tx.error ?? new Error("Review transaction aborted"));
        });
      },
      async rebuild() {
        const events = await this.list();
        const grouped = new Map<string, ReviewEvent[]>();
        for (const event of events) if (event.kind === "scheduled-review") {
          const group = grouped.get(event.cardId) ?? [];
          group.push(event); grouped.set(event.cardId, group);
        }
        const rebuilt: ReviewCardState[] = [];
        for (const [cardId, group] of grouped) {
          const first = group[0]!;
          const domainEvents: SchedulingReviewEvent[] = group.map((event) => ({ ...event, rating: ({ again: "Forgot", hard: "Hard", good: "Got It", easy: "Easy" } as const)[event.rating] }));
          const state = rebuildSrsState(domainEvents, first.conceptId, cardId);
          if (state) rebuilt.push({ id: cardId, recordVersion: 1, updatedAt: state.lastReviewedAt ?? state.nextDueAt, conceptId: first.conceptId, cardId, state });
        }
        const existingStates = await withStore<ReviewCardState[]>(db, "reviewStates", "readonly", (s) => s.getAll());
        const rebuiltById = new Map(rebuilt.map((state) => [state.id, state]));
        for (const old of existingStates) if (!rebuiltById.has(old.id) && old.state.reviewCount === 0) rebuilt.push(old);
        const tx = db.transaction("reviewStates", "readwrite");
        const store = tx.objectStore("reviewStates");
        store.clear();
        for (const state of rebuilt) store.put(state);
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        });
        return rebuilt;
      },
    },
  };
}

export async function openLocalRepositories(name?: string) {
  const db = await openLocalDatabase(name);
  return { db, ...createRepositories(db), close: () => db.close() };
}
