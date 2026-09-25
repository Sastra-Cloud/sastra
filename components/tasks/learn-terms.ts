import { toast } from "sonner";

import { addDictionaryTerm } from "@/lib/dictionary/actions";

const WORD_RE = /[A-Za-z][A-Za-z'’-]*/g;

/**
 * Words that appear in the corrected title but not the original and look like
 * proper nouns (contain an uppercase letter) — candidate custom vocabulary.
 */
export function suggestNewTerms(oldTitle: string, newTitle: string): string[] {
  const lower = (s: string) => s.toLowerCase();
  const had = new Set((oldTitle.match(WORD_RE) ?? []).map(lower));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of newTitle.match(WORD_RE) ?? []) {
    if (w.length < 3 || had.has(lower(w)) || seen.has(lower(w))) continue;
    if (!/[A-Z]/.test(w)) continue; // proper-noun-ish only
    seen.add(lower(w));
    out.push(w);
  }
  return out.slice(0, 3);
}

/**
 * After a title correction, offer to teach voice the newly-added word so future
 * dictation spells it right (e.g. a misheard organization or book name).
 */
export function offerToLearnTerms(oldTitle: string, newTitle: string): void {
  const [term] = suggestNewTerms(oldTitle, newTitle);
  if (!term) return;
  toast(`Add “${term}” to the voice dictionary?`, {
    action: {
      label: "Add",
      onClick: () => {
        void addDictionaryTerm(term).then((res) => {
          if (res.error) toast.error(res.error);
          else toast.success(`Added “${term}” — voice will spell it right.`);
        });
      },
    },
  });
}
