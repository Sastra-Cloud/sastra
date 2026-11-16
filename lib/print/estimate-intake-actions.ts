"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { activityLog, printContacts, printQuotes, printRuns, projects } from "@/lib/db/schema";
import { extractTextQuoteSuggestions } from "./email-text-extract";
import { suggestedQuoteValues } from "./suggested-quote-values";
import { BUDGET_ESTIMATE_KIND } from "./estimate-policy";
import { mmToIn } from "./estimate";
import { getOrCreatePrintSettings } from "./queries";
import { withQuoteSourceFlag } from "./estimate-intake";
import { quoteRevisionKey } from "./quote-reconciliation";

const intakeSchema = z.object({
  requestId: z.uuid(),
  text: z.string().trim().min(1).max(20000),
  contactId: z.uuid().nullable(),
  reused: z.boolean(),
});

/** Pasted prices become reviewable planning quotes, never an order or payable. */
export async function createPrintEstimateFromText(projectId: string, input: z.input<typeof intakeSchema>): Promise<{ error: string } | { runId: string; count: number }> {
  const { user } = await requireRole("manager");
  const parsed = intakeSchema.safeParse(input);
  if (!z.uuid().safeParse(projectId).success || !parsed.success) {
    return { error: "Paste up to 20,000 characters and choose a valid project and printer." };
  }
  const data = parsed.data;
  const [project] = await db.select({ id: projects.id, title: projects.title, slug: projects.slug })
    .from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { error: "Project not found. Open the project and try again." };
  if (data.contactId) {
    const [contact] = await db.select({ id: printContacts.id }).from(printContacts)
      .where(and(eq(printContacts.id, data.contactId), eq(printContacts.isActive, true))).limit(1);
    if (!contact) return { error: "Choose an active printer, or leave the printer unspecified." };
  }
  const notes = `${data.reused ? "Reused quote" : "Pasted quote"} for budget planning.\n\n${data.text}`;
  const matchesRequest = (run: typeof printRuns.$inferSelect) => run.projectId === projectId &&
    run.createdBy === user.id && run.kind === BUDGET_ESTIMATE_KIND && run.contactId === data.contactId && run.notes === notes;
  const refresh = () => {
    revalidatePath(`/projects/${project.slug}/budget`);
    revalidatePath(`/projects/${project.slug}/print`);
  };
  const [existing] = await db.select().from(printRuns).where(eq(printRuns.id, data.requestId)).limit(1);
  if (existing) {
    if (!matchesRequest(existing)) return { error: "This import has already been used. Close it and start another import." };
    const quotes = await db.select({ id: printQuotes.id }).from(printQuotes).where(eq(printQuotes.runId, existing.id));
    refresh();
    return { runId: existing.id, count: quotes.length };
  }

  try {
    const extracted = await extractTextQuoteSuggestions({ bodyText: data.text, projectId, runId: data.requestId, actorUserId: user.id });
    // Retain every distinct priced tier; never substitute an invoice/payment workflow.
    const seen = new Set<string>();
    const suggestions = extracted.quotes.filter(item => {
      const quantity = item.quote.quantityCps;
      const price = Number(item.quote.totalAmount ?? item.quote.unitPrice);
      if (!quantity || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000000 || !Number.isFinite(price) || price <= 0) return false;
      const key = quoteRevisionKey({ ...item.quote, kind: "quote" });
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!suggestions.length) return { error: "No priced copy quantities were found. Include quantities and prices, then try again." };
    if (suggestions.length > 12) return { error: "This note has more than 12 quote options. Paste up to 12 options at a time." };
    const settings = await getOrCreatePrintSettings(projectId);
    const first = suggestions[0].quote;
    const result = await db.transaction(async tx => {
      const [created] = await tx.insert(printRuns).values({
        id: data.requestId, projectId, contactId: data.contactId,
        title: project.title, kind: BUDGET_ESTIMATE_KIND, status: "quote_received", printNumber: null,
        requestedQuantities: suggestions.map(item => item.quote.quantityCps!),
        trimWidthIn: first.trimWidthMm ? mmToIn(Number(first.trimWidthMm)).toFixed(2) : settings.trimWidthIn,
        trimHeightIn: first.trimHeightMm ? mmToIn(Number(first.trimHeightMm)).toFixed(2) : settings.trimHeightIn,
        estimatedTextPages: first.textPages ?? 0, quotedTextPages: first.textPages, coverPages: first.coverPages ?? 4,
        textPaper: first.textSpec, coverPaper: first.coverSpec, binding: first.binding,
        deliveryLocation: first.deliveryLocation ?? "", fundingCurrency: first.currency,
        notes, createdBy: user.id,
      }).onConflictDoNothing({ target: printRuns.id }).returning({ id: printRuns.id });
      if (!created) {
        const [prior] = await tx.select().from(printRuns).where(eq(printRuns.id, data.requestId)).limit(1);
        if (!prior || !matchesRequest(prior)) throw new Error("Import conflict");
        const quotes = await tx.select({ id: printQuotes.id }).from(printQuotes).where(eq(printQuotes.runId, prior.id));
        return { runId: prior.id, count: quotes.length };
      }
      await tx.insert(printQuotes).values(suggestions.map(item => suggestedQuoteValues(
        { id: created.id, projectId, contactId: data.contactId },
        { ...item.quote, title: project.title, kind: "quote", invoiceNumber: null, depositAmount: null, balanceAmount: null },
        user.id,
        { reviewFlags: withQuoteSourceFlag(item.flags, data.text, data.reused), extractionSource: item.source },
      )));
      await tx.insert(activityLog).values({ actorId: user.id, projectId, entityType: "print", entityId: created.id,
        action: "quote", summary: `Added ${suggestions.length} planning quote options from pasted text` });
      return { runId: created.id, count: suggestions.length };
    });
    refresh();
    return result;
  } catch {
    return { error: "Could not add the estimate. Your text is still here. Check your connection and try again." };
  }
}
