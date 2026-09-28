import catalog from "../src/content/catalog.json" with { type: "json" };
import { validateContent } from "../src/lib/content/validator.ts";

const issues = validateContent(catalog);
if (issues.length > 0) {
  process.stderr.write(`${issues.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Content valid (schema ${catalog.metadata.schemaVersion}, version ${catalog.metadata.contentVersion}).\n`);
}
