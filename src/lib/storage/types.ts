/** Persisted values are plain structured-cloneable DTOs with an explicit record version. */
export interface StoredRecord {
  readonly id: string;
  readonly recordVersion: number;
  readonly updatedAt: string;
}

export interface LocalProfile extends StoredRecord {
  readonly displayName?: string;
  readonly identityProvider?: string;
  readonly identitySubject?: string;
}

export interface UserSettings extends StoredRecord {
  readonly dailyGoal: number;
  readonly preferredReading: "kana" | "romaji";
}

export interface LessonProgress extends StoredRecord {
  readonly lessonId: string;
  readonly status: "not-started" | "in-progress" | "completed";
  readonly currentBlockId?: string;
  readonly currentStep?: number;
  readonly contentVersion?: string;
  readonly contentSchemaVersion?: number;
  readonly completedAt?: string;
}

export type ConceptLifecycle = "UNSEEN" | "INTRODUCED" | "LEARNING" | "FAMILIAR" | "MASTERED";

export interface ConceptState extends StoredRecord {
  readonly conceptId: string;
  readonly lifecycle?: ConceptLifecycle;
  readonly familiarity: number;
  readonly nextReviewAt?: string;
  readonly lastReviewedAt?: string;
}

export interface ReviewEvent extends StoredRecord {
  /** The reviewed concept and card are separate so multiple forms can schedule independently. */
  readonly conceptId: string;
  readonly cardId: string;
  readonly reviewedAt: string;
  readonly rating: "again" | "hard" | "good" | "easy";
  readonly kind: "scheduled-review" | "practice";
  readonly sessionId?: string;
}

export interface ReviewCardState extends StoredRecord {
  readonly conceptId: string;
  readonly cardId: string;
  readonly state: import("../../features/review/srs.ts").SrsState;
}

export interface PendingSyncOperation extends StoredRecord {
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

export const STORAGE_SCHEMA_VERSION = 2;
export const STORAGE_DATABASE_NAME = "learn-japanese-local";
