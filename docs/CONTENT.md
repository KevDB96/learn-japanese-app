# Canonical content contract

The canonical catalog is `src/content/catalog.json`. Its `schemaVersion` describes the shape of the data and `contentVersion` identifies the curriculum release; both are independent of the app version. Update `schemaVersion` when the contract changes and `contentVersion` when publishing a content revision.

## IDs and references

Every course, unit, lesson, concept, sentence, and lesson block has an immutable ID matching `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`. IDs are unique across the entire catalog. Once content is published, keep its ID stable even if its display text changes. Use IDs in references; never use array positions or display strings.

Courses list their units and one or more starting lessons. Units list their lessons. Lessons always provide `requires`, `introduces`, and `reinforces` arrays. `requires` contains lesson IDs; the other arrays contain concept or sentence IDs. Prerequisites must form an acyclic graph, and every lesson assigned to a course must be reachable from that course's start lessons by satisfying prerequisites.

Lesson blocks currently support `text` (with `display` and `translation`), `concept-ref` (with `conceptId`), and `sentence-ref` (with `sentenceId`). Unknown kinds and broken references are errors. Concepts and sentences require non-empty `display`, `reading`, and `translation`; courses, units, lessons, and text blocks require non-empty display text (text blocks also require translation).

## Validate

Run this offline before committing content changes:

```sh
npm run content:validate
```

The same validator is used by the runtime registry and unit tests. Keep tests to small fixtures; the catalog is the canonical curriculum source.

## Kana concepts and review forms

Kana concepts use immutable content IDs and record script, glyph, Hepburn-style romanization, row/order, form (`base`, `marked`, `contracted`, or `small`), and component IDs. Review forms are reusable templates (`kana-glyph-to-sound`, `kana-sound-to-glyph`, and `kana-audio-to-glyph`); generated review-card IDs combine the kana concept ID and template ID, so review memory belongs to the concept/card pair. Audio IDs are logical references resolved through a versioned pronunciation manifest. Missing audio is reported by coverage and does not invalidate kana or review behavior. Browser speech synthesis is an optional pronunciation provider only.

Kana review fixtures live in `src/content/kana-fixtures.ts`. The base Hiragana and Katakana inventories are used to generate review cards; `npm run content:validate` validates both alongside the main catalog.
