import catalog from "../src/content/catalog.json" with { type: "json" };
import { validateContent } from "../src/lib/content/validator.ts";
import { kanaAudioManifest, kanaFixtures, katakanaFixtures, katakanaAdvancedFixtures } from "../src/content/kana-fixtures.ts";
import { KANA_REVIEW_FORMS, validateKanaContent } from "../src/lib/content/kana.ts";
import { vocabularyFixtures } from "../src/content/vocabulary-fixtures.ts";
import { VOCABULARY_REVIEW_FORMS, validateVocabularyContent } from "../src/lib/content/vocabulary.ts";
import { grammarFixtures } from "../src/content/grammar-fixtures.ts";
import { validateGrammarContent } from "../src/lib/content/grammar.ts";
import { phraseFixtures } from "../src/content/phrase-fixtures.ts";
import { PHRASE_REVIEW_FORMS, validatePhraseContent } from "../src/lib/content/phrases.ts";

const catalogIds = [...catalog.courses, ...catalog.units, ...catalog.lessons, ...catalog.concepts, ...catalog.sentences].map(({ id }) => id);
const allKana = [...kanaFixtures, ...katakanaFixtures, ...katakanaAdvancedFixtures];
async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? collectFiles(join(directory, entry.name)) : [relative("public", join(directory, entry.name)).split(sep).join("/")]))).flat();
}
const publicFiles = await collectFiles("public");
const audioIds = new Set(kanaAudioManifest.entries.map(({ id }) => id));
const brokenBundledAudio = kanaAudioManifest.entries.flatMap((entry) => entry.provider === "bundled" && (!entry.asset || !publicFiles.includes(entry.asset)) ? [`audio "${entry.id}" references missing bundled asset "${entry.asset ?? "(none)"}"`] : []);
const coverage = (items: readonly { readonly audioId?: string }[]) => ({ total: items.length, covered: items.filter(({ audioId }) => audioId && audioIds.has(audioId)).length });
const audioCoverage = {
  kana: coverage(allKana),
  coreVocabulary: coverage(vocabularyFixtures),
  phrases: coverage(phraseFixtures),
  listening: coverage(catalog.sentences),
};
const audioExercises = [...catalog.lessons.flatMap((lesson) => lesson.blocks.flatMap((block) => block.kind === "exercise-slot" ? block.exercises : [])), ...grammarFixtures.flatMap((lesson) => lesson.exercises)].filter((exercise) => exercise.type === "audio-choice");
const missingExerciseAudio = audioExercises.flatMap((exercise) => audioIds.has(exercise.audioId) ? [] : [`audio exercise "${exercise.id}" references missing audio "${exercise.audioId}"`]);
const inventory = [
  ["hiragana base", kanaFixtures.filter(({ form }) => form === "base").length, 46],
  ["hiragana marked", kanaFixtures.filter(({ form }) => form === "marked").length, 25],
  ["hiragana small", kanaFixtures.filter(({ form }) => form === "small").length, 4],
  ["hiragana contracted", kanaFixtures.filter(({ form }) => form === "contracted").length, 33],
  ["katakana base", katakanaFixtures.filter(({ form }) => form === "base").length, 46],
  ["advanced katakana marked", katakanaAdvancedFixtures.filter(({ form }) => form === "marked").length, 25],
  ["advanced katakana small", katakanaAdvancedFixtures.filter(({ form }) => form === "small").length, 9],
  ["advanced katakana contracted", katakanaAdvancedFixtures.filter(({ form }) => form === "contracted").length, 46],
  ["katakana marker", katakanaAdvancedFixtures.filter(({ form }) => form === "marker").length, 1],
].flatMap(([label, actual, expected]) => actual === expected ? [] : [`kana inventory ${label}: expected ${expected}, found ${actual}`]);
const globalIds = new Map<string, string>();
const globalIdIssues: string[] = [];
const mirroredCatalogIds = new Set([...allKana, ...grammarFixtures].map(({ id }) => id).filter((id) => catalogIds.includes(id)));
const addIds = (label: string, items: readonly { id: string }[]) => items.forEach(({ id }, index) => {
  const source = `${label}[${index}]`;
  const previous = globalIds.get(id);
  const intentionalCatalogMirror = previous?.startsWith("catalog.concepts[") && mirroredCatalogIds.has(id) && (label === "kana" || label === "grammar");
  if (previous && !intentionalCatalogMirror) globalIdIssues.push(`${source}.id duplicates ${previous} (${id})`);
  else globalIds.set(id, source);
});
addIds("catalog.courses", catalog.courses);
addIds("catalog.units", catalog.units);
addIds("catalog.lessons", catalog.lessons);
addIds("catalog.concepts", catalog.concepts);
addIds("catalog.sentences", catalog.sentences);
addIds("kana", allKana);
addIds("vocabulary", vocabularyFixtures);
addIds("grammar", grammarFixtures);
addIds("phrases", phraseFixtures);
const expectedForms = [
  ["kana", KANA_REVIEW_FORMS, [["kana-glyph-to-sound", "glyph-to-sound", "glyph", "sound"], ["kana-sound-to-glyph", "sound-to-glyph", "sound", "glyph"], ["kana-audio-to-glyph", "audio-to-glyph", "audio", "glyph"]]],
  ["vocabulary", VOCABULARY_REVIEW_FORMS, [["vocabulary-meaning", "meaning", "written", "meanings"], ["vocabulary-reading", "reading", "written", "reading"], ["vocabulary-production", "production", "meaning", "written"]]],
  ["phrase", PHRASE_REVIEW_FORMS, [["phrase-meaning", "meaning", "japanese", "meaning"], ["phrase-production", "production", "meaning", "japanese"]]],
] as const;
const formIssues = expectedForms.flatMap(([label, actual, expected]) => JSON.stringify(actual.map(({ id, kind, prompt, answer }) => [id, kind, prompt, answer])) === JSON.stringify(expected) ? [] : [`${label} review form IDs and mappings changed; preserve released form IDs and mappings`]);
const issues = [...validateContent(catalog), ...validateKanaContent(allKana, KANA_REVIEW_FORMS, kanaAudioManifest, { bundledAssets: publicFiles, providerIds: ["bundled", "speech-synthesis"] }), ...brokenBundledAudio, ...validateVocabularyContent(vocabularyFixtures, VOCABULARY_REVIEW_FORMS, { audioIds: [...audioIds], existingIds: [...catalogIds, ...allKana.map(({ id }) => id)] }), ...validateGrammarContent(grammarFixtures), ...validatePhraseContent(phraseFixtures, PHRASE_REVIEW_FORMS, { grammarIds: grammarFixtures.map(({ id }) => id), audioIds: [...audioIds], existingIds: [...catalogIds, ...allKana.map(({ id }) => id), ...vocabularyFixtures.map(({ id }) => id), ...grammarFixtures.map(({ id }) => id)] }), ...missingExerciseAudio, ...inventory, ...globalIdIssues, ...formIssues];
if (issues.length > 0) {
  process.stderr.write(`${issues.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Content valid (schema ${catalog.metadata.schemaVersion}, version ${catalog.metadata.contentVersion}; audio coverage ${JSON.stringify(audioCoverage)}; manifest entries ${kanaAudioManifest.entries.length}).\n`);
}
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
