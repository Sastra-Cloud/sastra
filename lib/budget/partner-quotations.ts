import { z } from "zod";
import {
  partnerPrintOptionSchema,
  type PartnerPrintOption,
} from "./print-options";
import { lineAmountCents } from "./compute";
import type { PartnerQuoteLine } from "./partner-line-state";

export class PartnerQuotationError extends Error {}

export type PartnerQuotationLine = {
  budgetItemId: string;
  label: string;
  amountCents: number;
};
export type PartnerQuotationDTO = {
  id: string;
  title: string;
  partnerId: string | null;
  partnerName: string;
  contactName: string;
  contactEmail: string;
  description: string;
  currency: string;
  lines: PartnerQuotationLine[];
  sourceFingerprint: string;
  printOptions?: PartnerPrintOption[];
};

export const partnerQuotationSchema = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    printRunId: z.uuid().nullable(),
    title: z.string().trim().min(1, "Enter a quotation title.").max(200),
    partnerId: z.uuid().nullable(),
    partnerName: z.string().trim().max(200),
    contactName: z.string().trim().max(200),
    contactEmail: z.union([z.email(), z.literal("")]),
    description: z.string().trim().max(2000),
    printOptions: z.array(partnerPrintOptionSchema).max(30).optional(),
    lines: z
      .array(
        z.object({
          budgetItemId: z.uuid(),
          amountCents: z.number().int().positive().max(999_999_999_999),
        }),
      )
      .max(200),
  })
  .refine(
    (quote) => quote.lines.length > 0 || (quote.printOptions?.length ?? 0) > 0,
    "Choose at least one cost.",
  );
export type PartnerQuotationInput = z.infer<typeof partnerQuotationSchema>;

export function quotationTotalCents(
  quote: Pick<PartnerQuotationDTO, "lines" | "printOptions">,
): number {
  return (
    quote.lines.reduce((sum, line) => sum + line.amountCents, 0) +
    (quote.printOptions?.length
      ? Math.min(
          ...quote.printOptions.map((option) => option.partnerAmountCents),
        )
      : 0)
  );
}

export function publicLineCents(line: PartnerQuoteLine): number {
  return lineAmountCents(
    line.quantity,
    line.partnerUnitPrice ?? line.unitPrice,
  );
}

export function assignedLineCents(
  quotes: Pick<PartnerQuotationDTO, "lines">[],
  itemId: string,
): number {
  return quotes.reduce(
    (sum, quote) =>
      sum +
      quote.lines
        .filter((line) => line.budgetItemId === itemId)
        .reduce((subtotal, line) => subtotal + line.amountCents, 0),
    0,
  );
}

/** Validate against canonical public costs, including other partners' shares. Never trust client labels. */
export function reviewQuotationLines(
  input: PartnerQuotationInput["lines"],
  items: PartnerQuoteLine[],
  others: Pick<PartnerQuotationDTO, "lines">[],
): PartnerQuotationLine[] {
  if (new Set(input.map((line) => line.budgetItemId)).size !== input.length)
    throw new PartnerQuotationError("Choose each cost only once.");
  return input.map((line) => {
    const item = items.find(
      (item) => item.id === line.budgetItemId && item.partnerVisible,
    );
    if (!item)
      throw new PartnerQuotationError(
        "A selected cost is no longer available. Review the project quotation.",
      );
    if (
      line.amountCents + assignedLineCents(others, item.id) >
      publicLineCents(item)
    )
      throw new PartnerQuotationError(
        "Partner shares exceed a planned cost. Reduce the amount or edit the other quotation.",
      );
    return { ...line, label: item.partnerLabel?.trim() || item.label };
  });
}

/** Stable review token excludes timestamps and transport object key order. */
export function partnerQuotationVersion(quote: PartnerQuotationDTO): string {
  return JSON.stringify([
    quote.id,
    quote.title,
    quote.partnerId,
    quote.partnerName,
    quote.contactName,
    quote.contactEmail,
    quote.description,
    quote.currency,
    quote.sourceFingerprint,
    ...(quote.printOptions?.length ? [quote.printOptions] : []),
    quote.lines.map((line) => [
      line.budgetItemId,
      line.label,
      line.amountCents,
    ]),
  ]);
}

/** Allocate each printing alternative independently; never sum alternative quantities. */
export function reviewQuotationPrintOptions(
  input: PartnerPrintOption[],
  available: PartnerPrintOption[],
  others: Pick<PartnerQuotationDTO, "printOptions">[],
  currency: string,
): PartnerPrintOption[] {
  if (
    new Set(input.map((option) => option.sourceQuoteId)).size !== input.length
  )
    throw new PartnerQuotationError("Choose each printing quantity only once.");
  return input.map((option) => {
    const source = available.find(
      (candidate) =>
        candidate.sourceQuoteId === option.sourceQuoteId &&
        candidate.currency === currency,
    );
    if (!source)
      throw new PartnerQuotationError(
        "A printing option is unavailable. Review the project quotation.",
      );
    const assigned = others.reduce(
      (sum, quote) =>
        sum +
        (quote.printOptions?.find(
          (candidate) => candidate.sourceQuoteId === source.sourceQuoteId,
        )?.partnerAmountCents ?? 0),
      0,
    );
    if (
      option.partnerAmountCents <= 0 ||
      option.partnerAmountCents + assigned > source.partnerAmountCents
    )
      throw new PartnerQuotationError(
        "Partner shares exceed a printing price. Reduce the amount or edit the other quotation.",
      );
    return { ...source, partnerAmountCents: option.partnerAmountCents };
  });
}
