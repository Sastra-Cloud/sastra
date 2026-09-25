export type VoiceDictionaryEntry = {
  term: string;
  aliases: readonly string[];
};

const WORD_CHARACTER = String.raw`[\p{L}\p{M}\p{N}]`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalized(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase();
}

/**
 * Replace explicit speech-to-text aliases with their canonical dictionary term.
 *
 * The aliases are escaped before being compiled and matched with Unicode-aware
 * boundaries. If the same alias points at more than one term, it is deliberately
 * ignored rather than guessing which name the speaker intended.
 */
export function applyVoiceDictionary(
  transcript: string,
  entries: readonly VoiceDictionaryEntry[]
): string {
  if (!transcript || entries.length === 0) return transcript;

  const candidates = new Map<string, Set<string>>();
  const spellings = new Map<string, string>();

  for (const entry of entries) {
    const term = entry.term.normalize("NFC").trim();
    if (!term) continue;

    for (const alias of [term, ...entry.aliases]) {
      const clean = alias.normalize("NFC").trim();
      if (!clean) continue;
      const key = normalized(clean);
      const terms = candidates.get(key) ?? new Set<string>();
      terms.add(term);
      candidates.set(key, terms);
      spellings.set(key, clean);
    }
  }

  const replacements = new Map<string, string>();
  for (const [alias, terms] of candidates) {
    if (terms.size === 1) replacements.set(alias, [...terms][0]);
  }
  if (replacements.size === 0) return transcript;

  const alternatives = [...replacements.keys()]
    .sort((a, b) => b.length - a.length)
    .map((key) => escapeRegExp(spellings.get(key) ?? key));
  const pattern = new RegExp(
    `(?<!${WORD_CHARACTER})(?:${alternatives.join("|")})(?!${WORD_CHARACTER})`,
    "giu"
  );

  return transcript.replace(pattern, (match) => {
    return replacements.get(normalized(match)) ?? match;
  });
}
