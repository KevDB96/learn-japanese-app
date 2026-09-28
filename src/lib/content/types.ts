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

/** A canonical kana identity. Review cards are generated from this concept, never stored as new concepts. */
export interface KanaConcept {
  readonly id: ContentId;
  readonly script: "hiragana" | "katakana";
  readonly glyph: string;
  readonly romanization: string;
  readonly row: string;
  readonly order: number;
  readonly form: "base" | "marked" | "contracted" | "small";
  readonly componentIds: readonly ContentId[];
  /** False for productive combinations that are taught for reading, not scheduled as separate cards. */
  readonly reviewEligible?: boolean;
  readonly audioId?: string;
}

export type KanaReviewFormKind = "glyph-to-sound" | "sound-to-glyph" | "audio-to-glyph";
export interface KanaReviewForm {
  readonly id: string;
  readonly kind: KanaReviewFormKind;
  readonly prompt: "glyph" | "sound" | "audio";
  readonly answer: "sound" | "glyph";
}

export interface PronunciationManifest {
  readonly version: number;
  readonly entries: readonly { readonly id: string; readonly provider: string; readonly asset?: string; readonly text?: string }[];
}

export interface Sentence {
  readonly id: ContentId;
  readonly display: string;
  readonly reading: string;
  readonly translation: string;
}

export type LessonBlock =
  | { readonly id: ContentId; readonly kind: "heading"; readonly text: string; readonly level?: 2 | 3 }
  | { readonly id: ContentId; readonly kind: "paragraph"; readonly text: string }
  | { readonly id: ContentId; readonly kind: "japanese-example"; readonly japanese: string; readonly reading?: string; readonly translation?: string }
  | { readonly id: ContentId; readonly kind: "callout"; readonly title?: string; readonly text: string }
  | { readonly id: ContentId; readonly kind: "kana-grid"; readonly title: string; readonly characters: readonly { readonly kana: string; readonly reading: string }[] }
  | { readonly id: ContentId; readonly kind: "character-comparison"; readonly title: string; readonly pairs: readonly { readonly hiragana: string; readonly katakana: string; readonly reading: string }[] }
  | { readonly id: ContentId; readonly kind: "vocabulary-list"; readonly title?: string; readonly items: readonly { readonly japanese: string; readonly reading: string; readonly translation: string }[] }
  | { readonly id: ContentId; readonly kind: "grammar-breakdown"; readonly title?: string; readonly japanese: string; readonly reading?: string; readonly translation: string; readonly parts: readonly { readonly text: string; readonly reading?: string; readonly meaning: string }[] }
  | { readonly id: ContentId; readonly kind: "audio"; readonly reference: string; readonly label: string }
  | { readonly id: ContentId; readonly kind: "exercise-slot"; readonly title: string; readonly exercises: readonly ExerciseDefinition[] }
  | { readonly id: ContentId; readonly kind: "checkpoint"; readonly title: string; readonly points: readonly string[] }
  | { readonly id: ContentId; readonly kind: "text"; readonly display: string; readonly translation: string }
  | { readonly id: ContentId; readonly kind: "concept-ref"; readonly conceptId: ContentId }
  | { readonly id: ContentId; readonly kind: "sentence-ref"; readonly sentenceId: ContentId };

export interface ExerciseFeedback { readonly success: string; readonly explanation: string }
interface ExerciseBase { readonly id: ContentId; readonly prompt: string; readonly feedback: ExerciseFeedback }
export type ExerciseDefinition =
  | (ExerciseBase & { readonly type: "multiple-choice"; readonly options: readonly string[]; readonly answer: string })
  | (ExerciseBase & { readonly type: "character-selection"; readonly options: readonly string[]; readonly answer: string })
  | (ExerciseBase & { readonly type: "short-text"; readonly answer: string; readonly acceptedAnswers?: readonly string[]; readonly normalizeWhitespace?: boolean });

export interface ContentCatalog {
  readonly metadata: ContentMetadata;
  readonly courses: readonly Course[];
  readonly units: readonly Unit[];
  readonly lessons: readonly Lesson[];
  readonly concepts: readonly Concept[];
  readonly sentences: readonly Sentence[];
}
