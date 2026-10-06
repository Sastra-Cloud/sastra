"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { requireWorkspaceModule } from "@/lib/workspace/module-guard";
import { db } from "@/lib/db";
import { activityLog, files, invoiceDeliveries, invoices, partners, projects, sponsorshipFundUses, sponsorshipLines, sponsorshipReceiptAllocations, sponsorshipReceipts, sponsorships } from "@/lib/db/schema";
import { allocateSponsorshipCents, decimalAmount, fundUseInputSchema, moneyCents, receiptInputSchema, sponsorshipInputSchema, sponsorshipProjectShares, sponsorshipTotalCents, type SponsorshipFundUseInput, type SponsorshipInput, type SponsorshipReceiptInput } from "./compute";
import { getInvoiceIssuerSnapshot } from "@/lib/workspace/queries";
import { nextInvoiceNumber } from "@/lib/budget/invoice-number";
import { buildInvoicePdf } from "@/lib/budget/pdf";
import { buildKey, deleteObject, getObjectBuffer, putObject } from "@/lib/r2";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function invalidate(id: string, projectIds: string[] = []) {
  revalidatePath("/sponsorships");
  revalidatePath(`/sponsorships/${id}`);
  if (projectIds.length) {
    const rows = await db.select({ id: projects.id, slug: projects.slug }).from(projects).where(inArray(projects.id, [...new Set(projectIds)]));
    for (const row of rows) {
      revalidatePath(`/projects/${row.slug}`);
    }
    revalidatePath("/projects"); revalidatePath("/dashboard");
  }
}

async function validateLinks(tx: Tx, input: SponsorshipInput) {
  const ids = [...new Set(input.lines.map(line => line.projectId))];
  const books = await tx.select({ id: projects.id }).from(projects).where(and(inArray(projects.id, ids), eq(projects.kind, "book")));
  if (books.length !== ids.length) return "Select an existing book for every line.";
  if (input.partnerId) {
    const [partner] = await tx.select({ id: partners.id }).from(partners).where(eq(partners.id, input.partnerId));
    if (!partner) return "That partner is unavailable. Choose another partner.";
  }
  return null;
}

function recordFields(input: SponsorshipInput) {
  return { title: input.title, partnerId: input.partnerId, recipientName: input.recipientName,
    recipientEmail: input.recipientEmail || null, recipientAddress: input.recipientAddress || null,
    currency: input.currency, dueDate: input.dueDate || null, notes: input.notes || null };
}

async function insertLines(tx: Tx, id: string, input: SponsorshipInput) {
  await tx.insert(sponsorshipLines).values(input.lines.map((line, sortOrder) => ({
    sponsorshipId: id, ...line, unitPrice: decimalAmount(moneyCents(line.unitPrice)), sortOrder,
  })));
}

export async function createSponsorship(id: string, input: SponsorshipInput): Promise<{ error?: string; id?: string }> {
  const { user } = await requireRole("manager");
  const workspace = await requireWorkspaceModule("sponsorships");
  const parsed = sponsorshipInputSchema.safeParse(input);
  if (!z.uuid().safeParse(id).success || !parsed.success) return { error: parsed.success ? "Refresh and try again." : parsed.error.issues[0]?.message ?? "Check the sponsorship fields." };
  const result = await db.transaction(async tx => {
    const error = await validateLinks(tx, parsed.data);
    if (error) return { error };
    const [record] = await tx.insert(sponsorships).values({ id, ...recordFields(parsed.data), deductionBps: workspace.defaultFundingDeductionBps, createdBy: user.id })
      .onConflictDoNothing().returning({ id: sponsorships.id });
    if (!record) {
      const [existing] = await tx.select().from(sponsorships).where(eq(sponsorships.id, id));
      return existing?.createdBy === user.id ? { id } : { error: "Refresh and try again." };
    }
    await insertLines(tx, id, parsed.data);
    await tx.insert(activityLog).values({ actorId: user.id, entityType: "sponsorship", entityId: id, action: "create", summary: `Created sponsorship: ${parsed.data.title}` });
    return { id };
  });
  if (!result.error) await invalidate(id);
  return result;
}

