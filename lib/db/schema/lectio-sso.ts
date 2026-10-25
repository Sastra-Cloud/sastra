import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user, session } from "./auth";
import { lectioConnections } from "./lectio";

/** Separate consent from progress sync; pairing alone never enables sign-in. */
export const lectioSsoClients = pgTable("lectio_sso_clients", {
  connectionId: text("connection_id").primaryKey().references(() => lectioConnections.id),
  issuer: text("issuer").notNull(), clientId: text("client_id").notNull(),
  secret: text("secret").notNull(), enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const lectioSsoIdentities = pgTable("lectio_sso_identities", {
  id: uuid("id").primaryKey().defaultRandom(), userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  issuer: text("issuer").notNull(), subject: text("subject").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("lectio_sso_subject").on(t.issuer, t.subject), uniqueIndex("lectio_sso_user_issuer").on(t.userId, t.issuer)]);
export const lectioSsoSessions = pgTable("lectio_sso_sessions", {
  sessionId: text("session_id").primaryKey().references(() => session.id, { onDelete: "cascade" }),
  identityId: uuid("identity_id").notNull().references(() => lectioSsoIdentities.id, { onDelete: "cascade" }),
  connectionId: text("connection_id").notNull().references(() => lectioConnections.id),
});
