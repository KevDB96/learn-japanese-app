import { readFile } from "node:fs/promises";

export function hasExplicitPass(result) {
  return /(?:^|\r?\n)VERDICT: PASS\r?\n?$/.test(result);
}

if (process.argv.includes("--self-test")) {
  if (!hasExplicitPass("checks green\nVERDICT: PASS\n") || hasExplicitPass("checks green\n") || hasExplicitPass("VERDICT: FAILED\n") || hasExplicitPass("VERDICT: PASS\nadditional output\n")) {
    console.error("Semantic verdict guard self-test failed");
    process.exitCode = 1;
  } else console.log("Semantic verdict guard rejects missing and non-PASS verdicts");
} else {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node scripts/semantic-verdict-guard.mjs <result-file>");
    process.exitCode = 2;
  } else if (!hasExplicitPass(await readFile(path, "utf8"))) {
    console.error("Result has no explicit VERDICT: PASS line");
    process.exitCode = 1;
  } else console.log("Explicit PASS verdict found");
}
