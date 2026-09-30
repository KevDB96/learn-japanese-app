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
  { id: id("vocab-hito"), written: "人", reading: "ひと", meanings: ["person", "people"], partOfSpeech: "noun", tags: ["people", "beginner"] },
  { id: id("vocab-kazoku"), written: "家族", reading: "かぞく", meanings: ["family"], partOfSpeech: "noun", tags: ["family", "beginner"] },
  { id: id("vocab-haha"), written: "母", reading: "はは", meanings: ["my mother"], partOfSpeech: "noun", tags: ["family", "beginner"], examples: [{ written: "母は先生です。", reading: "はははせんせいです。", meaning: "My mother is a teacher." }] },
  { id: id("vocab-chichi"), written: "父", reading: "ちち", meanings: ["my father"], partOfSpeech: "noun", tags: ["family", "beginner"] },
  { id: id("vocab-ani"), written: "兄", reading: "あに", meanings: ["my older brother"], partOfSpeech: "noun", tags: ["family", "beginner"] },
  { id: id("vocab-ane"), written: "姉", reading: "あね", meanings: ["my older sister"], partOfSpeech: "noun", tags: ["family", "beginner"] },
  { id: id("vocab-okaasan"), written: "お母さん", reading: "おかあさん", meanings: ["mother"], partOfSpeech: "noun", tags: ["family", "politeness"] },
  { id: id("vocab-otousan"), written: "お父さん", reading: "おとうさん", meanings: ["father"], partOfSpeech: "noun", tags: ["family", "politeness"] },
];
