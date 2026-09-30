/** Normalize typography and edge whitespace without transliterating Japanese. */
export function normalizeRecallAnswer(value: string, language: "japanese" | "meaning"): string {
  const normalized = value.normalize(language === "meaning" ? "NFKC" : "NFC").trim().replace(/\s+/gu, " ");
  return language === "meaning" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

export function matchesRecallAnswer(answer: string, accepted: readonly string[], language: "japanese" | "meaning"): boolean {
  const normalized = normalizeRecallAnswer(answer, language);
  return normalized.length > 0 && accepted.some((candidate) => normalizeRecallAnswer(candidate, language) === normalized);
}
