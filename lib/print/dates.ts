/**
 * Flexible date parsing for printer quotes/invoices. Printers write dates many
 * ways — ISO (`2026-05-26`), day-first (`26/05/2026`), month-first (`05/26/2026`),
 * and textual (`26 May 2026`, `May 26, 2026`). We normalize to ISO `YYYY-MM-DD`
 * and report whether a numeric date was genuinely ambiguous (both parts ≤ 12),
 * so the caller can flag it for review. Pure — no imports, unit-testable.
 */

export type FlexibleDate = { iso: string | null; ambiguous: boolean };

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function iso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function validYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (y < 1900 || y > 2200) return false;
  return true;
}

function expandYear(raw: string): number {
  const n = Number(raw);
  if (raw.length <= 2) return 2000 + n; // '26 → 2026
  return n;
}

/**
 * Parse a date out of arbitrary text. Prefers the first recognizable date.
 * Ambiguity rule: for numeric D/M vs M/D where both ≤ 12, prefer **day-first**
 * (international printers) and set `ambiguous: true`.
 */
export function parseFlexibleDate(raw: string | null | undefined): FlexibleDate {
  if (!raw) return { iso: null, ambiguous: false };
  const text = raw.trim();
  if (!text) return { iso: null, ambiguous: false };

  // 1. ISO-ish: YYYY[-/.]M[-/.]D — unambiguous.
  const isoMatch = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (validYmd(y, m, d)) return { iso: iso(y, m, d), ambiguous: false };
  }

  // 2. Textual: "26 May 2026" / "26 May, 2026".
  const dMonY = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{2,4})\b/);
  if (dMonY) {
    const m = MONTHS[dMonY[2].toLowerCase()];
    const d = Number(dMonY[1]);
    const y = expandYear(dMonY[3]);
    if (m && validYmd(y, m, d)) return { iso: iso(y, m, d), ambiguous: false };
  }

  // 3. Textual: "May 26, 2026" / "May 26 2026".
  const monDY = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})\b/);
  if (monDY) {
    const m = MONTHS[monDY[1].toLowerCase()];
    const d = Number(monDY[2]);
    const y = expandYear(monDY[3]);
    if (m && validYmd(y, m, d)) return { iso: iso(y, m, d), ambiguous: false };
  }

  // 4. Numeric D/M/YYYY or M/D/YYYY (also 2-digit year).
  const numeric = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const y = expandYear(numeric[3]);
    if (a > 12 && b <= 12 && validYmd(y, b, a)) {
      return { iso: iso(y, b, a), ambiguous: false }; // a must be day
    }
    if (b > 12 && a <= 12 && validYmd(y, a, b)) {
      return { iso: iso(y, a, b), ambiguous: false }; // b must be day → month-first
    }
    // Both ≤ 12: genuinely ambiguous. Prefer day-first (a = day, b = month).
    if (a <= 12 && b <= 12 && validYmd(y, b, a)) {
      return { iso: iso(y, b, a), ambiguous: true };
    }
  }

  return { iso: null, ambiguous: false };
}
