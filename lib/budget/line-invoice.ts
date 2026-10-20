import { createHash } from "node:crypto";
import { z } from "zod";

import { lineAmountCents } from "./compute";

export const budgetLineInvoiceSchema = z.object({
  projectId: z.uuid(),
  printRunId: z.uuid().nullable().optional(),
  budgetItemIds: z.array(z.uuid()).min(1).max(100),
  amount: z.number().positive().finite().optional(),
  recipientName: z.string().trim().min(1).max(200).optional(),
  recipientEmail: z.email().optional(),
  recipientAddress: z.string().trim().max(1000).optional(),
  dueDate: z.iso.date().optional(),
});

export type BudgetLineInvoiceInput = z.input<typeof budgetLineInvoiceSchema>;

export type BudgetInvoiceSnapshot = {
  requestHash: string;
  fingerprint: string;
  termsHash: string;
  budgetItemIds: string[];
  recipientName: string;
  recipientEmail: string | null;
  recipientAddress: string;
};

type InvoiceLine = {
  id: string;
  label: string;
  partnerLabel: string | null;
  partnerVisible: boolean;
  quantity: string;
  unitPrice: string;
  partnerUnitPrice: string | null;
};

export function budgetInvoiceHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Only the selected public costs contribute; received funding is a separate ledger. */
export function planBudgetLineInvoice(
  input: BudgetLineInvoiceInput,
  context: {
    projectTitle: string;
    currency: string;
    items: InvoiceLine[];
    recipientName: string | null;
    recipientEmail: string | null;
    recipientAddress: string;
  }
) {
  const data = budgetLineInvoiceSchema.parse(input);
  const ids = new Set(data.budgetItemIds);
  if (ids.size !== data.budgetItemIds.length) {
    throw new Error("Select each budget line only once.");
  }
  const items = context.items.filter((item) => ids.has(item.id));
  if (items.length !== ids.size || items.some((item) => !item.partnerVisible)) {
    throw new Error("Choose visible partner lines from this budget. Refresh and try again.");
  }
  const lines = items.map((item) => {
    const quantity = Number(item.quantity);
    const rate = Number(item.partnerUnitPrice ?? item.unitPrice);
    if (!Number.isFinite(quantity) || !Number.isFinite(rate) || quantity < 0 || rate < 0) {
      throw new Error("Correct the quantity and rate on the selected budget lines first.");
    }
    return {
      id: item.id,
      description: item.partnerLabel?.trim() || item.label,
      amountCents: lineAmountCents(quantity, rate),
    };
  });
  const totalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const amountCents = data.amount == null ? totalCents : Math.round(data.amount * 100);
  if (amountCents <= 0 || amountCents > totalCents) {
    throw new Error("Enter an invoice amount greater than zero and no more than the selected costs.");
  }
  const recipientName = data.recipientName ?? context.recipientName?.trim();
  if (!recipientName) throw new Error("Enter the partner name before creating an invoice.");
  const differentPartner = data.recipientName != null && data.recipientName !== context.recipientName?.trim();
  const recipientEmail = data.recipientEmail ?? (differentPartner ? null : context.recipientEmail?.trim() || null);
  const recipientAddress = data.recipientAddress ?? (differentPartner ? "" : context.recipientAddress);
  const description = [
    `${amountCents < totalCents ? "Partial funding" : "Funding"} for ${context.projectTitle}`,
    ...lines.map((line) => `- ${line.description}`),
  ].join("\n");
  const plan = {
    projectId: data.projectId,
    printRunId: data.printRunId ?? null,
    currency: context.currency,
    lines,
    total: (totalCents / 100).toFixed(2),
    amount: (amountCents / 100).toFixed(2),
    recipientName,
    recipientEmail,
    recipientAddress,
    dueDate: data.dueDate ?? null,
    description,
  };
  return { ...plan, fingerprint: budgetInvoiceHash(plan) };
}

export type BudgetLineInvoicePlan = ReturnType<typeof planBudgetLineInvoice>;
