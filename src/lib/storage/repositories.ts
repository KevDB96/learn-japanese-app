import type { AppMetadata, ConceptState, DeviceMetadata, LearnerProfileId, LessonProgress, LocalProfile, PendingSyncOperation, ReviewCardState, ReviewEvent, UserSettings } from "./types";
import type { StoreName } from "./database";
import { openLocalDatabase, withStore } from "./database";
import { applyReviewEvent, createSrsState, rebuildSrsState, selectDueReviews, type ReviewRating, type SchedulingReviewEvent, type SrsState } from "../../features/review/srs.ts";

export interface Repository<T extends { readonly id: string }> {
  get(id: string): Promise<T | undefined>;
  put(value: T): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<T[]>;
}

const PROFILE_STORES = new Set<StoreName>(["settings", "lessonProgress", "conceptStates", "reviewEvents", "reviewStates", "pendingSync"]);
const storageId = (profileId: LearnerProfileId, id: string) => `${profileId}::${id}`;
function changed(profileId: LearnerProfileId) { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("learn-japanese:state-changed", { detail: { profileId } })); }

function repository<T extends { readonly id: string; readonly profileId?: LearnerProfileId }>(db: IDBDatabase, store: StoreName, profileId: LearnerProfileId): Repository<T> {
  const scoped = PROFILE_STORES.has(store);
  return {
    async get(id) { const value = await withStore<T | undefined>(db, store, "readonly", (s) => s.get(scoped ? storageId(profileId, id) : id)); return value ? { ...value, id, ...(scoped ? { profileId } : {}) } : undefined; },
    async put(value) { await withStore(db, store, "readwrite", (s) => s.put(scoped ? { ...value, id: storageId(profileId, value.id), profileId } : value)); if (scoped) changed(profileId); },
    async delete(id) { await withStore(db, store, "readwrite", (s) => s.delete(scoped ? storageId(profileId, id) : id)); if (scoped) changed(profileId); },
    async list() { const values = await withStore<T[]>(db, store, "readonly", (s) => s.getAll()); return (scoped ? values.filter((value) => value.profileId === profileId) : values).map((value) => scoped ? { ...value, id: value.id.slice(profileId.length + 2) } : value); },
  };
}

