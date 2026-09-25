import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Reusable directory of funding partners / MoU counterparties (foundations,
 * churches, sponsors). Filled in manually in Settings or auto-created from a
 * document import. An organization can have several contacts.
 */
export const partners = pgTable("partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  website: text("website"),
  billingAddress: text("billing_address"),
  notes: text("notes"),
  // Provenance when auto-created from a document import (no FK to avoid a cycle
  // with documentImports).
  sourceImportId: uuid("source_import_id"),
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** People we deal with at a partner org (different people for the same org). */
export const partnerContacts = pgTable(
  "partner_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    role: text("role"),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("partner_contacts_partner_idx").on(t.partnerId)]
);
