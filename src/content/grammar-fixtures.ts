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
  {
    id: id("grammar-self-introduction"),
    display: "Simple self-introductions",
    requires: [id("grammar-topic-wa"), id("grammar-desu-copula")],
    shortExplanation: "Use わたしは + a name or role + です to introduce yourself politely.",
    fullExplanation: "わたし means ‘I’. Put は after わたし to mark the topic; as a particle it is pronounced wa. Add a name or role, then です for a polite statement. For a first meeting, はじめまして is a set polite greeting and does not need to be translated word for word.",
    examples: [
      { id: id("grammar-self-introduction-student"), japanese: "わたしは学生です。", reading: "わたしはがくせいです。", translation: "I am a student.", grammarIds: [id("grammar-topic-wa"), id("grammar-desu-copula"), id("grammar-self-introduction")] },
      { id: id("grammar-self-introduction-name"), japanese: "わたしはケビンです。", reading: "わたしはケビンです。", translation: "I am Kevin.", grammarIds: [id("grammar-topic-wa"), id("grammar-desu-copula"), id("grammar-self-introduction")] },
    ],
    commonMistakes: ["Reading the topic particle は as ha; here it is pronounced wa.", "Leaving out the description between は and です."],
    relatedConceptIds: [id("grammar-topic-wa"), id("grammar-desu-copula")],
    exercises: [
      { id: id("grammar-self-introduction-cloze"), type: "cloze", prompt: "Complete the polite self-introduction.", before: "わたしは学生", after: "。", answer: "です", explanation: "です completes this polite identity statement.", feedback: { success: "Correct.", explanation: "です completes this polite identity statement." } },
      { id: id("grammar-self-introduction-order"), type: "sentence-order", prompt: "Build ‘I am Kevin.’", chunks: [
        { id: "topic", japanese: "わたしは", reading: "わたしは", meaning: "As for me" },
        { id: "name", japanese: "ケビン", reading: "ケビン", meaning: "Kevin" },
        { id: "ending", japanese: "です。", reading: "です。", meaning: "polite ending" },
      ], answerOrder: ["topic", "name", "ending"], explanation: "Put the topic first, then the name, then です.", feedback: { success: "Correct.", explanation: "わたしはケビンです。 is a polite introduction." } },
    ],
  },
  {
    id: id("grammar-family-terms"),
    display: "Talking about family",
    requires: [id("grammar-desu-copula")],
    shortExplanation: "Use a plain family term for your own family when speaking to others; さん forms are respectful for another person's family or direct address.",
    fullExplanation: "When speaking to someone outside your family, use 母 (はは) and 父 (ちち) for your own mother and father. Use お母さん (おかあさん) and お父さん (おとうさん) for someone else's parents or when addressing your own parents. The polite お…さん forms show respect; they are not simply interchangeable with the humble terms for your own family. Put a family member before は and a role before です, reusing the noun sentence pattern.",
    examples: [
      { id: id("grammar-family-mother-example"), japanese: "母は先生です。", reading: "はははせんせいです。", translation: "My mother is a teacher.", grammarIds: [id("grammar-topic-wa"), id("grammar-desu-copula"), id("grammar-family-terms")] },
      { id: id("grammar-family-address-example"), japanese: "お母さん。", reading: "おかあさん。", translation: "Mom. (direct address)", grammarIds: [id("grammar-family-terms")] },
    ],
    commonMistakes: ["Using お母さん for your own mother when describing her to someone outside your family; 母 is the usual modest term.", "Assuming さん forms are rude or overly formal; they are ordinary respectful family terms when addressing someone or discussing another person's family."],
    relatedConceptIds: [id("grammar-self-introduction"), id("grammar-desu-copula")],
    exercises: [
      { id: id("grammar-family-choice"), type: "multiple-choice", prompt: "When telling someone about your own mother, which term is usual?", options: ["母 (はは)", "お母さん (おかあさん)", "先生 (せんせい)"], answer: "母 (はは)", feedback: { success: "Correct.", explanation: "Use 母 (はは) for your own mother when speaking to someone outside your family." } },
      { id: id("grammar-family-cloze"), type: "cloze", prompt: "Complete the polite description: ‘My mother is a teacher.’", before: "母は先生", after: "。", answer: "です", explanation: "Reuse the polite noun sentence ending です.", feedback: { success: "Correct.", explanation: "母は先生です。 (はははせんせいです。) reuses は and です." } },
      { id: id("grammar-family-order"), type: "sentence-order", prompt: "Build ‘My older brother is a student.’", chunks: [
        { id: "family", japanese: "兄は", reading: "あには", meaning: "As for my older brother" },
        { id: "role", japanese: "学生", reading: "がくせい", meaning: "student" },
        { id: "ending", japanese: "です。", reading: "です。", meaning: "polite ending" },
      ], answerOrder: ["family", "role", "ending"], explanation: "Reuse topic + noun description + です.", feedback: { success: "Correct.", explanation: "兄は学生です。 (あにはがくせいです。) means ‘My older brother is a student.’" } },
    ],
  },
  {
    id: id("grammar-time-and-counters"),
    display: "Clock time and two counters",
    requires: [id("grammar-family-terms"), id("grammar-ka-question")],
    shortExplanation: "Use 時 (じ) for the hour and 分 (ふん / ぷん) for minutes. 人 (にん) counts people, with special forms for one and two.",
    fullExplanation: "For clock time, say the number + 時 (じ), then the number + 分. Half past can use 半 (はん). A few readings change: 四時 is よじ (not よんじ), 七時 is しちじ, 九時 is くじ; for minutes, 1, 3, 4, 6, 8, and 10 minutes have familiar sound changes such as いっぷん, さんぷん, よんぷん, ろっぷん, はっぷん, and じゅっぷん. For people, use 一人 (ひとり) and 二人 (ふたり), then number + 人 (にん), as in 三人 (さんにん). For a small number of objects, つ is useful: 一つ (ひとつ), 二つ (ふたつ), 三つ (みっつ); learn more specific counters when needed.",
    examples: [
      { id: id("grammar-time-four-example"), japanese: "四時半です。", reading: "よじはんです。", translation: "It is half past four.", grammarIds: [id("grammar-topic-wa"), id("grammar-desu-copula"), id("grammar-time-and-counters")] },
      { id: id("grammar-time-question-example"), japanese: "今、何時ですか。", reading: "いま、なんじですか。", translation: "What time is it now?", grammarIds: [id("grammar-ka-question"), id("grammar-time-and-counters")] },
      { id: id("grammar-people-count-example"), japanese: "三人です。", reading: "さんにんです。", translation: "There are three people.", grammarIds: [id("grammar-desu-copula"), id("grammar-time-and-counters")] },
    ],
    commonMistakes: ["Using よんじ for 四時; the clock reading is よじ.", "Reading every minute as number + ふん; several minute readings change to ぷん or add a small っ.", "Using にん for 一人 and 二人; say ひとり and ふたり."],
    relatedConceptIds: [id("grammar-time-and-counters")],
    exercises: [
      { id: id("grammar-time-four-choice"), type: "multiple-choice", prompt: "How do you read 四時?", options: ["よじ", "よんじ", "しじ"], answer: "よじ", feedback: { success: "Correct.", explanation: "四時 is the irregular clock reading よじ." } },
      { id: id("grammar-time-minute-cloze"), type: "cloze", prompt: "Complete ‘3 minutes’: 三___", before: "三", after: "", answer: "ぷん", explanation: "三分 is さんぷん; the counter begins with p after the number three.", feedback: { success: "Correct.", explanation: "Three minutes is 三分 (さんぷん)." } },
      { id: id("grammar-people-two-recall"), type: "short-text", prompt: "Write ‘two people’ in Japanese.", answer: "二人 (ふたり)", acceptedAnswers: ["二人", "ふたり"], feedback: { success: "Correct.", explanation: "二人 is read ふたり, a special form." } },
    ],
  },
];
