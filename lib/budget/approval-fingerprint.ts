import { createHash } from "node:crypto";

import type {
  BudgetLine,
  BudgetPresentation,
  BudgetSettings,
} from "@/lib/budget/queries";
import type { PartnerQuotationDTO } from "./partner-quotations";
import { partnerQuotePrices } from "./print-options";

function decimal(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(value);
}

/**
 * Hash only fields that change the partner-facing quotation. Funding progress,
 * actual spend, and internal notes deliberately do not participate.
 */
export function budgetApprovalFingerprint(
  settings: BudgetSettings,
  items: BudgetLine[],
  presentation?: BudgetPresentation | null,
  partnerQuotations: PartnerQuotationDTO[] = [],
): string {
  const quotation = {
    ...(partnerQuotations.length
      ? {
          partnerQuotations: partnerQuotations
            .map((q) => ({
              id: q.id,
              title: q.title,
              partnerId: q.partnerId,
              partnerName: q.partnerName,
              contactName: q.contactName,
              contactEmail: q.contactEmail,
              description: q.description,
              currency: q.currency,
              lines: q.lines,
              ...(q.printOptions?.length ? { printOptions: q.printOptions } : {}),
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        }
      : {}),
    settings: {
      wordCount: settings.wordCount,
      sourcePageCount: settings.sourcePageCount,
      wordsPerPage: settings.wordsPerPage,
      currency: settings.currency,
      rateTranslation: decimal(settings.rateTranslation),
      rateProofreading: decimal(settings.rateProofreading),
      rateEditing: decimal(settings.rateEditing),
      rateCoverDesign: decimal(settings.rateCoverDesign),
      rateTypesetting: decimal(settings.rateTypesetting),
      rateProjectManagement: decimal(settings.rateProjectManagement),
      ratePrintShip: decimal(settings.ratePrintShip),
      rateAudiobook: decimal(settings.rateAudiobook),
      rateVideoSeries: decimal(settings.rateVideoSeries),
      partnerName: settings.partnerName,
      partnerContactFirstName: settings.partnerContactFirstName,
      partnerContactLastName: settings.partnerContactLastName,
      partnerContactEmail: settings.partnerContactEmail,
      partnerContact: settings.partnerContact,
      partnerId: settings.partnerId,
      partnerContactId: settings.partnerContactId,
      workDescription: settings.workDescription,
    },
    items: items.map((item) => ({
      printRunId: item.printRunId,
      group: item.group,
      category: item.category,
      label: item.label,
      partnerLabel: item.partnerLabel,
      partnerUnitPrice: decimal(item.partnerUnitPrice),
      partnerVisible: item.partnerVisible,
      sortOrder: item.sortOrder,
      unit: item.unit,
      quantity: decimal(item.quantity),
      unitPrice: decimal(item.unitPrice),
      amount: decimal(item.amount),
      currency: item.currency,
    })),
    presentation: presentation
      ? {
          mode: presentation.mode,
          deductionBps: presentation.deductionBps,
          publicDescription: presentation.publicDescription,
          perCopyQuantity: presentation.perCopyQuantity,
          perCopyUnitPrice: decimal(presentation.perCopyUnitPrice),
          ...(presentation.printOptions?.length
            ? { printOptions: presentation.printOptions }
            : {}),
        }
      : null,
  };

  return createHash("sha256").update(JSON.stringify(quotation)).digest("hex");
}

export function budgetApprovalTotal(
  items: BudgetLine[],
  presentation?: BudgetPresentation | null,
): string {
  if (!presentation) {
    return items
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
      .toFixed(2);
  }
  if (presentation.mode === "per_copy") {
    return (
      (presentation.perCopyQuantity ?? 0) *
      Number(presentation.perCopyUnitPrice ?? 0)
    ).toFixed(2);
  }
  // Legacy single-amount records use the lowest available choice, never the sum.
  return (
    partnerQuotePrices(items, presentation.printOptions).minimumCents / 100
  ).toFixed(2);
}
