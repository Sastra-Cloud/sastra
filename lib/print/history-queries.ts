import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  printContacts,
  printPayments,
  printQuotes,
  printRuns,
} from "@/lib/db/schema";

const BANDS = [
  { key: "<1,000", lo: 0, hi: 999 },
  { key: "1,000–1,999", lo: 1000, hi: 1999 },
  { key: "2,000–2,999", lo: 2000, hi: 2999 },
  { key: "3,000–4,999", lo: 3000, hi: 4999 },
  { key: "5,000+", lo: 5000, hi: Infinity },
] as const;

function bandKey(qty: number): string {
  return BANDS.find((b) => qty >= b.lo && qty <= b.hi)?.key ?? BANDS[0].key;
}

export type QuantityBandStat = {
  band: string;
  avgUnitPrice: number;
  minUnitPrice: number;
  maxUnitPrice: number;
  count: number;
};

export type PrinterHistory = {
  contactId: string;
  name: string;
  company: string | null;
  runsCount: number;
  quotesCount: number;
  acceptedCount: number;
  bands: QuantityBandStat[];
  /** Mean absolute % error of estimated vs quoted text pages (null if no data). */
  pageAccuracyPct: number | null;
  pageAccuracySample: number;
  /** Mean days from quote received to accepted (null if none accepted). */
  avgQuoteToAcceptDays: number | null;
  /** Mean days from wire requested to paid (null if none). */
  avgWireToPayDays: number | null;
  lastQuoteAt: string | null;
};

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

/**
 * Per-printer performance roll-up across runs/projects. Only from data that
 * actually exists: accepted price-per-copy by quantity band, page-estimate
 * accuracy (estimated vs quoted), and turnarounds derivable from quote/payment
 * timestamps. There is no delivery timestamp, so deposit→delivery is out of scope.
 */
export async function getPrinterHistory(): Promise<PrinterHistory[]> {
  const [contacts, quotes, runs, payments] = await Promise.all([
    db.select().from(printContacts).orderBy(printContacts.name),
    db
      .select({
        contactId: printQuotes.contactId,
        runId: printQuotes.runId,
        projectId: printQuotes.projectId,
        quantityCps: printQuotes.quantityCps,
        unitPrice: printQuotes.unitPrice,
        reviewStatus: printQuotes.reviewStatus,
        createdAt: printQuotes.createdAt,
        acceptedAt: printQuotes.acceptedAt,
      })
      .from(printQuotes),
    db
      .select({
        contactId: printRuns.contactId,
        estimatedTextPages: printRuns.estimatedTextPages,
        quotedTextPages: printRuns.quotedTextPages,
      })
      .from(printRuns),
    db
      .select({
        contactId: printRuns.contactId,
        wireRequestedAt: printPayments.wireRequestedAt,
        paidAt: printPayments.paidAt,
      })
      .from(printPayments)
      .innerJoin(printRuns, eq(printRuns.id, printPayments.runId))
      .where(
        and(
          isNotNull(printPayments.wireRequestedAt),
          isNotNull(printPayments.paidAt)
        )
      ),
  ]);

  return contacts.map((c) => {
    const cQuotes = quotes.filter((q) => q.contactId === c.id);
    const cRuns = runs.filter((r) => r.contactId === c.id);
    const cPayments = payments.filter((p) => p.contactId === c.id);

    // Accepted price-per-copy by quantity band.
    const byBand = new Map<string, number[]>();
    for (const q of cQuotes) {
      if (q.reviewStatus !== "accepted") continue;
      const qty = q.quantityCps;
      const price = q.unitPrice != null ? Number(q.unitPrice) : NaN;
      if (!qty || !Number.isFinite(price)) continue;
      const key = bandKey(qty);
      const arr = byBand.get(key) ?? [];
      arr.push(price);
      byBand.set(key, arr);
    }
    const bands: QuantityBandStat[] = BANDS.map((b) => b.key)
      .filter((key) => byBand.has(key))
      .map((key) => {
        const prices = byBand.get(key)!;
        return {
          band: key,
          avgUnitPrice: prices.reduce((s, x) => s + x, 0) / prices.length,
          minUnitPrice: Math.min(...prices),
          maxUnitPrice: Math.max(...prices),
          count: prices.length,
        };
      });

    // Page-estimate accuracy: |estimated − quoted| / quoted, where both exist.
    const errs: number[] = [];
    for (const r of cRuns) {
      if (r.quotedTextPages && r.quotedTextPages > 0) {
        errs.push(Math.abs(r.estimatedTextPages - r.quotedTextPages) / r.quotedTextPages);
      }
    }
    const pageAccuracyPct = errs.length ? (mean(errs) as number) * 100 : null;

    const quoteToAccept = cQuotes
      .filter((q) => q.acceptedAt)
      .map((q) => daysBetween(q.createdAt, q.acceptedAt!));
    const wireToPay = cPayments.map((p) =>
      daysBetween(p.wireRequestedAt!, p.paidAt!)
    );

    const quoteDates = cQuotes.map((q) => q.createdAt.getTime());

    return {
      contactId: c.id,
      name: c.name,
      company: c.company,
      runsCount: cRuns.length,
      quotesCount: cQuotes.length,
      acceptedCount: cQuotes.filter((q) => q.reviewStatus === "accepted").length,
      bands,
      pageAccuracyPct,
      pageAccuracySample: errs.length,
      avgQuoteToAcceptDays: mean(quoteToAccept),
      avgWireToPayDays: mean(wireToPay),
      lastQuoteAt: quoteDates.length
        ? new Date(Math.max(...quoteDates)).toISOString()
        : null,
    };
  });
}
