import type { ContentId, VocabularyConcept } from "../lib/content/types.ts";

const id = (value: string) => value as ContentId;

/** Small canonical seed set; kanji entries always include a learner-visible kana reading. */
export const vocabularyFixtures: readonly VocabularyConcept[] = [
  {
    id: id("vocab-neko"), written: "猫", reading: "ねこ", meanings: ["cat"], partOfSpeech: "noun", tags: ["animals", "beginner"],
    examples: [{ written: "猫がいます。", reading: "ねこがいます。", meaning: "There is a cat." }],
  },
  {
    id: id("vocab-mizu"), written: "水", reading: "みず", meanings: ["water"], partOfSpeech: "noun", tags: ["food", "beginner"],
  },
];