export async function updateSponsorship(id: string, version: number, input: SponsorshipInput): Promise<{ error?: string; version?: number }> {
  const { user } = await requireRole("manager");
  await requireWorkspaceModule("sponsorships");
  const parsed = sponsorshipInputSchema.safeParse(input);
  if (!z.uuid().safeParse(id).success || !Number.isSafeInteger(version) || !parsed.success) return { error: parsed.success ? "Refresh and try again." : parsed.error.issues[0]?.message ?? "Check the sponsorship fields." };
  const result = await db.transaction(async tx => {
    const [record] = await tx.select().from(sponsorships).where(eq(sponsorships.id, id)).for("update");
    if (!record || record.status !== "draft" || record.version !== version) return { error: "The sponsorship changed. Refresh and review it before saving." };
    const error = await validateLinks(tx, parsed.data);
    if (error) return { error };
    await tx.update(sponsorships).set({ ...recordFields(parsed.data), version: version + 1, updatedAt: new Date() }).where(eq(sponsorships.id, id));
    await tx.delete(sponsorshipLines).where(eq(sponsorshipLines.sponsorshipId, id));
    await insertLines(tx, id, parsed.data);
    await tx.insert(activityLog).values({ actorId: user.id, entityType: "sponsorship", entityId: id, action: "update", summary: `Updated sponsorship: ${parsed.data.title}` });
    return { version: version + 1 };
  });
  if (!result.error) await invalidate(id);
  return result;
}

export async function cancelSponsorship(id: string): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  await requireWorkspaceModule("sponsorships");
  if (!z.uuid().safeParse(id).success) return { error: "Refresh and try again." };
  const result = await db.transaction(async tx => {
    const [record] = await tx.select().from(sponsorships).where(eq(sponsorships.id, id)).for("update");
    if (!record || record.status !== "draft") return { error: "Only a draft sponsorship can be cancelled." };
    await tx.update(sponsorships).set({ status: "cancelled", version: record.version + 1, updatedAt: new Date() }).where(eq(sponsorships.id, id));
    await tx.insert(activityLog).values({ actorId: user.id, entityType: "sponsorship", entityId: id, action: "cancel", summary: `Cancelled sponsorship: ${record.title}` });
    return {};
  });
  if (!result.error) await invalidate(id);
  return result;
}

