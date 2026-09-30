import type { AppMetadata, ConceptState, DeviceMetadata, LearnerProfileId, LessonProgress, LocalProfile, PendingSyncOperation, ReviewCardState, ReviewEvent, UserSettings } from "./types";
import type { StoreName } from "./database";
import { openLocalDatabase, withStore } from "./database";
import { applyReviewEvent, createSrsState, rebuildSrsState, selectDueReviews, type ReviewRating, type SchedulingReviewEvent, type SrsState } from "../../features/review/srs.ts";

export interface Repository<T extends { readonly id: string }> {
  get(id: string): Promise<T | undefined>;
  put(value: T): Promise<void>;
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
      async list() { return (await withStore<ReviewEvent[]>(db, "reviewEvents", "readonly", (s) => s.getAll())).filter((event) => event.profileId === profileId).map((event) => ({ ...event, id: event.id.slice(profileId.length + 2) })); },
      /** add() is intentionally used instead of put(): duplicate event IDs reject and never overwrite. */
      async append(event: ReviewEvent) { await withStore(db, "reviewEvents", "readwrite", (s) => s.add({ ...event, id: storageId(profileId, event.id), profileId })); changed(profileId); },
      async getStates() { return (await withStore<ReviewCardState[]>(db, "reviewStates", "readonly", (s) => s.getAll())).filter((state) => state.profileId === profileId).map((state) => ({ ...state, id: state.id.slice(profileId.length + 2) })); },
      async due(now: number) { return selectDueReviews(await this.getStates(), now); },
      async introduce(conceptId: string, at: number, cardId = conceptId) {
        const state = createSrsState(conceptId, at);
        const scopedCardId = storageId(profileId, cardId);
        const existing = await withStore<ReviewCardState | undefined>(db, "reviewStates", "readonly", (s) => s.get(scopedCardId));
        if (!existing) { await withStore(db, "reviewStates", "readwrite", (s) => s.add({ id: scopedCardId, profileId, recordVersion: 1, updatedAt: new Date(at).toISOString(), conceptId, cardId, state } satisfies ReviewCardState)); changed(profileId); }
      },
      async record(input: { id: string; conceptId: string; cardId: string; rating: ReviewRating; reviewedAt: string; sessionId?: string; kind?: "scheduled-review" | "practice"; confusedConceptId?: string; contrastConceptId?: string; responseTimeMs?: number }) {
        const kind = input.kind ?? "scheduled-review";
        const event: ReviewEvent = {
          id: storageId(profileId, input.id), profileId, recordVersion: 1, updatedAt: input.reviewedAt, conceptId: input.conceptId,
          cardId: input.cardId, reviewedAt: input.reviewedAt,
          rating: ({ Forgot: "again", Hard: "hard", "Got It": "good", Easy: "easy" } as const)[input.rating],
          kind, ...(input.sessionId ? { sessionId: input.sessionId } : {}), ...(input.confusedConceptId ? { confusedConceptId: input.confusedConceptId } : {}), ...(input.contrastConceptId ? { contrastConceptId: input.contrastConceptId } : {}), ...(Number.isFinite(input.responseTimeMs) && input.responseTimeMs! > 0 ? { responseTimeMs: input.responseTimeMs } : {}),
        };
        const scheduled: SchedulingReviewEvent = { ...input, kind };
        const tx = db.transaction(["reviewEvents", "reviewStates"], "readwrite");
        const events = tx.objectStore("reviewEvents");
        const states = tx.objectStore("reviewStates");
        const existing = events.get(event.id);
        existing.onsuccess = () => {
          if (existing.result) return;
          const stateRequest = states.get(storageId(profileId, input.cardId));
          stateRequest.onsuccess = () => {
            events.add(event);
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
          if (state) rebuilt.push({ id: storageId(profileId, cardId), profileId, recordVersion: 1, updatedAt: state.lastReviewedAt ?? state.nextDueAt, conceptId: first.conceptId, cardId, state });
        }
        const existingStates = await withStore<ReviewCardState[]>(db, "reviewStates", "readonly", (s) => s.getAll());
        const rebuiltById = new Map(rebuilt.map((state) => [state.cardId, state]));
        for (const old of existingStates) if (old.profileId === profileId && !rebuiltById.has(old.cardId) && old.state.reviewCount === 0) rebuilt.push(old);
        const tx = db.transaction("reviewStates", "readwrite");
        const store = tx.objectStore("reviewStates");
        for (const old of existingStates) if (old.profileId === profileId) store.delete(old.id);
        for (const state of rebuilt) store.put(state);
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => { changed(profileId); resolve(); }; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        });
        return rebuilt.map((state) => ({ ...state, id: state.cardId }));
      },
    },
  };
}

export async function openLocalRepositories(name?: string, profileId: LearnerProfileId = "kevin") {
  const db = await openLocalDatabase(name);
  return { db, ...createRepositories(db, profileId), close: () => db.close() };
}
