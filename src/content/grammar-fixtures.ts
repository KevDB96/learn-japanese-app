import type { ContentId, GrammarMiniLesson } from "../lib/content/types.ts";

const id = (value: string) => value as ContentId;

/** Beginner grammar sequence; exercise shapes are shared with the lesson exercise engine. */
export const grammarFixtures: readonly GrammarMiniLesson[] = [
  {
    id: id("grammar-topic-wa"),
    display: "Topic marker は",
    requires: [],
    shortExplanation: "は marks what a sentence is about.",
    fullExplanation: "Place は after the topic. Although written with the kana は, this particle is pronounced wa. It marks the topic without itself meaning ‘is’ or ‘the’.",
    examples: [{ id: id("grammar-topic-wa-example"), japanese: "ねこは…", reading: "ねこは…", translation: "As for the cat…", grammarIds: [id("grammar-topic-wa")] }],
    commonMistakes: ["Pronouncing the topic particle は as ha instead of wa."],
    relatedConceptIds: [id("grammar-desu-copula")],
    exercises: [{ id: id("grammar-topic-wa-exercise"), type: "multiple-choice", prompt: "Which particle marks the topic?", options: ["は", "を", "に"], answer: "は", feedback: { success: "Correct.", explanation: "は marks the topic and is pronounced wa as a particle." } }],
  },
  {
    id: id("grammar-desu-copula"),
    display: "Noun sentences with です",
    requires: [id("grammar-topic-wa")],
    shortExplanation: "Use X は Y です to say that X is Y.",
    fullExplanation: "Put the topic before は and a noun description before です. In a polite statement, です completes the sentence as a copula; it does not change the topic marker’s pronunciation.",
    examples: [{ id: id("grammar-desu-copula-example"), japanese: "ねこは学生です。", reading: "ねこはがくせいです。", translation: "The cat is a student.", grammarIds: [id("grammar-topic-wa"), id("grammar-desu-copula")] }],
    commonMistakes: ["Treating です as a verb that must follow the topic directly, leaving out the description."],
    relatedConceptIds: [id("grammar-topic-wa"), id("grammar-ka-question")],
    exercises: [
      { id: id("grammar-desu-copula-exercise"), type: "short-text", prompt: "Complete ‘ねこは学生___。’ with the polite copula.", answer: "です", feedback: { success: "Correct.", explanation: "です completes this polite noun sentence." } },
      { id: id("grammar-desu-copula-cloze"), type: "cloze", prompt: "Complete the sentence.", before: "ねこは学生", after: "。", answer: "です", explanation: "です completes a polite noun sentence.", feedback: { success: "Correct.", explanation: "です completes a polite noun sentence." } },
    ],
  },
  {
    id: id("grammar-ka-question"),
    display: "Yes/no questions with か",
    requires: [id("grammar-desu-copula")],
    shortExplanation: "Add か to a polite statement to make a question.",
    fullExplanation: "Keep the polite statement order and place か after です. In writing, Japanese commonly uses 。 at the end; question intonation and context can also signal a spoken question.",
    examples: [{ id: id("grammar-ka-question-example"), japanese: "ねこは学生ですか。", reading: "ねこはがくせいですか。", translation: "Is the cat a student?", grammarIds: [id("grammar-topic-wa"), id("grammar-desu-copula"), id("grammar-ka-question")] }],
    commonMistakes: ["Moving か before です instead of placing it at the end of the polite question."],
    relatedConceptIds: [id("grammar-desu-copula")],
    exercises: [
      { id: id("grammar-ka-question-exercise"), type: "multiple-choice", prompt: "Which ending makes 学生です a polite yes/no question?", options: ["ですか", "かです", "はです"], answer: "ですか", feedback: { success: "Correct.", explanation: "Place か after the polite statement ending です." } },
      { id: id("grammar-ka-question-cloze"), type: "cloze", prompt: "Complete the polite question.", before: "ねこは学生です", after: "。", answer: "か", explanation: "Place か after です to form a polite yes/no question.", feedback: { success: "Correct.", explanation: "Place か after です to form a polite yes/no question." } },
      { id: id("grammar-ka-question-order"), type: "sentence-order", prompt: "Build the polite question.", chunks: [
        { id: "topic", japanese: "ねこは", reading: "ねこは", meaning: "As for the cat" },
        { id: "description", japanese: "学生", reading: "がくせい", meaning: "student" },
        { id: "copula", japanese: "です", reading: "です", meaning: "polite copula" },
        { id: "question", japanese: "か。", reading: "か。", meaning: "question marker and sentence ending" },
      ], answerOrder: ["topic", "description", "copula", "question"], explanation: "Place か after です to turn the polite statement into a question.", feedback: { success: "Correct.", explanation: "Keep か after the polite ending です." } },
    ],
  },
];
