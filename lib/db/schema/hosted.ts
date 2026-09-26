import { bigint, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Sastra Cloud entitlement for this instance: a singleton the control plane
 * writes through the signed management API. Absent (or in self-hosted mode)
 * means no seat limit and no AI credit cap.
 */
export const hostedEntitlements = pgTable("hosted_entitlements", {
  id: text("id").primaryKey().default("workspace"),
  instanceId: text("instance_id"),
  /** Active people plus pending invitations allowed; null = unlimited. */
  seatLimit: integer("seat_limit"),
  /** File space the plan allows, in bytes; null = unlimited. */
  storageLimitBytes: bigint("storage_limit_bytes", { mode: "number" }),
  /** Credits granted each month by the plan (1 credit = a fixed internal AI cost). */
  aiMonthlyCredits: integer("ai_monthly_credits").notNull().default(0),
  /** Purchased credits still available, used after the monthly ones. */
  aiPackCredits: integer("ai_pack_credits").notNull().default(0),
  billingState: text("billing_state")
    .$type<"trialing" | "active" | "past_due" | "suspended" | "cancelled">()
    .notNull()
    .default("active"),
  /** When this entitlement took effect (control-plane `occurred_at`). */
  effectiveAt: timestamp("effective_at").defaultNow().notNull(),
  lastEventId: text("last_event_id"),
  lastEventAt: timestamp("last_event_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Every accepted management event id, so a replayed request is ignored. */
export const hostedManagementEvents = pgTable("hosted_management_events", {
  eventId: text("event_id").primaryKey(),
  kind: text("kind").notNull(),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
});
