import "server-only";

import { and, asc, desc, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { requireWorkspaceModule } from "@/lib/workspace/module-guard";
import { files, invoices, projects, sponsorshipFundUses, sponsorshipLines, sponsorshipReceiptAllocations, sponsorshipReceipts, sponsorships } from "@/lib/db/schema";
import { getEmailDraftForUser } from "@/lib/email/draft-store";

export async function listSponsorships() {
  await requireRole("manager");
  await requireWorkspaceModule("sponsorships");
  const totals = db.select({
    sponsorshipId: sponsorshipLines.sponsorshipId,
    amount: sql<string>`sum(${sponsorshipLines.quantity} * ${sponsorshipLines.unitPrice})`.as("amount"),
    copies: sql<number>`sum(${sponsorshipLines.quantity})::int`.as("copies"),
  }).from(sponsorshipLines).groupBy(sponsorshipLines.sponsorshipId).as("sponsorship_totals");
  const received = db.select({
    sponsorshipId: sponsorshipReceipts.sponsorshipId,
    amount: sql<string>`sum(${sponsorshipReceipts.amount})`.as("received"),
  }).from(sponsorshipReceipts).where(isNull(sponsorshipReceipts.reversedAt))
    .groupBy(sponsorshipReceipts.sponsorshipId).as("sponsorship_received");
  return db.select({
    id: sponsorships.id, title: sponsorships.title, recipientName: sponsorships.recipientName,
    currency: sponsorships.currency, status: sponsorships.status, dueDate: sponsorships.dueDate,
    total: sql<string>`coalesce("sponsorship_totals"."amount", 0)`, copies: sql<number>`coalesce("sponsorship_totals"."copies", 0)`,
    received: sql<string>`coalesce("sponsorship_received"."received", 0)`, invoiceNumber: invoices.invoiceNumber,
    invoiceStatus: invoices.status,
  }).from(sponsorships)
    .leftJoin(totals, eq(totals.sponsorshipId, sponsorships.id))
    .leftJoin(received, eq(received.sponsorshipId, sponsorships.id))
    .leftJoin(invoices, and(eq(invoices.sponsorshipId, sponsorships.id), sql`${invoices.status} <> 'void'`))
    .orderBy(desc(sponsorships.updatedAt));
}

export type SponsorshipListItem = Awaited<ReturnType<typeof listSponsorships>>[number];

export async function getSponsorship(id: string) {
  const { user } = await requireRole("manager");
  await requireWorkspaceModule("sponsorships");
  const [record] = await db.select().from(sponsorships).where(eq(sponsorships.id, id)).limit(1);
  if (!record) return null;
  const [lines, invoiceHistory, receipts, uses] = await Promise.all([
    db.select({ id: sponsorshipLines.id, projectId: sponsorshipLines.projectId, description: sponsorshipLines.description,
      quantity: sponsorshipLines.quantity, unitPrice: sponsorshipLines.unitPrice, projectTitle: projects.title, projectSlug: projects.slug,
    }).from(sponsorshipLines).innerJoin(projects, eq(projects.id, sponsorshipLines.projectId))
      .where(eq(sponsorshipLines.sponsorshipId, id)).orderBy(asc(sponsorshipLines.sortOrder)),
    db.select().from(invoices).where(eq(invoices.sponsorshipId, id)).orderBy(desc(invoices.createdAt)),
    db.select().from(sponsorshipReceipts).where(eq(sponsorshipReceipts.sponsorshipId, id)).orderBy(desc(sponsorshipReceipts.createdAt)),
    db.select({ ...getTableColumns(sponsorshipFundUses), projectTitle: projects.title }).from(sponsorshipFundUses)
      .innerJoin(projects, eq(projects.id, sponsorshipFundUses.projectId))
      .where(eq(sponsorshipFundUses.sponsorshipId, id)).orderBy(desc(sponsorshipFundUses.createdAt)),
  ]);
  const activeInvoice = invoiceHistory.find(invoice => invoice.status !== "void") ?? null;
  const [invoiceFile] = activeInvoice?.renderedFileId
    ? await db.select({ originalName: files.originalName, mimeType: files.mimeType, sizeBytes: files.sizeBytes }).from(files)
      .where(eq(files.id, activeInvoice.renderedFileId)).limit(1) : [];
  const draft = activeInvoice ? await getEmailDraftForUser(user.id, "mou_invoice", activeInvoice.id) : null;
  const allocations = receipts.length ? await db.select({
    receiptId: sponsorshipReceiptAllocations.receiptId, projectId: sponsorshipReceiptAllocations.projectId,
    projectTitle: projects.title, projectSlug: projects.slug,
    amount: sponsorshipReceiptAllocations.amount, actualNetAmount: sponsorshipReceiptAllocations.actualNetAmount,
  }).from(sponsorshipReceiptAllocations).innerJoin(projects, eq(projects.id, sponsorshipReceiptAllocations.projectId))
    .where(inArray(sponsorshipReceiptAllocations.receiptId, receipts.map(receipt => receipt.id))) : [];
  return { record, lines, activeInvoice, invoiceFile: (invoiceFile ?? null) as typeof invoiceFile | null, invoiceHistory, receipts, allocations, uses, draft };
}

export type SponsorshipDetail = NonNullable<Awaited<ReturnType<typeof getSponsorship>>>;

export async function listProjectSponsorshipFunds(projectId: string) {
  await requireRole("manager");
  await requireWorkspaceModule("sponsorships");
  const received = db.select({ sponsorshipId: sponsorshipReceipts.sponsorshipId,
    amount: sql<string>`sum(${sponsorshipReceiptAllocations.actualNetAmount})`.as("funds_received"),
  }).from(sponsorshipReceiptAllocations).innerJoin(sponsorshipReceipts, eq(sponsorshipReceipts.id, sponsorshipReceiptAllocations.receiptId))
    .where(and(eq(sponsorshipReceiptAllocations.projectId, projectId), isNull(sponsorshipReceipts.reversedAt)))
    .groupBy(sponsorshipReceipts.sponsorshipId).as("book_funds_received");
  const used = db.select({ sponsorshipId: sponsorshipFundUses.sponsorshipId,
    amount: sql<string>`sum(${sponsorshipFundUses.amount})`.as("funds_used"),
  }).from(sponsorshipFundUses).where(and(eq(sponsorshipFundUses.projectId, projectId), isNull(sponsorshipFundUses.reversedAt)))
    .groupBy(sponsorshipFundUses.sponsorshipId).as("book_funds_used");
  return db.selectDistinct({ id: sponsorships.id, title: sponsorships.title, recipientName: sponsorships.recipientName,
    currency: sponsorships.currency, received: sql<string>`coalesce(${received.amount}, 0)`,
    used: sql<string>`coalesce(${used.amount}, 0)`, available: sql<string>`coalesce(${received.amount}, 0) - coalesce(${used.amount}, 0)`,
  }).from(sponsorshipLines).innerJoin(sponsorships, eq(sponsorships.id, sponsorshipLines.sponsorshipId))
    .leftJoin(received, eq(received.sponsorshipId, sponsorships.id)).leftJoin(used, eq(used.sponsorshipId, sponsorships.id))
    .where(and(eq(sponsorshipLines.projectId, projectId), eq(sponsorships.status, "invoiced")));
}

export async function listSponsorshipBooks() {
  await requireRole("manager");
  await requireWorkspaceModule("sponsorships");
  return db.select({ id: projects.id, title: projects.title, slug: projects.slug })
    .from(projects).where(eq(projects.kind, "book")).orderBy(asc(projects.title));
}
