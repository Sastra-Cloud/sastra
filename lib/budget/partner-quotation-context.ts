import "server-only";
import { partnerBaseItems } from "./print-options";
import { getBudgetData } from "./queries";
import { budgetApprovalFingerprint } from "./approval-fingerprint";
import { listPartnerQuotations } from "./partner-quotation-queries";
import {
  PartnerQuotationError,
  quotationTotalCents,
  reviewQuotationLines,
  reviewQuotationPrintOptions,
} from "./partner-quotations";

/** Canonical saved share, never a client-provided recipient, total, or attachment. */
export async function getPartnerQuotationContext(
  projectId: string,
  printRunId: string | null | undefined,
  quotationId: string,
) {
  const [data, quotations] = await Promise.all([
    getBudgetData(projectId, printRunId ?? undefined),
    listPartnerQuotations(projectId, printRunId),
  ]);
  const quote = quotations.find((q) => q.id === quotationId);
  if (!quote)
    throw new PartnerQuotationError(
      "Partner quotation not found in this budget.",
    );
  if (
    quote.currency !== data.settings.currency ||
    quote.sourceFingerprint !==
      budgetApprovalFingerprint(data.settings, data.items, data.presentation)
  ) {
    throw new PartnerQuotationError(
      "The project quotation changed. Review and save this partner quotation again before exporting or sending.",
    );
  }
  reviewQuotationLines(
    quote.lines,
    partnerBaseItems(data.items, data.presentation?.printOptions),
    quotations.filter((q) => q.id !== quote.id),
  );
  const printOptions = reviewQuotationPrintOptions(
    quote.printOptions ?? [],
    data.presentation?.printOptions ?? [],
    quotations.filter((q) => q.id !== quote.id),
    data.settings.currency,
  );
  const settings = {
    ...data.settings,
    partnerName: quote.partnerName,
    partnerId: quote.partnerId,
    partnerContactFirstName: quote.contactName,
    partnerContactLastName: null,
    partnerContactEmail: quote.contactEmail,
    partnerContact: null,
    partnerContactId: null,
    workDescription: quote.description || quote.title,
  };
  const items = quote.lines.map((line) => {
    const source = data.items.find((item) => item.id === line.budgetItemId)!;
    const amount = (line.amountCents / 100).toFixed(2);
    return {
      ...source,
      label: line.label,
      partnerLabel: line.label,
      unit: "flat" as const,
      quantity: "1",
      unitPrice: amount,
      partnerUnitPrice: amount,
      amount,
      notes: null,
      amountSecured: "0",
      amountSpent: "0",
    };
  });
  return {
    quote,
    settings,
    items,
    printOptions,
    total: quotationTotalCents(quote) / 100,
  };
}
