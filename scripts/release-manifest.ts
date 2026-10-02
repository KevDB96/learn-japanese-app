import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import catalog from "../src/content/catalog.json" with { type: "json" };
import assets from "../public/assets/manifest.json" with { type: "json" };
import { kanaFixtures, katakanaFixtures, katakanaAdvancedFixtures, kanaAudioManifest } from "../src/content/kana-fixtures.ts";
import { vocabularyFixtures } from "../src/content/vocabulary-fixtures.ts";
import { grammarFixtures } from "../src/content/grammar-fixtures.ts";
import { phraseFixtures } from "../src/content/phrase-fixtures.ts";
import { KANA_REVIEW_FORMS } from "../src/lib/content/kana.ts";
import { VOCABULARY_REVIEW_FORMS } from "../src/lib/content/vocabulary.ts";
import { PHRASE_REVIEW_FORMS } from "../src/lib/content/phrases.ts";

const target = new URL("../src/content/release-manifest.json", import.meta.url);
const ids = (values: readonly { id: string }[]) => values.map(({ id }) => id);
const lessonBlocks = catalog.lessons.flatMap((lesson) => lesson.blocks);
const collections = {
  courses: ids(catalog.courses),
  units: ids(catalog.units),
  lessons: ids(catalog.lessons),
  lessonBlocks: ids(lessonBlocks),
  concepts: ids(catalog.concepts),
  sentences: ids(catalog.sentences),
  hiragana: ids(kanaFixtures),
  katakana: ids([...katakanaFixtures, ...katakanaAdvancedFixtures]),
  vocabulary: ids(vocabularyFixtures),
  grammar: ids(grammarFixtures),
  phrases: ids(phraseFixtures),
  reviewForms: [...KANA_REVIEW_FORMS, ...VOCABULARY_REVIEW_FORMS, ...PHRASE_REVIEW_FORMS].map(({ id }) => id),
  pronunciation: ids(kanaAudioManifest.entries),
};
const requiredFoundations = ["stage-0-introduction", "hiragana-foundations", "katakana-foundations"];
const requiredUnitIds = ["hiragana-foundations", "hiragana-n-through-n", "hiragana-marks-and-combinations", "katakana-foundations", "katakana-through-n", "katakana-voiced-and-combinations"];
const allUnitIds = new Set(catalog.units.map(({ id }) => id));
const missingCurriculum = [...requiredFoundations, ...requiredUnitIds].filter((id) => !allUnitIds.has(id));
if (missingCurriculum.length) throw new Error(`Beginner curriculum modules missing: ${missingCurriculum.join(", ")}`);
if (!catalog.courses.some((course) => course.startLessonIds.includes("introduction"))) throw new Error("Foundations must start from the introduction lesson");
const unitById = new Map(catalog.units.map((unit) => [unit.id, unit]));
for (const [unitId, lessonId] of [["stage-0-introduction", "introduction"], ["hiragana-foundations", "hiragana-a-row"], ["katakana-foundations", "katakana-a-row"]]) {
  if (!unitById.get(unitId)?.lessonIds.includes(lessonId)) throw new Error(`Beginner foundation ${unitId} must include ${lessonId}`);
}
if (!catalog.lessons.some(({ id }) => id === "hiragana-long-vowels") || !catalog.lessons.some(({ id }) => id === "katakana-loanword-sounds")) throw new Error("Hiragana and Katakana advanced beginner lessons are incomplete");
await access(new URL("../src/features/practice/KanaFluencyDrill.tsx", import.meta.url));
for (const profile of ["kevin", "janne"]) if (!assets.slots[`course.banner.${profile}.kana-fluency`]) throw new Error(`Kana Fluency art slot missing for ${profile}`);
const idsDigest = (value: readonly string[]) => createHash("sha256").update([...value].sort().join("\n")).digest("hex");
const assetFiles = Object.entries(assets.files).sort(([a], [b]) => a.localeCompare(b)).map(([path, item]) => ({ path, sha256: item.sha256, bytes: item.bytes }));
const release = {
  manifestVersion: 1,
  content: { schemaVersion: catalog.metadata.schemaVersion, contentVersion: catalog.metadata.contentVersion },
  pronunciationVersion: kanaAudioManifest.version,
  curriculum: {
    foundations: requiredFoundations,
    hiraganaUnits: requiredUnitIds.filter((id) => id.startsWith("hiragana-")),
    katakanaUnits: requiredUnitIds.filter((id) => id.startsWith("katakana-")),
    kanaFluency: "src/features/practice/KanaFluencyDrill.tsx",
  },
  counts: Object.fromEntries(Object.entries(collections).map(([name, list]) => [name, list.length])),
  ids: Object.fromEntries(Object.entries(collections).map(([name, list]) => [name, [...list]])),
  idSha256: Object.fromEntries(Object.entries(collections).map(([name, list]) => [name, idsDigest(list)])),
  assets: {
    manifestVersion: assets.schema_version,
    sourceHandoffSha256: assets.source_manifest.zip_sha256,
    slotCount: Object.keys(assets.slots).length,
    fileCount: assetFiles.length,
    totalBytes: assetFiles.reduce((sum, item) => sum + item.bytes, 0),
    files: assetFiles,
  },
};

function mismatch(expected: unknown, actual: unknown): boolean {
  return JSON.stringify(expected) !== JSON.stringify(actual);
}
const mode = process.argv[2] ?? "--check";
if (mode === "--write") {
  await writeFile(target, `${JSON.stringify(release, null, 2)}\n`, "utf8");
  process.stdout.write("Release manifest generated.\n");
} else if (mode === "--self-test") {
  const tampered = structuredClone(release);
  tampered.idSha256.lessons = "changed";
  if (!mismatch(release, tampered)) throw new Error("release manifest guard did not detect a changed frozen ID digest");
  process.stdout.write("Release manifest guard rejects changed frozen IDs.\n");
} else if (mode === "--check") {
  const recorded = JSON.parse(await readFile(target, "utf8"));
  if (mismatch(release, recorded)) {
    process.stderr.write("Release manifest is stale; review the content release, then regenerate it with `npm run release:manifest -- --write`.\n");
    process.exitCode = 1;
  } else process.stdout.write(`Release manifest valid (content ${release.content.contentVersion}; ${Object.values(release.counts).reduce((sum, count) => sum + count, 0)} IDs; ${release.assets.fileCount} assets).\n`);
} else throw new Error(`Unknown release manifest option: ${mode}`);
