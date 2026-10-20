"use server";

import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { invoices, mouPayments, projects } from "@/lib/db/schema";
import { getBudgetData } from "./queries";
import { getMouInvoiceDetails } from "./invoice-details";
import { generateMouInvoice } from "./actions";
import {
  budgetInvoiceHash,
  budgetLineInvoiceSchema,
  planBudgetLineInvoice,
  type BudgetLineInvoiceInput,
} from "./line-invoice";

async function loadPlan(input: BudgetLineInvoiceInput) {
  const data = budgetLineInvoiceSchema.parse(input);
  const [[project], budget, details] = await Promise.all([
    db.select({ title: projects.title }).from(projects).where(eq(projects.id, data.projectId)).limit(1),
    getBudgetData(data.projectId, data.printRunId ?? undefined),
    getMouInvoiceDetails({ projectId: data.projectId, sharedMouGroupId: null, trigger: "custom" }),
  ]);
  if (!project) throw new Error("Project not found.");
  return planBudgetLineInvoice(data, {
    projectTitle: project.title,
    currency: budget.settings.currency,
    items: budget.items,
    recipientName: details.recipientName,
    recipientEmail: budget.settings.partnerContactEmail,
    recipientAddress: details.billingAddress,
  });
}

export async function previewBudgetLineInvoice(input: BudgetLineInvoiceInput) {
  await requireRole("manager");
  try {
    return { plan: await loadPlan(input) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not prepare the invoice." };
  }
}

/** A stable request id also identifies the receivable, so retries cannot duplicate it. */
export async function createBudgetLineInvoice(
  input: BudgetLineInvoiceInput & { requestId: string; reviewedFingerprint: string }
): Promise<{ error?: string; paymentId?: string; invoiceId?: string; invoiceNumber?: string }> {
  const { user } = await requireRole("manager");
  const parsed = budgetLineInvoiceSchema.extend({
    requestId: z.uuid(),
    reviewedFingerprint: z.string().length(64),
  }).parse(input);
  const { requestId, reviewedFingerprint, ...data } = parsed;
  const requestHash = budgetInvoiceHash(data);
  let paymentId: string | undefined;
  try {
    const [existing] = await db.select().from(mouPayments).where(eq(mouPayments.id, requestId)).limit(1);
    if (existing) {
      if (existing.createdBy !== user.id || existing.projectId !== data.projectId ||
          existing.budgetInvoice?.requestHash !== requestHash ||
          existing.budgetInvoice.fingerprint !== reviewedFingerprint ||
          existing.budgetInvoice.termsHash !== budgetInvoiceHash({
            amount: existing.amount, currency: existing.currency,
            description: existing.publicDescription, dueDate: existing.dueDate,
          })) {
        return { error: "This invoice request changed. Review it again before creating an invoice." };
      }
      paymentId = existing.id;
    } else {
      const plan = await loadPlan(data);
      if (plan.fingerprint !== reviewedFingerprint) {
        return { error: "The budget or partner details changed. Review the invoice again." };
      }
      await db.insert(mouPayments).values({
        id: requestId,
        projectId: data.projectId,
        printRunId: plan.printRunId,
        amount: plan.amount,
        currency: plan.currency,
        trigger: "custom",
        dueDate: plan.dueDate,
        publicDescription: plan.description,
        notes: `Selected budget costs: ${plan.lines.map((line) => line.description).join(", ")}`,
        budgetInvoice: {
          requestHash,
          fingerprint: reviewedFingerprint,
          termsHash: budgetInvoiceHash({ amount: plan.amount, currency: plan.currency, description: plan.description, dueDate: plan.dueDate }),
          budgetItemIds: data.budgetItemIds,
          recipientName: plan.recipientName,
          recipientEmail: plan.recipientEmail,
          recipientAddress: plan.recipientAddress,
        },
        createdBy: user.id,
      }).onConflictDoNothing({ target: mouPayments.id });
      // A concurrent retry must have the same reviewed request and actor.
      const [saved] = await db.select().from(mouPayments).where(and(
        eq(mouPayments.id, requestId), eq(mouPayments.createdBy, user.id)
      )).limit(1);
      if (saved?.budgetInvoice?.requestHash !== requestHash || saved.budgetInvoice.fingerprint !== reviewedFingerprint) {
        return { error: "This invoice request changed. Review it again." };
      }
      paymentId = saved.id;
    }
    const [previousInvoice] = await db.select().from(invoices)
      .where(eq(invoices.mouPaymentId, paymentId)).orderBy(desc(invoices.createdAt)).limit(1);
    if (previousInvoice) {
      if (previousInvoice.status === "void") {
        return { error: "This invoice was voided. Start a new invoice request if needed.", paymentId };
      }
      return { paymentId, invoiceId: previousInvoice.id, invoiceNumber: previousInvoice.invoiceNumber };
    }
    const result = await generateMouInvoice(paymentId);
    return { ...result, paymentId };
  } catch (error) {
    // Another retry may have finished while this request rendered its PDF.
    if (paymentId) {
      const [invoice] = await db.select().from(invoices).where(and(
        eq(invoices.mouPaymentId, paymentId), ne(invoices.status, "void")
      )).limit(1);
      if (invoice) return { paymentId, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber };
    }
    return {
      paymentId,
      error: error instanceof Error ? error.message : "Could not create the invoice. Try again.",
    };
  }
}
