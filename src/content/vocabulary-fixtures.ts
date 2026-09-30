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
  {
    id: id("vocab-watashi"), written: "わたし", reading: "わたし", meanings: ["I", "me"], partOfSpeech: "pronoun", tags: ["identity", "beginner"],
    examples: [{ written: "わたしは学生です。", reading: "わたしはがくせいです。", meaning: "I am a student." }],
  },
  {
    id: id("vocab-gakusei"), written: "学生", reading: "がくせい", meanings: ["student"], partOfSpeech: "noun", tags: ["identity", "beginner"],
    examples: [{ written: "わたしは学生です。", reading: "わたしはがくせいです。", meaning: "I am a student." }],
  },
  {
    id: id("vocab-sensei"), written: "先生", reading: "せんせい", meanings: ["teacher"], partOfSpeech: "noun", tags: ["identity", "beginner"],
  },
  {
    id: id("vocab-kevin"), written: "ケビン", reading: "ケビン", meanings: ["Kevin"], partOfSpeech: "proper noun", tags: ["identity", "name"],
    examples: [{ written: "わたしはケビンです。", reading: "わたしはケビンです。", meaning: "I am Kevin." }],
  },
];
