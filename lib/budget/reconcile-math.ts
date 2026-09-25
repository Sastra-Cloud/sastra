/**
 * Pure reconciliation + cash-flow math for the budget tab. Money is compared in
 * integer cents to avoid float drift (mirrors lib/budget/compute.ts). No DB.
 */

export function toCents(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function centsToAmount(cents: number): number {
  return Math.round(cents) / 100;
}

export type ReconRow = {
  budgetItemId: string;
  category: string;
  label: string;
  currency: string;
  /** The line's manual "Spent" value, cents. */
  spentManualCents: number;
  /** Sum of recorded paid payments mapped to this line, cents. */
  spentRecordedCents: number;
  varianceCents: number; // recorded − manual
  paymentCount: number;
};

/**
 * Compare each mappable quotation line's manual Spent against recorded paid
 * payments. Today only `print_ship` maps (paid print payments); the structure
 * takes a map so future mappings (e.g. per-category expenses) slot in.
 * Payments in a different currency than the line are excluded (no FX),
 * matching `syncPrintSpentToBudget`.
 */
export function reconcileLines(input: {
  items: {
    id: string;
    category: string;
    label: string;
    currency: string;
    amountSpent: string | number;
  }[];
  paymentsByCategory: Record<
    string,
    { amount: string | number; currency: string }[]
  >;
}): ReconRow[] {
  const rows: ReconRow[] = [];
  for (const item of input.items) {
    const payments = input.paymentsByCategory[item.category];
    if (!payments) continue; // unmappable category — nothing recorded to compare
    const lineCurrency = item.currency || "USD";
    const matching = payments.filter((p) => (p.currency || "USD") === lineCurrency);
    const spentRecordedCents = matching.reduce((s, p) => s + toCents(p.amount), 0);
    const spentManualCents = toCents(item.amountSpent);
    rows.push({
      budgetItemId: item.id,
      category: item.category,
      label: item.label,
      currency: lineCurrency,
      spentManualCents,
      spentRecordedCents,
      varianceCents: spentRecordedCents - spentManualCents,
      paymentCount: matching.length,
    });
  }
  return rows;
}

export type CashflowMonth = {
  /** yyyy-mm */
  month: string;
  inCents: number;
  outCents: number;
  netCents: number;
  cumulativeCents: number;
};

function monthOf(date: string | Date): string | null {
  if (date instanceof Date) return date.toISOString().slice(0, 7);
  const m = /^(\d{4}-\d{2})/.exec(date);
  return m ? m[1] : null;
}

/**
 * Monthly cash-flow: money in (funding receipts) vs money out (paid payments),
 * with running cumulative net. Months are contiguous from first to last event.
 */
export function computeCashflow(input: {
  inflows: { amount: string | number; date: string | Date | null }[];
  outflows: { amount: string | number; date: string | Date | null }[];
}): CashflowMonth[] {
  const byMonth = new Map<string, { inCents: number; outCents: number }>();
  const bump = (
    date: string | Date | null,
    key: "inCents" | "outCents",
    amount: string | number
  ) => {
    if (!date) return;
    const month = monthOf(date);
    if (!month) return;
    const entry = byMonth.get(month) ?? { inCents: 0, outCents: 0 };
    entry[key] += toCents(amount);
    byMonth.set(month, entry);
  };
  for (const r of input.inflows) bump(r.date, "inCents", r.amount);
  for (const p of input.outflows) bump(p.date, "outCents", p.amount);
  if (byMonth.size === 0) return [];

  const months = [...byMonth.keys()].sort();
  // Fill gaps so the trend line doesn't skip empty months.
  const filled: string[] = [];
  const [startY, startM] = months[0].split("-").map(Number);
  const [endY, endM] = months[months.length - 1].split("-").map(Number);
  for (let y = startY, m = startM; y < endY || (y === endY && m <= endM); ) {
    filled.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  let cumulative = 0;
  return filled.map((month) => {
    const entry = byMonth.get(month) ?? { inCents: 0, outCents: 0 };
    const netCents = entry.inCents - entry.outCents;
    cumulative += netCents;
    return {
      month,
      inCents: entry.inCents,
      outCents: entry.outCents,
      netCents,
      cumulativeCents: cumulative,
    };
  });
}
