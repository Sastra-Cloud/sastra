import { z } from "zod";
import { grossTargetCents, partnerQuoteTotalCents, sumAmountCents } from "./compute";
import { applyPartnerRates, type PartnerQuoteLine } from "./partner-line-state";

export const partnerPrintOptionSchema = z.object({
  sourceQuoteId: z.uuid(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  quantity: z.number().int().positive().max(2_147_483_647),
  printingCostCents: z.number().int().positive().max(999_999_999_999),
  partnerAmountCents: z.number().int().nonnegative().max(999_999_999_999),
  label: z.string().trim().min(1).max(200),
});

/** Reviewed snapshots: later printer edits must not silently change a partner quote. */
export type PartnerPrintOption = z.infer<typeof partnerPrintOptionSchema>;
export type PartnerPrintCandidate = {
  sourceQuoteId: string;
  quantity: number;
  printingCostCents: number;
  currency: string;
  printer: string;
  specifications: string;
  sourceThreadId: string | null;
};

/** Cover each complete project independently after the donation fee is retained. */
export function fundPartnerPrintOptions(options: PartnerPrintOption[], baseCents: number, internalBaseCents: number, deductionBps: number): PartnerPrintOption[] {
  return options.map((option) => ({
    ...option,
    partnerAmountCents: Math.max(0, grossTargetCents(internalBaseCents + option.printingCostCents, deductionBps) - baseCents),
  }));
}

/**
 * Reprice every quantity against the shared lines as they will be after `rates`
 * are applied. Pricing against the old shared subtotal would charge the fee
 * twice when the shared rates go up, or leave a quantity short when they go down.
 */
export function fundPartnerPrintOptionsForRates<T extends PartnerQuoteLine>(items: T[], options: PartnerPrintOption[], rates: Record<string, string | null>, deductionBps: number): PartnerPrintOption[] {
  const shared = items.filter((item) => item.category !== "print_ship");
  return fundPartnerPrintOptions(options, partnerQuoteTotalCents(applyPartnerRates(shared, rates)), sumAmountCents(shared), deductionBps);
}

/** Add every reviewed quantity without duplicating sources or replacing edited prices. */
export function addPartnerPrintOptions(existing: PartnerPrintOption[], candidates: PartnerPrintCandidate[], currency: string, baseCents: number, internalBaseCents: number, deductionBps: number): PartnerPrintOption[] {
  const included = new Set(existing.map((option) => option.sourceQuoteId));
  const additions = candidates.flatMap((candidate) => {
    if (candidate.currency !== currency || included.has(candidate.sourceQuoteId)) return [];
    included.add(candidate.sourceQuoteId);
    return [{ sourceQuoteId: candidate.sourceQuoteId, currency, quantity: candidate.quantity,
      printingCostCents: candidate.printingCostCents, partnerAmountCents: 0, label: "Printing" }];
  });
  if (existing.length + additions.length > 30) throw new Error("A partner quote can include up to 30 printing options.");
  return [...existing, ...fundPartnerPrintOptions(additions, baseCents, internalBaseCents, deductionBps)];
}

/** Printing choices replace the ordinary print line, rather than counting it twice. */
export function partnerBaseItems<T extends PartnerQuoteLine & { category?: string }>(items: T[], options?: PartnerPrintOption[]) {
  return options?.length ? items.filter((item) => item.category !== "print_ship") : items;
}

export function partnerQuotePrices(items: (PartnerQuoteLine & { category?: string })[], options: PartnerPrintOption[] = []) {
  const baseCents = partnerQuoteTotalCents(partnerBaseItems(items, options));
  const prices = options.map((option) => baseCents + option.partnerAmountCents);
  return { baseCents, minimumCents: prices.length ? Math.min(...prices) : baseCents, maximumCents: prices.length ? Math.max(...prices) : baseCents };
}

/** Only copy a quote from this project's eligible scope, in the budget currency. */
export function reviewPartnerPrintOptions(options: PartnerPrintOption[], existing: PartnerPrintOption[], candidates: PartnerPrintCandidate[], currency: string) {
  if (new Set(options.map((option) => option.sourceQuoteId)).size !== options.length) {
    throw new Error("Each printer quote can only be added once.");
  }
  return options.map((option) => {
    if (option.currency !== currency) throw new Error("Printing options must use the budget currency. Remove and review these options again.");
    const previous = existing.find((saved) => saved.sourceQuoteId === option.sourceQuoteId);
    if (previous && previous.quantity === option.quantity && previous.printingCostCents === option.printingCostCents) return option;
    const source = candidates.find((candidate) => candidate.sourceQuoteId === option.sourceQuoteId);
    if (!source || source.currency !== currency || source.quantity !== option.quantity || source.printingCostCents !== option.printingCostCents) {
      throw new Error("A printer quote changed or is unavailable in this budget currency. Refresh and review it again.");
    }
    return option;
  });
}
