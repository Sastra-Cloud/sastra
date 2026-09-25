import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { projects } from "./projects";
import { tasks } from "./tasks";
import { agreementType, rightsOverall, rightsStepStatus } from "./enums";

/** Reusable directory of rights holders / publishers (Desiring God, Crossway, …). */
export const rightsHolders = pgTable("rights_holders", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  website: text("website"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const rightsContacts = pgTable("rights_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  holderId: uuid("holder_id")
    .notNull()
    .references(() => rightsHolders.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * One rights agreement per project (the source work). Two-step model: an MoU
 * (commercial or not) and an optional follow-up commercial license — or a
 * straight commercial license. MoU and license can have different holders
 * (e.g. MoU from Desiring God, print license from Crossway). `overallStatus`
 * is derived in the action and drives the rights blocker.
 */
export const rightsItems = pgTable(
  "rights_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    agreementType: agreementType("agreement_type")
      .notNull()
      .default("mou_plus_license"),

    // ── MoU step ──
    mouStatus: rightsStepStatus("mou_status").notNull().default("not_started"),
    mouCommercial: boolean("mou_commercial").notNull().default(false),
    mouSignedDate: date("mou_signed_date"),
    mouHolderId: uuid("mou_holder_id").references(() => rightsHolders.id, {
      onDelete: "set null",
    }),
    mouContactId: uuid("mou_contact_id").references(() => rightsContacts.id, {
      onDelete: "set null",
    }),
    mouAssignedTo: text("mou_assigned_to").references(() => user.id, {
      onDelete: "set null",
    }),
    mouTaskId: uuid("mou_task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    mouExpiresDate: date("mou_expires_date"),

    // ── Commercial license step ──
    licenseStatus: rightsStepStatus("license_status")
      .notNull()
      .default("not_needed"),
    licenseSignedDate: date("license_signed_date"),
    licenseHolderId: uuid("license_holder_id").references(
      () => rightsHolders.id,
      { onDelete: "set null" }
    ),
    licenseContactId: uuid("license_contact_id").references(
      () => rightsContacts.id,
      { onDelete: "set null" }
    ),
    licenseAssignedTo: text("license_assigned_to").references(() => user.id, {
      onDelete: "set null",
    }),
    licenseTaskId: uuid("license_task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    licenseExpiresDate: date("license_expires_date"),
    // License term + renewal. `licenseExpiresDate` is the initial term-end.
    licenseTermMonths: integer("license_term_months"),
    licenseAutoRenews: boolean("license_auto_renews").notNull().default(false),
    licenseRenewalMonths: integer("license_renewal_months"),
    licenseRenewalNoticeDays: integer("license_renewal_notice_days"),
    licenseRenewalLeadDays: integer("license_renewal_lead_days")
      .notNull()
      .default(30),
    licenseRenewalAssignedTo: text("license_renewal_assigned_to").references(
      () => user.id,
      { onDelete: "set null" }
    ),

    // ── License fee (money paid FOR the license; the estimate lives as a
    // budget line, this tracks the actual payable + paid state). When
    // `licenseFeeRecurs` is on, a fresh payable is generated per renewal term.
    licenseFeeAmount: numeric("license_fee_amount", { precision: 14, scale: 2 }),
    licenseFeeCurrency: text("license_fee_currency"),
    licenseFeeDueDate: date("license_fee_due_date"),
    licenseFeeRecurs: boolean("license_fee_recurs").notNull().default(false),
    licenseFeeAssignedTo: text("license_fee_assigned_to").references(
      () => user.id,
      { onDelete: "set null" }
    ),

    // ── Copyright (for layout / typesetting) ──
    copyrightHolderId: uuid("copyright_holder_id").references(
      () => rightsHolders.id,
      { onDelete: "set null" }
    ),
    copyrightNotice: text("copyright_notice"),
    // Licensed territory, e.g. "Cambodia" (extracted from the agreement).
    territory: text("territory"),

    // ── Outcome ──
    commercialGranted: boolean("commercial_granted").notNull().default(false),
    formatPrint: boolean("format_print").notNull().default(false),
    formatEbook: boolean("format_ebook").notNull().default(false),
    formatAudio: boolean("format_audio").notNull().default(false),
    formatVideo: boolean("format_video").notNull().default(false),
    rightsStartDate: date("rights_start_date"),
    completeByDate: date("complete_by_date"),
    maxCopies: integer("max_copies"),
    notes: text("notes"),
    overallStatus: rightsOverall("overall_status").notNull().default("none"),

    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("rights_items_project_uq").on(t.projectId)]
);

/**
 * Idempotency ledger for license-renewal reminder tasks (one per project per
 * renewal period), mirroring `royalty_payments`. The daily generator inserts a
 * row keyed by (projectId, period=expiry date) before creating the task.
 */
export const licenseRenewalReminders = pgTable(
  "license_renewal_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("license_renewal_reminders_project_period_uq").on(
      t.projectId,
      t.period
    ),
  ]
);

/**
 * License-fee payment ledger (money paid to secure/renew a license), mirroring
 * `royaltyPayments`. One `period` per project ("initial" for the first fee, then
 * the renewal expiry date for each recurring renewal fee). The daily generator
 * inserts a row + assigned reminder task ahead of the due date; `paidAt`/`paidBy`
 * record settlement. Deduped on (projectId, period).
 */
export const licenseFeePayments = pgTable(
  "license_fee_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // "initial" or a renewal expiry date (YYYY-MM-DD)
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("USD"),
    dueDate: date("due_date"),
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    notes: text("notes"),
    paidAt: timestamp("paid_at"),
    paidBy: text("paid_by").references(() => user.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("license_fee_payments_project_period_uq").on(
      t.projectId,
      t.period
    ),
    index("license_fee_payments_project_idx").on(t.projectId),
  ]
);
