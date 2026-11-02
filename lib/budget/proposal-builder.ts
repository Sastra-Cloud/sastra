import { z } from "zod";

import {
  lineAmount,
  lineAmountCents,
  lineQuantity,
  STANDARD_LINES,
  type BudgetRates,
  type BudgetUnit,
} from "./compute";

const unitSchema = z.enum(["words", "pages", "cover", "project", "flat"]);
const lineSchema = z.object({
  category: z.enum(["translation", "proofreading", "editing", "cover_design", "typesetting", "project_management", "print_ship", "audiobook", "video_series", "custom"]),
  label: z.string().trim().min(1, "Give each cost a name.").max(200),
  unit: unitSchema,
  quantity: z.number().finite().min(0).max(100_000_000).multipleOf(0.01),
  unitPrice: z.number().finite().min(0).max(1_000_000).multipleOf(0.0001),
  autoQuantity: z.boolean(),
}).refine(line => Math.round(line.quantity * 100) * Math.round(line.unitPrice * 10_000) <= Number.MAX_SAFE_INTEGER, {
  message: "This cost is too large. Reduce its quantity or rate.",
});

export const proposalBudgetSchema = z.object({
  requestId: z.string().uuid(),
  title: z.string().trim().min(1, "Enter a working title for this proposal.").max(200),
  kind: z.enum(["book", "article", "other"]),
  description: z.string().trim().max(2_000),
  sourceLanguage: z.string().trim().max(100),
  targetLanguage: z.string().trim().max(100),
  wordCount: z.number().int().min(0).max(100_000_000),
  sourcePageCount: z.number().int().min(0).max(1_000_000),
  wordsPerPage: z.number().int().min(1).max(100_000),
  languageExpansionFactor: z.string().regex(/^\d+(?:\.\d{1,2})?$/).refine(value => Number(value) > 0 && Number(value) <= 999.99),
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
  lines: z.array(lineSchema).min(1, "Include at least one cost.").max(40),
});

export type ProposalBudgetInput = z.infer<typeof proposalBudgetSchema>;
export type ProposalCost = ProposalBudgetInput["lines"][number];
export type ProposalBudgetDefaults = BudgetRates & {
  currency: string;
  wordsPerPage: number;
  languageExpansionFactor: string;
  sourceLanguage: string | null;
  targetLanguage: string | null;
};

export function proposalStandardCosts(defaults: ProposalBudgetDefaults): ProposalCost[] {
  return STANDARD_LINES.map(line => ({
    category: line.category,
    label: line.label,
    unit: line.unit,
    quantity: line.unit === "words" || line.unit === "pages" ? 0 : 1,
    unitPrice: Number(defaults[line.rateKey]),
    autoQuantity: true,
  }));
}

/** Preview and persisted rows use the same quantity and integer-cents calculations. */
export function proposalCostRows(
  input: Pick<ProposalBudgetInput, "wordCount" | "sourcePageCount" | "lines">,
  basis: Pick<ProposalBudgetDefaults, "wordsPerPage" | "languageExpansionFactor">
) {
  return input.lines.map(line => {
    const quantity = line.autoQuantity
      ? lineQuantity(line.unit as BudgetUnit, { ...basis, wordCount: input.wordCount, sourcePageCount: input.sourcePageCount })
      : line.quantity;
    return { ...line, quantity, amount: lineAmount(quantity, line.unitPrice) };
  });
}

export function proposalCostTotalCents(lines: ReadonlyArray<Pick<ProposalCost, "quantity" | "unitPrice">>): number {
  return lines.reduce((total, line) => total + lineAmountCents(line.quantity, line.unitPrice), 0);
}
