import { z } from "zod";
import { partnerPrintOptionSchema, type PartnerPrintOption } from "./print-options";

export const budgetPresentationSchema = z.object({
  printRunId: z.string().uuid().nullable().optional(),
  mode: z.enum(["itemized", "per_copy"]),
  deductionPercent: z.coerce.number().min(0).max(99.99),
  publicDescription: z.string().max(1000).nullable().optional(),
  perCopyQuantity: z.coerce.number().int().min(1).nullable().optional(),
  perCopyUnitPrice: z.coerce.number().min(0).finite().nullable().optional(),
  printOptions: z.array(partnerPrintOptionSchema).max(30).optional(),
});

export type BudgetPresentationInput = z.input<typeof budgetPresentationSchema>;

export type PartnerQuotePresentation = {
  mode: "itemized" | "per_copy";
  deductionBps: number;
  publicDescription: string | null;
  perCopyQuantity: number | null;
  perCopyUnitPrice: string | null;
  printOptions?: PartnerPrintOption[];
};
