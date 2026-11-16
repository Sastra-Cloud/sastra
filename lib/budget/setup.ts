import { z } from "zod";

import {
  groupForCategory,
  lineAmountCents,
  STANDARD_LINES,
  type BudgetRates,
} from "./compute";
import {
  proposalCostRows,
  proposalCostSchema,
  type ProposalCost,
} from "./proposal-builder";

/**
 * Guided budget setup: book size, chosen costs, and the funding partner are
 * saved together. Pure and client-safe; the server action is in
 * `setup-actions.ts`.
 */

const partnerSchema = z.object({
  partnerId: z.string().uuid().nullable(),
  contactId: z.string().uuid().nullable(),
  name: z.string().trim().min(1, "Enter the partner’s name.").max(200),
  firstName: z.string().trim().max(120),
  lastName: z.string().trim().max(120),
  email: z.union([
    z.literal(""),
    z.string().trim().email("Enter a valid email address.").max(320),
  ]),
});

export const budgetSetupSchema = z.object({
  /** Stable per form, so a retry after a lost reply cannot add costs twice. */
  requestId: z.string().uuid(),
  wordCount: z.number().int().min(0).max(100_000_000),
  sourcePageCount: z.number().int().min(0).max(1_000_000),
  lines: z
    .array(proposalCostSchema)
    .min(1, "Choose at least one cost.")
    .max(40)
    // The printing cost comes from a printer estimate or quote, never from here.
    .refine((lines) => lines.every((line) => line.category !== "print_ship"), {
      message: "Add the printing cost from a printer estimate.",
    }),
  partner: partnerSchema.nullable(),
});

export type BudgetSetupInput = z.infer<typeof budgetSetupSchema>;
export type BudgetSetupPartner = z.infer<typeof partnerSchema>;

export type BudgetSetupBasis = {
  wordsPerPage: number;
  languageExpansionFactor: string | number;
};

/** A cost in the guided form: a standard cost can be left out. */
export type SetupCostDraft = ProposalCost & { key: string; included: boolean };

/** Standard costs at this project's rates. Audio and video start unchecked. */
export function setupStandardCosts(rates: BudgetRates): SetupCostDraft[] {
  return STANDARD_LINES.map((line) => ({
    key: line.category,
    category: line.category,
    label: line.label,
    unit: line.unit,
    quantity: line.unit === "words" || line.unit === "pages" ? 0 : 1,
    // Rates are stored as single-precision numbers; without rounding a rate
    // of 0.03 is shown as 0.029999999329447743.
    unitPrice: Number(Number(rates[line.rateKey]).toPrecision(6)),
    autoQuantity: true,
    included: line.group === "book_publishing",
  }));
}

/** Rows to insert, using the same quantity and cents math as the live preview. */
export function budgetSetupRows(
  input: Pick<BudgetSetupInput, "wordCount" | "sourcePageCount" | "lines">,
  basis: BudgetSetupBasis,
  currency: string
) {
  const rows = proposalCostRows(input, {
    wordsPerPage: basis.wordsPerPage,
    languageExpansionFactor: String(basis.languageExpansionFactor),
  });
  return rows.map((line, sortOrder) => ({
    group: groupForCategory(line.category),
    category: line.category,
    label: line.label,
    unit: line.unit,
    quantity: line.quantity.toFixed(2),
    unitPrice: line.unitPrice.toFixed(4),
    amount: line.amount,
    currency,
    isAutoQuantity: line.autoQuantity,
    amountSecured: "0",
    amountSpent: "0",
    partnerVisible: true,
    sortOrder,
  }));
}

export function budgetSetupTotalCents(
  rows: ReadonlyArray<{ quantity: string | number; unitPrice: string | number }>
): number {
  return rows.reduce(
    (total, row) => total + lineAmountCents(row.quantity, row.unitPrice),
    0
  );
}

/** Word and page costs that cannot be calculated because the size is unknown. */
export function setupCostsWaitingForSize(
  input: Pick<BudgetSetupInput, "wordCount" | "sourcePageCount" | "lines">
): number {
  const known = input.wordCount > 0 || input.sourcePageCount > 0;
  if (known) return 0;
  return input.lines.filter(
    (line) =>
      line.autoQuantity && (line.unit === "words" || line.unit === "pages")
  ).length;
}
