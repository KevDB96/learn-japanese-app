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
  { id: id("vocab-zero"), written: "零", reading: "れい", meanings: ["zero"], partOfSpeech: "number", tags: ["numbers", "beginner"] },
  { id: id("vocab-ichi"), written: "一", reading: "いち", meanings: ["one"], partOfSpeech: "number", tags: ["numbers", "beginner"] },
  { id: id("vocab-ni"), written: "二", reading: "に", meanings: ["two"], partOfSpeech: "number", tags: ["numbers", "beginner"] },
  { id: id("vocab-san"), written: "三", reading: "さん", meanings: ["three"], partOfSpeech: "number", tags: ["numbers", "beginner"] },
  { id: id("vocab-yon"), written: "四", reading: "よん", meanings: ["four"], partOfSpeech: "number", tags: ["numbers", "beginner"] },
  { id: id("vocab-go"), written: "五", reading: "ご", meanings: ["five"], partOfSpeech: "number", tags: ["numbers", "beginner"] },
  { id: id("vocab-roku"), written: "六", reading: "ろく", meanings: ["six"], partOfSpeech: "number", tags: ["numbers", "beginner"] },
  { id: id("vocab-nana"), written: "七", reading: "なな", meanings: ["seven"], partOfSpeech: "number", tags: ["numbers", "beginner"] },
  { id: id("vocab-hachi"), written: "八", reading: "はち", meanings: ["eight"], partOfSpeech: "number", tags: ["numbers", "beginner"] },
  { id: id("vocab-kyuu"), written: "九", reading: "きゅう", meanings: ["nine"], partOfSpeech: "number", tags: ["numbers", "beginner"] },
  { id: id("vocab-juu"), written: "十", reading: "じゅう", meanings: ["ten"], partOfSpeech: "number", tags: ["numbers", "beginner"] },
  { id: id("vocab-nanji"), written: "何時", reading: "なんじ", meanings: ["what time"], partOfSpeech: "question word", tags: ["time", "beginner"] },
  { id: id("vocab-fun"), written: "分", reading: "ふん", meanings: ["minute"], partOfSpeech: "counter", tags: ["time", "beginner"] },
  { id: id("vocab-han"), written: "半", reading: "はん", meanings: ["half", "half past"], partOfSpeech: "time expression", tags: ["time", "beginner"] },
  { id: id("vocab-hitori"), written: "一人", reading: "ひとり", meanings: ["one person"], partOfSpeech: "counter phrase", tags: ["counters", "people", "beginner"] },
  { id: id("vocab-futari"), written: "二人", reading: "ふたり", meanings: ["two people"], partOfSpeech: "counter phrase", tags: ["counters", "people", "beginner"] },
];
