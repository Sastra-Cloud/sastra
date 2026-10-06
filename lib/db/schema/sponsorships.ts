import { sql } from "drizzle-orm";
import { check, date, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { partners } from "./partners";
import { projects } from "./projects";
import { invoices } from "./budget";

/** A reviewed sponsorship draft. Issuance freezes its book lines until voided. */
export const sponsorships = pgTable("sponsorships", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "set null" }),
  recipientName: text("recipient_name").notNull(),
  recipientEmail: text("recipient_email"),
  recipientAddress: text("recipient_address"),
  currency: text("currency").notNull(),
  dueDate: date("due_date"),
  notes: text("notes"),
  deductionBps: integer("deduction_bps").notNull().default(0),
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, t => [
  check("sponsorships_status_check", sql`${t.status} in ('draft', 'invoiced', 'cancelled')`),
  check("sponsorships_deduction_check", sql`${t.deductionBps} between 0 and 9999`),
  index("sponsorships_partner_idx").on(t.partnerId),
]);

export const sponsorshipLines = pgTable("sponsorship_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  sponsorshipId: uuid("sponsorship_id").notNull().references(() => sponsorships.id, { onDelete: "restrict" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "restrict" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").notNull(),
}, t => [
  check("sponsorship_lines_quantity_check", sql`${t.quantity} > 0`),
  check("sponsorship_lines_price_check", sql`${t.unitPrice} > 0`),
  index("sponsorship_lines_sponsorship_idx").on(t.sponsorshipId),
]);

/** One incoming payment, including the retained audit of reversed payments. */
export const sponsorshipReceipts = pgTable("sponsorship_receipts", {
  id: uuid("id").primaryKey(), // client request ID makes a retried save idempotent
  sponsorshipId: uuid("sponsorship_id").notNull().references(() => sponsorships.id, { onDelete: "restrict" }),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  actualNetAmount: numeric("actual_net_amount", { precision: 14, scale: 2 }).notNull(),
  receivedDate: date("received_date").notNull(),
  note: text("note"),
  recordedBy: text("recorded_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reversedAt: timestamp("reversed_at"),
  reversedBy: text("reversed_by").references(() => user.id, { onDelete: "set null" }),
  reversalReason: text("reversal_reason"),
}, t => [
  check("sponsorship_receipts_amount_check", sql`${t.amount} > 0 and ${t.actualNetAmount} between 0 and ${t.amount}`),
  index("sponsorship_receipts_sponsorship_idx").on(t.sponsorshipId),
]);

export const sponsorshipReceiptAllocations = pgTable("sponsorship_receipt_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  receiptId: uuid("receipt_id").notNull().references(() => sponsorshipReceipts.id, { onDelete: "restrict" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  actualNetAmount: numeric("actual_net_amount", { precision: 14, scale: 2 }).notNull(),
}, t => [
  uniqueIndex("sponsorship_receipt_allocation_project_uq").on(t.receiptId, t.projectId),
]);

/** Drawdowns against one book's received sponsorship funds, independent of budgets. */
export const sponsorshipFundUses = pgTable("sponsorship_fund_uses", {
  id: uuid("id").primaryKey(),
  sponsorshipId: uuid("sponsorship_id").notNull().references(() => sponsorships.id, { onDelete: "restrict" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  usedDate: date("used_date").notNull(),
  note: text("note").notNull(),
  recordedBy: text("recorded_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reversedAt: timestamp("reversed_at"),
  reversedBy: text("reversed_by").references(() => user.id, { onDelete: "set null" }),
  reversalReason: text("reversal_reason"),
}, t => [
  check("sponsorship_fund_uses_amount_check", sql`${t.amount} > 0`),
  index("sponsorship_fund_uses_sponsorship_idx").on(t.sponsorshipId),
  index("sponsorship_fund_uses_project_idx").on(t.projectId),
]);
