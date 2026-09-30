/** Persisted values are plain structured-cloneable DTOs with an explicit record version. */
export interface StoredRecord {
  readonly id: string;
  readonly recordVersion: number;
  readonly updatedAt: string;
}

export type LearnerProfileId = "kevin" | "janne";
/** Repositories always persist this field; optional here keeps pure-domain fixtures lightweight. */
export interface ProfileScopedRecord extends StoredRecord { readonly profileId?: LearnerProfileId }

export interface LocalProfile extends StoredRecord {
  readonly displayName?: string;
  readonly identityProvider?: string;
  readonly identitySubject?: string;
}

export interface UserSettings extends ProfileScopedRecord {
  readonly dailyGoal: number;
  readonly preferredReading: "kana" | "romaji";
}

export interface LessonProgress extends ProfileScopedRecord {
  readonly lessonId: string;
  readonly status: "not-started" | "in-progress" | "completed";
  readonly currentBlockId?: string;
  readonly currentStep?: number;
  readonly contentVersion?: string;
  readonly contentSchemaVersion?: number;
  readonly completedAt?: string;
}

export type ConceptLifecycle = "UNSEEN" | "INTRODUCED" | "LEARNING" | "FAMILIAR" | "MASTERED";

export interface ConceptState extends ProfileScopedRecord {
  readonly conceptId: string;
  readonly lifecycle?: ConceptLifecycle;
  readonly familiarity: number;
  readonly nextReviewAt?: string;
  readonly lastReviewedAt?: string;
}

export interface ReviewEvent extends ProfileScopedRecord {
  /** The reviewed concept and card are separate so multiple forms can schedule independently. */
  readonly conceptId: string;
  readonly cardId: string;
  readonly reviewedAt: string;
  readonly rating: "again" | "hard" | "good" | "easy";
  readonly kind: "scheduled-review" | "practice";
  readonly sessionId?: string;
  /** Time from card display to first answer, when measured reliably. */
  readonly responseTimeMs?: number;
  /** The kana selected instead of the reviewed/asked kana, when identifiable. */
  readonly confusedConceptId?: string;
  /** The competing concept tested by a successful contrast response, when known. */
  readonly contrastConceptId?: string;
}

export interface ReviewCardState extends ProfileScopedRecord {
  readonly conceptId: string;
  readonly cardId: string;
  readonly state: import("../../features/review/srs.ts").SrsState;
}

export interface PendingSyncOperation extends ProfileScopedRecord {
  readonly operation: string;
  readonly entityId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface AppMetadata extends StoredRecord {
  readonly contentVersion: string;
  readonly contentSchemaVersion: number;
}

export interface DeviceMetadata extends StoredRecord {
  readonly deviceId: string;
  readonly registeredAt: string;
}

export const STORAGE_SCHEMA_VERSION = 3;
export const STORAGE_DATABASE_NAME = "learn-japanese-local";
