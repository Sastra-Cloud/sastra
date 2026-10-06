import { z } from "zod";

export const MAX_SPONSORSHIP_CENTS = 100_000_000_000;

/** Decimal strings keep financial inputs exact before any arithmetic. */
export function moneyCents(value: string): number {
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) throw new Error("Enter an amount with up to two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_SPONSORSHIP_CENTS) throw new Error("Enter an amount of 1,000,000,000 or less.");
  return cents;
}

export function decimalAmount(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Invalid amount.");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

const money = z.string().trim().refine(value => {
  try { moneyCents(value); return true; } catch { return false; }
}, "Enter an amount with up to two decimal places.");

export const calendarDate = z.string().refine(value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Choose a valid date.");

export const sponsorshipInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  partnerId: z.uuid().nullable(),
  recipientName: z.string().trim().min(1).max(200),
  recipientEmail: z.union([z.literal(""), z.email()]),
  recipientAddress: z.string().trim().max(1000),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  dueDate: z.union([z.literal(""), calendarDate]),
  notes: z.string().trim().max(2000),
  lines: z.array(z.object({
    projectId: z.uuid(),
    description: z.string().trim().min(1).max(500),
    quantity: z.number().int().min(1).max(1_000_000),
    unitPrice: money.refine(value => moneyCents(value) > 0, "Enter a price greater than zero."),
  })).min(1).max(50),
}).superRefine((value, ctx) => {
  try {
    const total = sponsorshipTotalCents(value.lines);
    if (total > MAX_SPONSORSHIP_CENTS) ctx.addIssue({ code: "custom", message: "Keep the sponsorship total at 1,000,000,000 or less.", path: ["lines"] });
  } catch { ctx.addIssue({ code: "custom", message: "Check the book quantities and prices.", path: ["lines"] }); }
});

export type SponsorshipInput = z.input<typeof sponsorshipInputSchema>;

export const receiptInputSchema = z.object({
  id: z.uuid(),
  invoiceId: z.uuid(),
  amount: money.refine(value => moneyCents(value) > 0, "Enter an amount greater than zero."),
  actualNetAmount: money,
  receivedDate: calendarDate,
  note: z.string().trim().max(1000),
}).refine(value => moneyCents(value.actualNetAmount) <= moneyCents(value.amount), {
  message: "Available funding cannot exceed the gross amount.", path: ["actualNetAmount"],
});
export type SponsorshipReceiptInput = z.input<typeof receiptInputSchema>;

export const fundUseInputSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  amount: money.refine(value => moneyCents(value) > 0, "Enter an amount greater than zero."),
  usedDate: calendarDate,
  note: z.string().trim().min(1, "Describe how the funds were used.").max(1000),
});
export type SponsorshipFundUseInput = z.input<typeof fundUseInputSchema>;

export function sponsorshipTotalCents(lines: Array<{ quantity: number; unitPrice: string }>) {
  const total = lines.reduce((sum, line) => sum + moneyCents(line.unitPrice) * line.quantity, 0);
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error("Check the sponsorship total.");
  return total;
}

/** Largest remainders, stable by input order; BigInt avoids rounding drift. */
export function allocateSponsorshipCents(amount: number, shares: Array<{ projectId: string; cents: number }>) {
  const total = shares.reduce((sum, share) => sum + share.cents, 0);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > total ||
    shares.some(share => !Number.isSafeInteger(share.cents) || share.cents < 0)) throw new Error("Check the funding allocation.");
  if (!total) return shares.map(share => ({ projectId: share.projectId, cents: 0 }));
  const rows = shares.map((share, index) => {
    const product = BigInt(amount) * BigInt(share.cents);
    return { projectId: share.projectId, index, cents: Number(product / BigInt(total)), remainder: product % BigInt(total) };
  });
  const ranked = [...rows].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  const leftover = amount - rows.reduce((sum, row) => sum + row.cents, 0);
  for (let i = 0; i < leftover; i++) ranked[i].cents++;
  return rows.map(({ projectId, cents }) => ({ projectId, cents }));
}

export function sponsorshipProjectShares(lines: Array<{ projectId: string; quantity: number; unitPrice: string }>) {
  const totals = new Map<string, number>();
  for (const line of lines) totals.set(line.projectId, (totals.get(line.projectId) ?? 0) + moneyCents(line.unitPrice) * line.quantity);
  return [...totals].map(([projectId, cents]) => ({ projectId, cents }));
}
