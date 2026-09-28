import { describe, expect, it } from "vitest";
import type { ContentId, Lesson } from "../content/types.ts";
import { composeSession } from "./session.ts";

const cid = (id: string) => id as ContentId;
const lesson: Lesson = {
  id: cid("lesson-a"), display: "Lesson A", requires: [], introduces: [cid("new-a"), cid("new-a")],
  reinforces: [cid("new-a"), cid("known-b")], blocks: [],
};

describe("session composer", () => {
  it("returns an empty serializable plan for a new learner with no candidates", () => {
    const plan = composeSession({ dueReviewIds: [], weakConceptIds: [], newMaterialCap: 0 });
    expect(plan).toEqual({ version: 1, items: [], summary: { reviewCount: 0, remediationCount: 0, includesLesson: false, includesPractice: false, newConceptCount: 0 } });
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it("orders supplied due items before weak items and the lesson with immediate practice", () => {
    const plan = composeSession({ dueReviewIds: [cid("due-a"), cid("due-b")], weakConceptIds: [cid("weak-a")], currentLesson: lesson, lessonMode: "resume", newMaterialCap: 1 });
    expect(plan.items.map((item) => item.kind)).toEqual(["review", "review", "remediation", "lesson", "practice"]);
    expect(plan.items[3]).toMatchObject({ kind: "lesson", mode: "resume" });
    expect(plan.summary).toEqual({ reviewCount: 2, remediationCount: 1, includesLesson: true, includesPractice: true, newConceptCount: 1 });
  });

  it("suppresses duplicate concepts across due and weak slots and within lesson practice", () => {
    const plan = composeSession({ dueReviewIds: [cid("same"), cid("same")], weakConceptIds: [cid("same"), cid("weak")], currentLesson: lesson, newMaterialCap: 1 });
    expect(plan.items.slice(0, 3)).toEqual([{ kind: "review", conceptId: cid("same") }, { kind: "remediation", conceptId: cid("weak") }, { kind: "lesson", lessonId: lesson.id, mode: "new", conceptIds: [cid("new-a")] }]);
    expect(plan.items.at(-1)).toEqual({ kind: "practice", lessonId: lesson.id, conceptIds: [cid("new-a"), cid("known-b")] });
  });

  it("keeps due and weak work when the new-material cap excludes the lesson", () => {
    const plan = composeSession({ dueReviewIds: [cid("due")], weakConceptIds: [cid("weak")], currentLesson: lesson, newMaterialCap: 0 });
    expect(plan.items.map((item) => item.kind)).toEqual(["review", "remediation"]);
    expect(plan.summary.includesLesson).toBe(false);
    expect(plan.summary.newConceptCount).toBe(0);
  });
});