export function createRepositories(db: IDBDatabase, profileId: LearnerProfileId = "kevin") {
  return {
    profiles: repository<LocalProfile>(db, "profiles", profileId),
    settings: repository<UserSettings>(db, "settings", profileId),
    lessonProgress: repository<LessonProgress>(db, "lessonProgress", profileId),
    conceptStates: repository<ConceptState>(db, "conceptStates", profileId),
    pendingSync: repository<PendingSyncOperation>(db, "pendingSync", profileId),
    appMetadata: repository<AppMetadata>(db, "appMetadata", profileId),
    deviceMetadata: repository<DeviceMetadata>(db, "deviceMetadata", profileId),
    reviews: {
      async get(id: string) { const event = await withStore<ReviewEvent | undefined>(db, "reviewEvents", "readonly", (s) => s.get(storageId(profileId, id))); return event ? { ...event, id } : undefined; },
      async delete(id: string) { await withStore(db, "reviewEvents", "readwrite", (s) => s.delete(storageId(profileId, id))); changed(profileId); },
      async list() { return (await withStore<ReviewEvent[]>(db, "reviewEvents", "readonly", (s) => s.getAll())).filter((event) => event.profileId === profileId).map((event) => ({ ...event, id: event.id.slice(profileId.length + 2) })); },
      /** add() is intentionally used instead of put(): duplicate event IDs reject and never overwrite. */
      async append(event: ReviewEvent, queueSync = true) {
        const tx = db.transaction(queueSync ? ["reviewEvents", "pendingSync"] : ["reviewEvents"], "readwrite");
        tx.objectStore("reviewEvents").add({ ...event, id: storageId(profileId, event.id), profileId });
        if (queueSync) tx.objectStore("pendingSync").put({ id: storageId(profileId, `review-event::${event.id}`), profileId, recordVersion: 1, updatedAt: event.reviewedAt, operation: "review-event", entityId: event.id, payload: { ...event, profileId } });
        await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error ?? new Error("Review append failed")); tx.onabort = () => reject(tx.error ?? new Error("Review append aborted")); });
        changed(profileId);
      },
      async getStates() { return (await withStore<ReviewCardState[]>(db, "reviewStates", "readonly", (s) => s.getAll())).filter((state) => state.profileId === profileId).map((state) => ({ ...state, id: state.id.slice(profileId.length + 2) })); },
      async due(now: number) { return selectDueReviews(await this.getStates(), now); },
      async introduce(conceptId: string, at: number, cardId = conceptId) {
        const state = createSrsState(conceptId, at);
        const scopedCardId = storageId(profileId, cardId);
        const tx = db.transaction("reviewStates", "readwrite");
        const store = tx.objectStore("reviewStates");
        const existing = store.get(scopedCardId);
        existing.onsuccess = () => {
          if (!existing.result) store.add({ id: scopedCardId, profileId, recordVersion: 1, updatedAt: new Date(at).toISOString(), conceptId, cardId, state } satisfies ReviewCardState);
        };
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => { if (!existing.result) changed(profileId); resolve(); };
          tx.onerror = () => reject(tx.error ?? new Error("Review introduction failed"));
          tx.onabort = () => reject(tx.error ?? new Error("Review introduction aborted"));
        });
      },
      async record(input: { id: string; conceptId: string; cardId: string; rating: ReviewRating; reviewedAt: string; sessionId?: string; kind?: "scheduled-review" | "practice"; confusedConceptId?: string; contrastConceptId?: string; responseTimeMs?: number }) {
        const kind = input.kind ?? "scheduled-review";
        const eventId = input.id.replace(/^(review|practice|confusion|fluency)-(?=[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$)/i, "");
        const event: ReviewEvent = {
          id: storageId(profileId, eventId), profileId, recordVersion: 1, updatedAt: input.reviewedAt, conceptId: input.conceptId,
          cardId: input.cardId, reviewedAt: input.reviewedAt,
          rating: ({ Forgot: "again", Hard: "hard", "Got It": "good", Easy: "easy" } as const)[input.rating],
          kind, ...(input.sessionId ? { sessionId: input.sessionId } : {}), ...(input.confusedConceptId ? { confusedConceptId: input.confusedConceptId } : {}), ...(input.contrastConceptId ? { contrastConceptId: input.contrastConceptId } : {}), ...(Number.isFinite(input.responseTimeMs) && input.responseTimeMs! > 0 ? { responseTimeMs: input.responseTimeMs } : {}),
        };
        const scheduled: SchedulingReviewEvent = { ...input, kind };
        const tx = db.transaction(["reviewEvents", "reviewStates", "pendingSync"], "readwrite");
        const events = tx.objectStore("reviewEvents");
        const states = tx.objectStore("reviewStates");
        const existing = events.get(event.id);
        existing.onsuccess = () => {
          if (existing.result) return;
          const stateRequest = states.get(storageId(profileId, input.cardId));
          stateRequest.onsuccess = () => {
            events.add(event);
            tx.objectStore("pendingSync").put({ id: storageId(profileId, `review-event::${eventId}`), profileId, recordVersion: 1, updatedAt: input.reviewedAt, operation: "review-event", entityId: eventId, payload: { ...event, id: eventId, profileId } });
            const next: SrsState | undefined = applyReviewEvent(stateRequest.result?.state, scheduled);
            if (next) states.put({ id: storageId(profileId, input.cardId), profileId, recordVersion: 1, updatedAt: input.reviewedAt, conceptId: input.conceptId, cardId: input.cardId, state: next } satisfies ReviewCardState);
          };
        };
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => { changed(profileId); resolve(); };
          tx.onerror = () => reject(tx.error ?? new Error("Review transaction failed"));
          tx.onabort = () => reject(tx.error ?? new Error("Review transaction aborted"));
        });
      },
      async rebuild() {
        // Read the append-only source and repair its projection in one transaction, so
        // a concurrent append cannot land between the history snapshot and the write.
        const tx = db.transaction(["reviewEvents", "reviewStates"], "readwrite");
        const eventStore = tx.objectStore("reviewEvents");
        const stateStore = tx.objectStore("reviewStates");
        const grouped = new Map<string, ReviewEvent[]>();
        let result: ReviewCardState[] = [];
        const cursor = eventStore.openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (row) {
            const event = row.value as ReviewEvent;
            if (event.profileId === profileId && event.kind === "scheduled-review") {
              const group = grouped.get(event.cardId) ?? [];
              group.push(event); grouped.set(event.cardId, group);
            }
            row.continue();
            return;
          }
          const existingRequest = stateStore.getAll();
          existingRequest.onsuccess = () => {
            const existingStates = existingRequest.result as ReviewCardState[];
            const rebuilt: ReviewCardState[] = [];
            for (const [cardId, group] of grouped) {
              const conceptId = group[0]!.conceptId;
              if (group.some((event) => event.conceptId !== conceptId)) {
                tx.abort();
                return;
              }
              const domainEvents: SchedulingReviewEvent[] = group.map((event) => ({ ...event, rating: ({ again: "Forgot", hard: "Hard", good: "Got It", easy: "Easy" } as const)[event.rating] }));
              const state = rebuildSrsState(domainEvents, conceptId, cardId);
              if (state) rebuilt.push({ id: storageId(profileId, cardId), profileId, recordVersion: 1, updatedAt: state.lastReviewedAt ?? state.nextDueAt, conceptId, cardId, state });
            }
            const rebuiltById = new Map(rebuilt.map((state) => [state.id, state]));
            for (const old of existingStates) {
              if (old.profileId !== profileId) continue;
              const next = rebuiltById.get(old.id);
              if (next) {
                if (JSON.stringify(old) !== JSON.stringify(next)) stateStore.put(next);
              } else if (old.state.reviewCount > 0) stateStore.delete(old.id);
              else rebuilt.push(old);
            }
            result = rebuilt;
          };
        };
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => { changed(profileId); resolve(); };
          tx.onerror = () => reject(tx.error ?? new Error("Review rebuild failed"));
          tx.onabort = () => reject(tx.error ?? new Error("Review rebuild aborted"));
        });
        return result.map((state) => ({ ...state, id: state.cardId }));
      },
    },
  };
}

export async function openLocalRepositories(name?: string, profileId: LearnerProfileId = "kevin") {
  const db = await openLocalDatabase(name);
  return { db, ...createRepositories(db, profileId), close: () => db.close() };
}
