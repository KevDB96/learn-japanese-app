/** Stable IDs use this one rule throughout the canonical content graph. */
export type ContentId = string & { readonly __contentId: unique symbol };

export const CONTENT_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export interface ContentMetadata {
  readonly schemaVersion: number;
  readonly contentVersion: string;
}

export interface Course {
  readonly id: ContentId;
  readonly display: string;
  readonly unitIds: readonly ContentId[];
  readonly startLessonIds: readonly ContentId[];
}

export interface Unit {
  readonly id: ContentId;
  readonly display: string;
  readonly lessonIds: readonly ContentId[];
}

export type Module = Unit;

export interface Lesson {
  readonly id: ContentId;
  readonly display: string;
  readonly requires: readonly ContentId[];
  readonly introduces: readonly ContentId[];
  readonly reinforces: readonly ContentId[];
  readonly blocks: readonly LessonBlock[];
}

export interface Concept {
  readonly id: ContentId;
  readonly display: string;
  readonly reading: string;
  readonly translation: string;
}

export interface Sentence {
  readonly id: ContentId;
  readonly display: string;
  readonly reading: string;
  readonly translation: string;
}

export type LessonBlock =
  | { readonly id: ContentId; readonly kind: "text"; readonly display: string; readonly translation: string }
  | { readonly id: ContentId; readonly kind: "concept-ref"; readonly conceptId: ContentId }
  | { readonly id: ContentId; readonly kind: "sentence-ref"; readonly sentenceId: ContentId };

export interface ContentCatalog {
  readonly metadata: ContentMetadata;
  readonly courses: readonly Course[];
  readonly units: readonly Unit[];
  readonly lessons: readonly Lesson[];
  readonly concepts: readonly Concept[];
  readonly sentences: readonly Sentence[];
}
