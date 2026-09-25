/**
 * Filename heuristics for deciding whether a PDF on a printer thread is a
 * quote/invoice worth auto-extracting, versus print artwork (a proof, cover,
 * bleed, or the book interior itself). Pure string logic so both the Gmail
 * ingest and the manager reprocess path classify identically, and it is
 * unit-testable. A content-level guard in the extractor is the final safety net
 * for generically-named files that slip through here.
 */

/** Positive finance signal — a real invoice/quote, even when oddly named. */
const FINANCE_NAME_RE =
  /\b(invoice|quote|quotation|deposit|final|bill|statement|receipt|pro[-\s]?forma)\b/i;

/**
 * Names that indicate print-ready artwork or the book itself rather than a
 * finance doc: proofs, covers/jackets, bleeds/spreads, interiors/manuscripts,
 * and prepress terms. Matched only after the finance keywords, so
 * "book printing invoice.pdf" is still treated as finance.
 */
const ARTWORK_NAME_RE =
  /\b(proof|press[-\s]?ready|print[-\s]?ready|artwork|cover|jacket|bleed|spread|trim[-\s]?marks?|crop[-\s]?marks?|dieline|imposition|layout|interior|manuscript|galley|hi[-\s]?res|cmyk|rgb)\b/i;

/**
 * Whether a PDF filename should be auto-extracted as a printer quote/invoice. A
 * positive finance keyword always wins (real invoices are often named oddly,
 * e.g. `Rechnung.pdf`); otherwise accept any PDF that isn't obviously artwork or
 * a book file.
 */
export function looksLikePrintFinanceFile(filename: string | null | undefined): boolean {
  const name = filename ?? "";
  if (FINANCE_NAME_RE.test(name)) return true;
  return !ARTWORK_NAME_RE.test(name);
}