export async function generateSponsorshipInvoice(id: string, version: number): Promise<{ error?: string; invoiceId?: string }> {
  const { user } = await requireRole("manager");
  const workspace = await requireWorkspaceModule("sponsorships");
  if (!z.uuid().safeParse(id).success || !Number.isSafeInteger(version)) return { error: "Refresh and try again." };
  const [record] = await db.select().from(sponsorships).where(eq(sponsorships.id, id));
  if (!record || record.status !== "draft" || record.version !== version) return { error: "The sponsorship changed. Refresh and review it before generating." };
  const issuer = getInvoiceIssuerSnapshot(workspace);
  if (!(issuer.legalName || issuer.orgName)?.trim() || !issuer.contactEmail?.trim() ||
    !(issuer.paymentInstructions?.trim() || issuer.invoicePaymentDetails?.fields.some(field => field.value.trim()))) {
    return { error: "Complete your organization name, contact email, and payment instructions in Settings → Workspace." };
  }
  const lines = await db.select().from(sponsorshipLines).where(eq(sponsorshipLines.sponsorshipId, id)).orderBy(sponsorshipLines.sortOrder);
  if (!lines.length) return { error: "Add at least one book before generating an invoice." };
  const lineItems = lines.map(line => ({ projectId: line.projectId, description: line.description, quantity: line.quantity,
    unitPrice: line.unitPrice, amount: decimalAmount(moneyCents(line.unitPrice) * line.quantity) }));
  const total = sponsorshipTotalCents(lines);
  const invoiceNumber = await db.transaction(tx => nextInvoiceNumber(tx));
  const issueDate = new Intl.DateTimeFormat("en-CA", { timeZone: workspace.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  let logo: Buffer | null = null;
  if (issuer.logoFileId) {
    const [file] = await db.select().from(files).where(eq(files.id, issuer.logoFileId));
    if (file?.status === "ready" && ["image/png", "image/jpeg"].includes(file.mimeType)) logo = await getObjectBuffer(file.r2Key);
  }
  const pdf = await buildInvoicePdf({ issuer, logo, invoiceNumber, projectTitle: record.title, recipientName: record.recipientName,
    recipientEmail: record.recipientEmail, recipientAddress: record.recipientAddress, amount: total / 100,
    currency: record.currency, issueDate, dueDate: record.dueDate, description: record.title, lineItems, notes: record.notes });
  const fileId = randomUUID();
  const filename = `invoice-${invoiceNumber}.pdf`;
  const key = buildKey(fileId, filename);
  await putObject(key, pdf, "application/pdf");
  let retained = false;
  try {
    const result = await db.transaction(async tx => {
      const [current] = await tx.select().from(sponsorships).where(eq(sponsorships.id, id)).for("update");
      if (!current || current.status !== "draft" || current.version !== version) return { error: "The sponsorship changed. Refresh and review it before generating." };
      await requireWorkspaceModule("sponsorships");
      const [previous] = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.sponsorshipId, id)).orderBy(desc(invoices.createdAt)).limit(1);
      await tx.insert(files).values({ id: fileId, r2Key: key, originalName: filename, mimeType: "application/pdf", sizeBytes: pdf.length, status: "ready", purpose: "sponsorship_invoice", uploadedBy: user.id });
      const [invoice] = await tx.insert(invoices).values({ sponsorshipId: id, projectId: lines[0].projectId, invoiceNumber,
        recipientName: record.recipientName, recipientEmail: record.recipientEmail, recipientAddress: record.recipientAddress,
        amount: decimalAmount(total), currency: record.currency, issueDate, dueDate: record.dueDate,
        description: record.title, notes: record.notes, lineItems, renderedFileId: fileId, issuerSnapshot: issuer,
        replacesInvoiceId: previous?.id, createdBy: user.id,
      }).returning({ id: invoices.id });
      await tx.update(sponsorships).set({ status: "invoiced", version: version + 1, updatedAt: new Date() }).where(eq(sponsorships.id, id));
      await tx.insert(activityLog).values({ actorId: user.id, entityType: "sponsorship", entityId: id, action: "invoice", summary: `Issued sponsorship invoice ${invoiceNumber}` });
      return { invoiceId: invoice.id };
    });
    retained = !!result.invoiceId;
    if (retained) await invalidate(id);
    return result;
  } finally {
    if (!retained) await deleteObject(key).catch(() => {});
  }
}

export async function voidSponsorshipInvoice(id: string): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  await requireWorkspaceModule("sponsorships");
  if (!z.uuid().safeParse(id).success) return { error: "Refresh and try again." };
  const result = await db.transaction(async tx => {
    const [record] = await tx.select().from(sponsorships).where(eq(sponsorships.id, id)).for("update");
    const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.sponsorshipId, id), ne(invoices.status, "void"))).for("update");
    if (!record || !invoice || !["issued", "sent"].includes(invoice.status)) return { error: "Check the invoice delivery status before voiding it." };
    const [receipt] = await tx.select({ id: sponsorshipReceipts.id }).from(sponsorshipReceipts).where(and(eq(sponsorshipReceipts.sponsorshipId, id), isNull(sponsorshipReceipts.reversedAt))).limit(1);
    if (receipt) return { error: "Reverse received funding before voiding this invoice." };
    await tx.update(invoices).set({ status: "void", voidedAt: new Date(), voidedBy: user.id }).where(eq(invoices.id, invoice.id));
    await tx.update(sponsorships).set({ status: "draft", version: record.version + 1, updatedAt: new Date() }).where(eq(sponsorships.id, id));
    await tx.insert(activityLog).values({ actorId: user.id, entityType: "sponsorship", entityId: id, action: "void_invoice", summary: `Voided sponsorship invoice ${invoice.invoiceNumber}` });
    return {};
  });
  if (!result.error) await invalidate(id);
  return result;
}

