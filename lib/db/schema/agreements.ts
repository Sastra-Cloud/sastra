import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { projects } from "./projects";

/** One multi-project agreement whose completion gate is shared by every member. */
export const sharedMouGroups = pgTable(
  "shared_mou_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    counterparty: text("counterparty"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    signedDate: date("signed_date"),
    currency: text("currency").notNull().default("USD"),
    agreementTotal: numeric("agreement_total", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    // Kept without an FK to avoid a schema cycle with documentImports.
    sourceImportId: uuid("source_import_id"),
    // Hidden compatibility anchor for tasks, invoices, and project ledgers.
    administrativeProjectId: uuid("administrative_project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    managerNotes: text("manager_notes"),
    reviewRequired: boolean("review_required").notNull().default(false),
    reviewNote: text("review_note"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("shared_mou_groups_admin_project_idx").on(t.administrativeProjectId),
    index("shared_mou_groups_source_import_idx").on(t.sourceImportId),
  ]
);

/** Current project roster and reviewed agreement allocation. */
export const sharedMouMemberships = pgTable(
  "shared_mou_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => sharedMouGroups.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    allocationAmount: numeric("allocation_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    active: boolean("active").notNull().default(true),
    addedBy: text("added_by").references(() => user.id, {
      onDelete: "set null",
    }),
    addedReason: text("added_reason").notNull(),
    addedAt: timestamp("added_at").defaultNow().notNull(),
    removedBy: text("removed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    removedReason: text("removed_reason"),
    removedAt: timestamp("removed_at"),
  },
  (t) => [
    uniqueIndex("shared_mou_memberships_group_project_uq").on(
      t.groupId,
      t.projectId
    ),
    index("shared_mou_memberships_project_idx").on(t.projectId),
    index("shared_mou_memberships_group_active_idx").on(t.groupId, t.active),
  ]
);

/** Immutable manager audit trail for roster and allocation changes. */
export const sharedMouMembershipAudits = pgTable(
  "shared_mou_membership_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => sharedMouGroups.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").references(
      () => sharedMouMemberships.id,
      { onDelete: "set null" }
    ),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    previousAllocation: numeric("previous_allocation", {
      precision: 14,
      scale: 2,
    }),
    nextAllocation: numeric("next_allocation", { precision: 14, scale: 2 }),
    reason: text("reason").notNull(),
    managerId: text("manager_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("shared_mou_membership_audits_group_idx").on(t.groupId)],
);
