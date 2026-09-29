import { describe, expect, it } from "vitest";
import type { ContentId, Lesson } from "../content/types.ts";
import { composeSession } from "./session.ts";

const cid = (id: string) => id as ContentId;
const due = (...ids: string[]) => ids.map((id) => ({ conceptId: cid(id), cardId: `${id}--kana-glyph-to-sound`, formId: "kana-glyph-to-sound" }));
const lesson: Lesson = {
  id: cid("lesson-a"), display: "Lesson A", requires: [], introduces: [cid("new-a"), cid("new-a")],
  reinforces: [cid("new-a"), cid("known-b")], blocks: [],
};

describe("session composer", () => {
  it("returns an empty serializable plan for a new learner with no candidates", () => {
    const plan = composeSession({ dueReviews: [], weakConceptIds: [], newMaterialCap: 0 });
    expect(plan).toEqual({ version: 1, items: [], summary: { reviewCount: 0, remediationCount: 0, includesLesson: false, includesPractice: false, newConceptCount: 0 } });
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it("orders supplied due items before weak items and the lesson with immediate practice", () => {
    const plan = composeSession({ dueReviews: due("due-a", "due-b"), weakConceptIds: [cid("weak-a")], currentLesson: lesson, lessonMode: "resume", newMaterialCap: 1 });
    expect(plan.items.map((item) => item.kind)).toEqual(["review", "review", "remediation", "lesson", "practice"]);
    expect(plan.items[3]).toMatchObject({ kind: "lesson", mode: "resume" });
    expect(plan.summary).toEqual({ reviewCount: 2, remediationCount: 1, includesLesson: true, includesPractice: true, newConceptCount: 1 });
  });

  it("adds a specific contrast exercise containing both confused kana glyphs", () => {
    const plan = composeSession({ dueReviews: [], weakConceptIds: [], contrastGroups: [{ conceptIds: [cid("kana-hira-nu"), cid("kana-hira-me")], glyphs: ["ぬ", "め"] }], newMaterialCap: 0 });
    expect(plan.items).toContainEqual({ kind: "contrast", conceptIds: [cid("kana-hira-nu"), cid("kana-hira-me")], glyphs: ["ぬ", "め"] });
    expect(plan.summary.remediationCount).toBe(1);
  });

  it("suppresses duplicate concepts across due and weak slots and within lesson practice", () => {
    const duplicateDue = [...due("same"), ...due("same")];
    const plan = composeSession({ dueReviews: duplicateDue, weakConceptIds: [cid("same"), cid("weak")], currentLesson: lesson, newMaterialCap: 1 });
    expect(plan.items.slice(0, 3)).toEqual([{ kind: "review", ...due("same")[0] }, { kind: "remediation", conceptId: cid("weak") }, { kind: "lesson", lessonId: lesson.id, mode: "new", conceptIds: [cid("new-a")] }]);
    expect(plan.items.at(-1)).toEqual({ kind: "practice", lessonId: lesson.id, conceptIds: [cid("new-a"), cid("known-b")] });
  });

  it("keeps due and weak work when the new-material cap excludes the lesson", () => {
    const plan = composeSession({ dueReviews: due("due"), weakConceptIds: [cid("weak")], currentLesson: lesson, newMaterialCap: 0 });
    expect(plan.items.map((item) => item.kind)).toEqual(["review", "remediation"]);
    expect(plan.summary.includesLesson).toBe(false);
    expect(plan.summary.newConceptCount).toBe(0);
  });

  it("preserves distinct form cards for the same kana and de-duplicates a repeated card", () => {
    const first = { conceptId: cid("kana-hira-a"), cardId: "kana-hira-a--kana-glyph-to-sound", formId: "kana-glyph-to-sound" };
    const second = { conceptId: cid("kana-hira-a"), cardId: "kana-hira-a--kana-sound-to-glyph", formId: "kana-sound-to-glyph" };
    const plan = composeSession({ dueReviews: [first, second, first], weakConceptIds: [], newMaterialCap: 0 });
    expect(plan.items).toEqual([{ kind: "review", ...first }, { kind: "review", ...second }]);
  });

  it("keeps due reviews and a curated oversized lesson together within the review cap", () => {
    const largerLesson: Lesson = { ...lesson, introduces: Array.from({ length: 25 }, (_, index) => cid(`new-${index}`)) };
    const dueReviews = Array.from({ length: 12 }, (_, index) => ({ conceptId: cid(`due-${index}`), cardId: `card-${index}`, formId: "kana-glyph-to-sound" }));
    const plan = composeSession({ dueReviews, reviewLimit: 10, weakConceptIds: [], currentLesson: largerLesson, newMaterialCap: 5, allowOversizedLesson: true });
    expect(plan.items.filter((item) => item.kind === "review")).toHaveLength(10);
    expect(plan.items.find((item) => item.kind === "lesson")).toMatchObject({ kind: "lesson", lessonId: lesson.id });
    expect(plan.summary.newConceptCount).toBe(25);
  });
});