export async function recordSponsorshipReceipt(id: string, input: SponsorshipReceiptInput): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  await requireWorkspaceModule("sponsorships");
  const parsed = receiptInputSchema.safeParse(input);
  if (!z.uuid().safeParse(id).success || !parsed.success) return { error: parsed.success ? "Refresh and try again." : parsed.error.issues[0]?.message ?? "Check the received funding." };
  const data = parsed.data;
  let projectIds: string[] = [];
  const result = await db.transaction(async tx => {
    const [record] = await tx.select().from(sponsorships).where(eq(sponsorships.id, id)).for("update");
    const [existing] = await tx.select().from(sponsorshipReceipts).where(eq(sponsorshipReceipts.id, data.id));
    if (existing) return existing.sponsorshipId === id && existing.invoiceId === data.invoiceId &&
      existing.amount === decimalAmount(moneyCents(data.amount)) && existing.actualNetAmount === decimalAmount(moneyCents(data.actualNetAmount)) &&
      existing.receivedDate === data.receivedDate && existing.note === (data.note || null) && !existing.reversedAt
      ? {} : { error: "This payment request was already used. Refresh and review the funding history." };
    const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.sponsorshipId, id), eq(invoices.id, data.invoiceId))).for("update");
    if (!record || record.status !== "invoiced" || !invoice || !["issued", "sent", "received"].includes(invoice.status)) return { error: "Generate an invoice and check its delivery status before recording funding." };
    const prior = await tx.select({ projectId: sponsorshipReceiptAllocations.projectId, amount: sponsorshipReceiptAllocations.amount })
      .from(sponsorshipReceiptAllocations).innerJoin(sponsorshipReceipts, eq(sponsorshipReceipts.id, sponsorshipReceiptAllocations.receiptId))
      .where(and(eq(sponsorshipReceipts.sponsorshipId, id), isNull(sponsorshipReceipts.reversedAt)));
    const remaining = sponsorshipProjectShares(invoice.lineItems ?? []).map(share => ({ ...share,
      cents: share.cents - prior.filter(row => row.projectId === share.projectId).reduce((sum, row) => sum + moneyCents(row.amount), 0),
    }));
    const amount = moneyCents(data.amount);
    const totalRemaining = remaining.reduce((sum, share) => sum + share.cents, 0);
    if (amount > totalRemaining) return { error: "Received funding exceeds the invoice balance. Check the amount." };
    const gross = allocateSponsorshipCents(amount, remaining);
    const net = allocateSponsorshipCents(moneyCents(data.actualNetAmount), gross);
    await tx.insert(sponsorshipReceipts).values({ id: data.id, sponsorshipId: id, invoiceId: invoice.id,
      amount: decimalAmount(amount), actualNetAmount: decimalAmount(moneyCents(data.actualNetAmount)),
      receivedDate: data.receivedDate, note: data.note || null, recordedBy: user.id });
    for (const share of gross) {
      if (!share.cents) continue;
      const actualNetAmount = decimalAmount(net.find(row => row.projectId === share.projectId)!.cents);
      await tx.insert(sponsorshipReceiptAllocations).values({ receiptId: data.id, projectId: share.projectId,
        amount: decimalAmount(share.cents), actualNetAmount });
    }
    if (amount === totalRemaining) await tx.update(invoices).set({ status: "received" }).where(eq(invoices.id, invoice.id));
    await tx.update(sponsorships).set({ updatedAt: new Date() }).where(eq(sponsorships.id, id));
    await tx.insert(activityLog).values({ actorId: user.id, entityType: "sponsorship", entityId: id, action: "receipt", summary: `Recorded ${invoice.currency} ${decimalAmount(amount)} for invoice ${invoice.invoiceNumber}`, data: { receiptId: data.id } });
    projectIds = gross.map(share => share.projectId);
    return {};
  });
  if (!result.error) await invalidate(id, projectIds);
  return result;
}

