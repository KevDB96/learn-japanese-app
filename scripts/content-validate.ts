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
async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? collectFiles(join(directory, entry.name)) : [relative("public", join(directory, entry.name)).split(sep).join("/")]))).flat();
}
const publicFiles = await collectFiles("public");
const audioIds = new Set(kanaAudioManifest.entries.map(({ id }) => id));
const audioExercises = [...catalog.lessons.flatMap((lesson) => lesson.blocks.flatMap((block) => block.kind === "exercise-slot" ? block.exercises : [])), ...grammarFixtures.flatMap((lesson) => lesson.exercises)].filter((exercise) => exercise.type === "audio-choice");
const missingExerciseAudio = audioExercises.flatMap((exercise) => audioIds.has(exercise.audioId) ? [] : [`audio exercise "${exercise.id}" references missing audio "${exercise.audioId}"`]);
const issues = [...validateContent(catalog), ...validateKanaContent([...kanaFixtures, ...katakanaFixtures, ...katakanaAdvancedFixtures], KANA_REVIEW_FORMS, kanaAudioManifest, { bundledAssets: publicFiles }), ...validateVocabularyContent(vocabularyFixtures, VOCABULARY_REVIEW_FORMS, { audioIds: [...audioIds], existingIds: catalogIds }), ...validateGrammarContent(grammarFixtures), ...validatePhraseContent(phraseFixtures, PHRASE_REVIEW_FORMS, { grammarIds: grammarFixtures.map(({ id }) => id), audioIds: [...audioIds], existingIds: [...catalogIds, ...vocabularyFixtures.map(({ id }) => id), ...grammarFixtures.map(({ id }) => id)] }), ...missingExerciseAudio];
if (issues.length > 0) {
  process.stderr.write(`${issues.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Content valid (schema ${catalog.metadata.schemaVersion}, version ${catalog.metadata.contentVersion}; kana, vocabulary, grammar, and phrase fixtures valid).\n`);
}
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
