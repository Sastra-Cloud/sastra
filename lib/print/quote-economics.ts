export type PrintQuoteEconomicsInput = {
  id: string;
  reviewStatus: string;
  quantityCps: number | null;
  unitPrice: string | number | null;
  totalAmount: string | number | null;
  currency: string;
};

export type PrintQuoteTier = {
  quoteId: string;
  quantity: number;
  totalCost: number;
  unitCost: number;
  currency: string;
  reviewStatus: string;
  totalWasCalculated: boolean;
};

export type PrintQuoteStepUp = {
  from: PrintQuoteTier;
  to: PrintQuoteTier;
  extraCopies: number;
  extraSpend: number;
  incrementalUnitCost: number;
  incrementalSavingsPercent: number | null;
  valueThresholdQuantity: number | null;
  valueThresholdPercent: number | null;
};

export type PrintQuoteComparisonGroup = {
  currency: string;
  tiers: PrintQuoteTier[];
  steps: PrintQuoteStepUp[];
  /** Destination tier of the cheapest useful adjacent step-up. */
  recommendedQuoteId: string | null;
  bestUnitQuoteId: string;
  lowestOutlayQuoteId: string;
  bestStep: PrintQuoteStepUp | null;
  maximumTotalCost: number;
};

function positiveNumber(value: string | number | null): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Prefer a quoted total. If the printer only supplied a per-copy price, derive
 * the total so the UI can still show the cash commitment consistently.
 */
export function getPrintQuoteTotal(
  quote: Pick<
    PrintQuoteEconomicsInput,
    "quantityCps" | "unitPrice" | "totalAmount"
  >,
): { totalCost: number; calculated: boolean } | null {
  const quotedTotal = positiveNumber(quote.totalAmount);
  if (quotedTotal !== null) {
    return { totalCost: quotedTotal, calculated: false };
  }

  const quantity = positiveNumber(quote.quantityCps);
  const unitPrice = positiveNumber(quote.unitPrice);
  if (quantity === null || unitPrice === null) return null;

  return { totalCost: quantity * unitPrice, calculated: true };
}

/**
 * One print run is one financial commitment even when it has separate accepted
 * deposit and final-invoice documents. Use the largest accepted total per run
 * rather than adding document stages together.
 */
export function acceptedPrintCommitmentTotal(
  quotes: Array<
    PrintQuoteEconomicsInput & {
      runId: string;
    }
  >,
): number {
  const byRun = new Map<string, number>();
  for (const quote of quotes) {
    if (quote.reviewStatus !== "accepted") continue;
    const total = getPrintQuoteTotal(quote)?.totalCost ?? 0;
    byRun.set(quote.runId, Math.max(byRun.get(quote.runId) ?? 0, total));
  }
  return [...byRun.values()].reduce((sum, total) => sum + total, 0);
}

function reviewRank(status: string): number {
  if (status === "accepted") return 3;
  if (status === "active") return 2;
  if (status === "suggested" || status === "requested") return 1;
  return 0;
}

function preferTier(current: PrintQuoteTier, candidate: PrintQuoteTier) {
  const rankDifference =
    reviewRank(candidate.reviewStatus) - reviewRank(current.reviewStatus);
  if (rankDifference !== 0) return rankDifference > 0 ? candidate : current;
  return candidate.totalCost < current.totalCost ? candidate : current;
}

function toTier(quote: PrintQuoteEconomicsInput): PrintQuoteTier | null {
  if (quote.reviewStatus === "rejected") return null;
  const quantity = positiveNumber(quote.quantityCps);
  const total = getPrintQuoteTotal(quote);
  if (quantity === null || total === null) return null;

  return {
    quoteId: quote.id,
    quantity,
    totalCost: total.totalCost,
    unitCost: total.totalCost / quantity,
    currency: quote.currency,
    reviewStatus: quote.reviewStatus,
    totalWasCalculated: total.calculated,
  };
}

function stepBetween(
  from: PrintQuoteTier,
  to: PrintQuoteTier,
): PrintQuoteStepUp {
  const extraCopies = to.quantity - from.quantity;
  const extraSpend = to.totalCost - from.totalCost;
  const incrementalUnitCost = extraSpend / extraCopies;
  const incrementalSavingsPercent =
    incrementalUnitCost >= 0 && from.unitCost > 0
      ? ((from.unitCost - incrementalUnitCost) / from.unitCost) * 100
      : null;

  // How many copies from the larger run must actually be used before its
  // effective cost per used copy matches the smaller tier's unit cost.
  const threshold = Math.ceil(to.totalCost / from.unitCost);
  const thresholdFitsRun = threshold <= to.quantity;

  return {
    from,
    to,
    extraCopies,
    extraSpend,
    incrementalUnitCost,
    incrementalSavingsPercent,
    valueThresholdQuantity: thresholdFitsRun ? threshold : null,
    valueThresholdPercent: thresholdFitsRun
      ? (threshold / to.quantity) * 100
      : null,
  };
}

/**
 * Builds comparable quantity tiers without mixing currencies. Duplicate
 * quantities prefer an accepted quote, then an active quote, then the cheaper
 * quote at the same review level.
 */
export function buildPrintQuoteComparisonGroups(
  quotes: PrintQuoteEconomicsInput[],
): PrintQuoteComparisonGroup[] {
  const grouped = new Map<string, Map<number, PrintQuoteTier>>();

  for (const quote of quotes) {
    const tier = toTier(quote);
    if (!tier) continue;
    const currencyTiers = grouped.get(tier.currency) ?? new Map();
    const existing = currencyTiers.get(tier.quantity);
    currencyTiers.set(
      tier.quantity,
      existing ? preferTier(existing, tier) : tier,
    );
    grouped.set(tier.currency, currencyTiers);
  }

  const comparisons: PrintQuoteComparisonGroup[] = [];
  for (const [currency, tierMap] of grouped) {
    const tiers = [...tierMap.values()].toSorted(
      (left, right) => left.quantity - right.quantity,
    );
    if (tiers.length < 2) continue;

    const steps = tiers.slice(1).map((tier, index) =>
      stepBetween(tiers[index], tier),
    );
    const lowestOutlay = tiers.reduce((best, tier) =>
      tier.totalCost < best.totalCost ? tier : best,
    );
    const bestUnit = tiers.reduce((best, tier) =>
      tier.unitCost < best.unitCost ? tier : best,
    );
    const usefulSteps = steps.filter(
      (step) =>
        step.extraSpend > 0 &&
        step.incrementalUnitCost >= 0 &&
        step.incrementalUnitCost < step.from.unitCost,
    );
    const bestStep = usefulSteps.reduce<PrintQuoteStepUp | null>(
      (best, step) =>
        best === null || step.incrementalUnitCost < best.incrementalUnitCost
          ? step
          : best,
      null,
    );

    comparisons.push({
      currency,
      tiers,
      steps,
      recommendedQuoteId: bestStep?.to.quoteId ?? null,
      bestUnitQuoteId: bestUnit.quoteId,
      lowestOutlayQuoteId: lowestOutlay.quoteId,
      bestStep,
      maximumTotalCost: Math.max(...tiers.map((tier) => tier.totalCost)),
    });
  }

  return comparisons.toSorted(
    (left, right) => right.tiers.length - left.tiers.length,
  );
}