export async function reverseSponsorshipReceipt(id: string, receiptId: string, reason: string): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  await requireWorkspaceModule("sponsorships");
  const parsed = z.object({ id: z.uuid(), receiptId: z.uuid(), reason: z.string().trim().min(1).max(1000) }).safeParse({ id, receiptId, reason });
  if (!parsed.success) return { error: "Enter a reason for correcting this payment." };
  let projectIds: string[] = [];
  const result = await db.transaction(async tx => {
    await tx.select({ id: sponsorships.id }).from(sponsorships).where(eq(sponsorships.id, id)).for("update");
    const [receipt] = await tx.select().from(sponsorshipReceipts).where(and(eq(sponsorshipReceipts.id, receiptId), eq(sponsorshipReceipts.sponsorshipId, id))).for("update");
    if (!receipt || receipt.reversedAt) return { error: "This payment was already reversed. Refresh the funding history." };
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, receipt.invoiceId)).for("update");
    const allocations = await tx.select().from(sponsorshipReceiptAllocations).where(eq(sponsorshipReceiptAllocations.receiptId, receiptId));
    const [allAllocations, uses] = await Promise.all([
      tx.select({ projectId: sponsorshipReceiptAllocations.projectId, actualNetAmount: sponsorshipReceiptAllocations.actualNetAmount })
        .from(sponsorshipReceiptAllocations).innerJoin(sponsorshipReceipts, eq(sponsorshipReceipts.id, sponsorshipReceiptAllocations.receiptId))
        .where(and(eq(sponsorshipReceipts.sponsorshipId, id), isNull(sponsorshipReceipts.reversedAt))),
      tx.select().from(sponsorshipFundUses).where(and(eq(sponsorshipFundUses.sponsorshipId, id), isNull(sponsorshipFundUses.reversedAt))),
    ]);
    for (const allocation of allocations) {
      const received = allAllocations.filter(row => row.projectId === allocation.projectId).reduce((sum, row) => sum + moneyCents(row.actualNetAmount), 0);
      const used = uses.filter(row => row.projectId === allocation.projectId).reduce((sum, row) => sum + moneyCents(row.amount), 0);
      if (received - moneyCents(allocation.actualNetAmount) < used) return { error: "Some of these funds were used. Reverse the related uses before reversing this payment." };
    }
    await tx.update(sponsorshipReceipts).set({ reversedAt: new Date(), reversedBy: user.id, reversalReason: parsed.data.reason }).where(eq(sponsorshipReceipts.id, receiptId));
    if (invoice?.status === "received") {
      // Restore whether the invoice was sent, rather than pretending it was delivered.
      const deliveries = await tx.select({ id: invoiceDeliveries.id }).from(invoiceDeliveries).where(eq(invoiceDeliveries.invoiceId, invoice.id)).limit(1);
      await tx.update(invoices).set({ status: deliveries.length ? "sent" : "issued" }).where(eq(invoices.id, invoice.id));
    }
    await tx.update(sponsorships).set({ updatedAt: new Date() }).where(eq(sponsorships.id, id));
    await tx.insert(activityLog).values({ actorId: user.id, entityType: "sponsorship", entityId: id, action: "reverse_receipt", summary: "Reversed sponsorship funding", data: { receiptId, reason: parsed.data.reason } });
    projectIds = allocations.map(row => row.projectId);
    return {};
  });
  if (!result.error) await invalidate(id, projectIds);
  return result;
}

