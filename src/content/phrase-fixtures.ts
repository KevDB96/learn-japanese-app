import type { ContentId, PhraseConcept } from "../lib/content/types.ts";

const id = (value: string) => value as ContentId;

/** Starter expressions with stable readings and concise register guidance. */
export const phraseFixtures: readonly PhraseConcept[] = [
  {
    id: id("phrase-ohayou-gozaimasu"), japanese: "おはようございます", reading: "おはようございます", meaning: "Good morning.",
    literalBreakdown: [
      { japanese: "お", reading: "お", meaning: "polite prefix" },
      { japanese: "はよう", reading: "はよう", meaning: "early" },
      { japanese: "ございます", reading: "ございます", meaning: "polite form" },
    ],
    learningMode: "memorized", formality: "polite", usageNotes: ["A polite greeting used in the morning."], grammarIds: [],
  },
  {
    id: id("phrase-arigatou"), japanese: "ありがとう", reading: "ありがとう", meaning: "Thank you.",
    learningMode: "memorized", formality: "casual", usageNotes: ["Use with friends; add ございます for a polite expression."], grammarIds: [],
  },
  {
    id: id("phrase-kore-wa-nan-desu-ka"), japanese: "これは何ですか。", reading: "これはなんですか。", meaning: "What is this?",
    literalBreakdown: [
      { japanese: "これ", reading: "これ", meaning: "this" },
      { japanese: "は", reading: "は", meaning: "topic marker (wa)" },
      { japanese: "何", reading: "なん", meaning: "what" },
      { japanese: "ですか", reading: "ですか", meaning: "polite question ending" },
    ],
    learningMode: "compositional", formality: "polite", usageNotes: ["Ask what an object is; replace これ with another thing being discussed."],
    grammarIds: [id("grammar-topic-wa"), id("grammar-desu-copula"), id("grammar-ka-question")],
  },
  {
    id: id("phrase-hajimemashite"), japanese: "はじめまして。", reading: "はじめまして。", meaning: "How do you do? (said when meeting for the first time)",
    learningMode: "memorized", formality: "polite", usageNotes: ["A set polite greeting for a first meeting; commonly followed by a self-introduction."], grammarIds: [],
  },
  {
    id: id("phrase-okaasan"), japanese: "お母さん", reading: "おかあさん", meaning: "mother; mom",
    learningMode: "memorized", formality: "polite", usageNotes: ["Use for another person's mother or when addressing your own mother. When describing your own mother to someone outside your family, 母 (はは) is usual."], grammarIds: [],
  },
  {
    id: id("phrase-suki-desu"), japanese: "寿司が好きです。", reading: "すしがすきです。", meaning: "I like sushi.",
    learningMode: "compositional", formality: "polite", usageNotes: ["Put the liked thing before が; the speaker is understood from context."], grammarIds: [id("grammar-likes-and-requests")],
  },
  {
    id: id("phrase-kore-o-kudasai"), japanese: "これをください。", reading: "これをください。", meaning: "This, please.",
    literalBreakdown: [
      { japanese: "これ", reading: "これ", meaning: "this" },
      { japanese: "を", reading: "を", meaning: "marks the thing requested" },
      { japanese: "ください", reading: "ください", meaning: "please give me" },
    ],
    learningMode: "compositional", formality: "polite", usageNotes: ["A natural polite request when ordering or choosing an item."], grammarIds: [id("grammar-likes-and-requests")],
  },
  {
    id: id("phrase-mizu-o-onegaishimasu"), japanese: "水をお願いします。", reading: "みずをおねがいします。", meaning: "Water, please.",
    learningMode: "compositional", formality: "polite", usageNotes: ["A courteous request for water; お願いします is a polite set phrase."], grammarIds: [id("grammar-likes-and-requests")],
  },
];
