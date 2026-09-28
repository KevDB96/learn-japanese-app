import { describe, expect, it } from "vitest";
import { createContentRegistry, ContentValidationError, loadContent } from "./registry.ts";
import { validateContent } from "./validator.ts";
import type { ContentCatalog, ContentId, Concept, Lesson, Unit } from "./types.ts";

const id = (value: string) => value as ContentId;
const valid: ContentCatalog = {
  metadata: { schemaVersion: 1, contentVersion: "test-1" },
  courses: [{ id: id("course-main"), display: "Course", unitIds: [id("unit-start")], startLessonIds: [id("lesson-one")] }],
  units: [{ id: id("unit-start"), display: "Unit", lessonIds: [id("lesson-one"), id("lesson-two")] }],
  lessons: [
    { id: id("lesson-one"), display: "First", requires: [], introduces: [id("concept-one")], reinforces: [], blocks: [{ id: id("block-one"), kind: "concept-ref", conceptId: id("concept-one") }] },
    { id: id("lesson-two"), display: "Next", requires: [id("lesson-one")], introduces: [], reinforces: [id("sentence-one")], blocks: [{ id: id("block-two"), kind: "sentence-ref", sentenceId: id("sentence-one") }] },
  ],
  concepts: [{ id: id("concept-one"), display: "猫", reading: "ねこ", translation: "cat" }],
  sentences: [{ id: id("sentence-one"), display: "猫です。", reading: "ねこです。", translation: "It is a cat." }],
};

const copy = (): ContentCatalog => structuredClone(valid);
const replaceLesson = (catalog: ContentCatalog, index: number, lesson: Lesson) => ((catalog.lessons as Lesson[])[index] = lesson);

describe("content validation and registry", () => {
  it("loads a valid fixture deterministically and freezes it", () => {
    const first = createContentRegistry(copy());
    const second = createContentRegistry(copy());
    expect(first.content).toEqual(second.content);
    expect(first.get(id("concept-one"))).toEqual(valid.concepts[0]);
    expect(Object.isFrozen(first.content.lessons[0])).toBe(true);
  });

  it("rejects duplicate IDs across the graph", () => {
    const fixture = copy();
    replaceLesson(fixture, 1, { ...fixture.lessons[1], id: id("concept-one") });
    expect(validateContent(fixture).join("\n")).toContain('concepts[0].id duplicates lessons[1] (concept-one)');
  });

  it("reports broken references and missing prerequisites", () => {
    const fixture = copy();
    replaceLesson(fixture, 0, { ...fixture.lessons[0], requires: [id("lesson-absent")] });
    replaceLesson(fixture, 1, { ...fixture.lessons[1], introduces: [id("not-a-concept")] });
    const result = validateContent(fixture).join("\n");
    expect(result).toContain('lessons[0].requires references missing lesson prerequisite "lesson-absent"');
    expect(result).toContain('lessons[1].introduces references missing concept or sentence "not-a-concept"');
  });

  it("rejects lesson dependency cycles", () => {
    const fixture = copy();
    replaceLesson(fixture, 0, { ...fixture.lessons[0], requires: [id("lesson-two")] });
    const result = validateContent(fixture).join("\n");
    expect(result).toContain("lesson dependency cycle:");
  });

  it("rejects lessons unreachable from a course start", () => {
    const fixture = copy();
    replaceLesson(fixture, 1, { ...fixture.lessons[1], requires: [id("lesson-orphan-prereq")] });
    const result = validateContent(fixture).join("\n");
    expect(result).toContain('course "course-main" cannot reach lesson "lesson-two"');
  });

  it("rejects lessons that are not assigned to a course", () => {
    const fixture = copy();
    (fixture.units as Unit[])[0] = { ...fixture.units[0], lessonIds: [id("lesson-one")] };
    expect(validateContent(fixture)).toContain('lesson "lesson-two" is not assigned to any course');
  });

  it("rejects unknown block kinds and missing required text fields", () => {
    const fixture = copy();
    replaceLesson(fixture, 0, { ...fixture.lessons[0], blocks: [
      { id: id("block-one"), kind: "mystery", display: "?" } as never,
      { id: id("block-three"), kind: "text", display: "" } as never,
    ] as never });
    const errors = validateContent(fixture);
    expect(errors).toContain('lessons[0].blocks[0].kind "mystery" is unknown');
    expect(errors).toContain("lessons[0].blocks[1].display is required");
    expect(errors).toContain("lessons[0].blocks[1].translation is required");
  });

  it("throws a deterministic actionable error when loading invalid content", () => {
    const fixture = copy();
    (fixture.concepts as Concept[])[0] = { ...fixture.concepts[0], reading: " " };
    expect(() => loadContent(fixture)).toThrow(ContentValidationError);
    expect(validateContent(fixture)).toContain("concepts[0].reading is required");
  });
});