export async function recordSponsorshipFundUse(id: string, input: SponsorshipFundUseInput): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  await requireWorkspaceModule("sponsorships");
  const parsed = fundUseInputSchema.safeParse(input);
  if (!z.uuid().safeParse(id).success || !parsed.success) return { error: parsed.success ? "Refresh and try again." : parsed.error.issues[0]?.message ?? "Check the amount used." };
  const data = parsed.data;
  const result = await db.transaction(async tx => {
    const [record] = await tx.select().from(sponsorships).where(eq(sponsorships.id, id)).for("update");
    if (!record || record.status !== "invoiced") return { error: "Record received funding before using sponsorship funds." };
    const [existing] = await tx.select().from(sponsorshipFundUses).where(eq(sponsorshipFundUses.id, data.id));
    if (existing) return existing.sponsorshipId === id && existing.projectId === data.projectId &&
      existing.amount === decimalAmount(moneyCents(data.amount)) && existing.usedDate === data.usedDate && existing.note === data.note && !existing.reversedAt
      ? {} : { error: "This funding-use request was already used. Refresh and review its history." };
    const [received] = await tx.select({ amount: sql<string>`coalesce(sum(${sponsorshipReceiptAllocations.actualNetAmount}), 0)` })
      .from(sponsorshipReceiptAllocations).innerJoin(sponsorshipReceipts, eq(sponsorshipReceipts.id, sponsorshipReceiptAllocations.receiptId))
      .where(and(eq(sponsorshipReceipts.sponsorshipId, id), eq(sponsorshipReceiptAllocations.projectId, data.projectId), isNull(sponsorshipReceipts.reversedAt)));
    const [used] = await tx.select({ amount: sql<string>`coalesce(sum(${sponsorshipFundUses.amount}), 0)` })
      .from(sponsorshipFundUses).where(and(eq(sponsorshipFundUses.sponsorshipId, id), eq(sponsorshipFundUses.projectId, data.projectId), isNull(sponsorshipFundUses.reversedAt)));
    if (moneyCents(data.amount) > moneyCents(received.amount) - moneyCents(used.amount)) return { error: "The amount exceeds this book's available sponsorship funds. Check the balance." };
    await tx.insert(sponsorshipFundUses).values({ ...data, sponsorshipId: id, amount: decimalAmount(moneyCents(data.amount)), recordedBy: user.id });
    await tx.update(sponsorships).set({ updatedAt: new Date() }).where(eq(sponsorships.id, id));
    await tx.insert(activityLog).values({ actorId: user.id, projectId: data.projectId, entityType: "sponsorship", entityId: id, action: "use_funds", summary: `Used ${record.currency} ${decimalAmount(moneyCents(data.amount))} in sponsorship funds`, data: { useId: data.id, note: data.note } });
    return {};
  });
  if (!result.error) await invalidate(id, [data.projectId]);
  return result;
}

export async function reverseSponsorshipFundUse(id: string, useId: string, reason: string): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  await requireWorkspaceModule("sponsorships");
  const parsed = z.object({ id: z.uuid(), useId: z.uuid(), reason: z.string().trim().min(1).max(1000) }).safeParse({ id, useId, reason });
  if (!parsed.success) return { error: "Enter a reason for correcting this use of funds." };
  let projectId: string | null = null;
  const result = await db.transaction(async tx => {
    await tx.select({ id: sponsorships.id }).from(sponsorships).where(eq(sponsorships.id, id)).for("update");
    const [use] = await tx.select().from(sponsorshipFundUses).where(and(eq(sponsorshipFundUses.id, useId), eq(sponsorshipFundUses.sponsorshipId, id))).for("update");
    if (!use || use.reversedAt) return { error: "This use was already reversed. Refresh the funding history." };
    await tx.update(sponsorshipFundUses).set({ reversedAt: new Date(), reversedBy: user.id, reversalReason: parsed.data.reason }).where(eq(sponsorshipFundUses.id, useId));
    await tx.update(sponsorships).set({ updatedAt: new Date() }).where(eq(sponsorships.id, id));
    await tx.insert(activityLog).values({ actorId: user.id, projectId: use.projectId, entityType: "sponsorship", entityId: id, action: "reverse_use", summary: "Reversed sponsorship fund use", data: { useId, reason: parsed.data.reason } });
    projectId = use.projectId;
    return {};
  });
  if (!result.error) await invalidate(id, projectId ? [projectId] : []);
  return result;
}
