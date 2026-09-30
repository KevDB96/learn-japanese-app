import catalog from "../src/content/catalog.json" with { type: "json" };
import { validateContent } from "../src/lib/content/validator.ts";
import { kanaAudioManifest, kanaFixtures, katakanaFixtures, katakanaAdvancedFixtures } from "../src/content/kana-fixtures.ts";
import { KANA_REVIEW_FORMS, validateKanaContent } from "../src/lib/content/kana.ts";
import { vocabularyFixtures } from "../src/content/vocabulary-fixtures.ts";
import { VOCABULARY_REVIEW_FORMS, validateVocabularyContent } from "../src/lib/content/vocabulary.ts";
import { grammarFixtures } from "../src/content/grammar-fixtures.ts";
import { validateGrammarContent } from "../src/lib/content/grammar.ts";

const catalogIds = [...catalog.courses, ...catalog.units, ...catalog.lessons, ...catalog.concepts, ...catalog.sentences].map(({ id }) => id);
const issues = [...validateContent(catalog), ...validateKanaContent([...kanaFixtures, ...katakanaFixtures, ...katakanaAdvancedFixtures], KANA_REVIEW_FORMS, kanaAudioManifest), ...validateVocabularyContent(vocabularyFixtures, VOCABULARY_REVIEW_FORMS, { audioIds: kanaAudioManifest.entries.map(({ id }) => id), existingIds: catalogIds }), ...validateGrammarContent(grammarFixtures)];
if (issues.length > 0) {
  process.stderr.write(`${issues.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Content valid (schema ${catalog.metadata.schemaVersion}, version ${catalog.metadata.contentVersion}; kana, vocabulary, and grammar fixtures valid).\n`);
}
