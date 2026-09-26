export const DOCUMENT_WORKFLOWS = [
  "agreement", "invoice", "rights_agreement", "rights_receipt", "print_quote",
] as const;
export type DocumentWorkflow = (typeof DOCUMENT_WORKFLOWS)[number];

const STOP = new Set(["the", "and", "for", "from", "with", "this", "that", "document", "page", "date", "name", "amount", "total", "project", "invoice", "agreement"]);

export function cueTokens(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z][a-z0-9]{3,}/g) ?? [])
    .filter((word) => !STOP.has(word) && !/^\d+$/.test(word))
    .slice(0, 500));
}

export function matchScore(current: string, example: string): number {
  const a = cueTokens(current);
  const b = cueTokens(example);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / Math.sqrt(a.size * b.size);
}

/** Examples are always same-workflow; weak matches are omitted. */
export function selectExamples<T extends { sourceText: string | null; sourceName: string | null }>(
  cases: T[], current: string, limit = 3
): T[] {
  const ranked = cases.map((item) => ({ item, score: matchScore(current, `${item.sourceName ?? ""}\n${item.sourceText ?? ""}`) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0]?.score ?? 0;
  return ranked.filter(({ score }) => score >= 0.18 && score >= best * 0.65)
    .slice(0, limit)
    .map(({ item }) => item);
}
