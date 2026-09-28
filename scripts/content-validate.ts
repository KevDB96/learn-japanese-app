import catalog from "../src/content/catalog.json" with { type: "json" };
import { validateContent } from "../src/lib/content/validator.ts";
import { kanaAudioManifest, kanaFixtures } from "../src/content/kana-fixtures.ts";
import { KANA_REVIEW_FORMS, validateKanaContent } from "../src/lib/content/kana.ts";

const issues = [...validateContent(catalog), ...validateKanaContent(kanaFixtures, KANA_REVIEW_FORMS, kanaAudioManifest)];
if (issues.length > 0) {
  process.stderr.write(`${issues.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Content valid (schema ${catalog.metadata.schemaVersion}, version ${catalog.metadata.contentVersion}; kana fixtures valid).\n`);
}
