import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Team-level role (single workspace — not per-project). */
export const teamRole = pgEnum("team_role", [
  "super_admin",
  "admin",
  "manager",
  "member",
]);

/**
 * Better Auth core tables. Property keys are camelCase to match Better Auth's
 * field names (the Drizzle adapter maps by JS key); DB column names are snake_case.
 * `user` is extended with our additional fields (role/timezone/isBot/isActive) —
 * these must also be declared in `auth.ts`'s `user.additionalFields`.
 */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  // ── Sastra additional fields ──
  role: teamRole("role").default("member").notNull(),
  timezone: text("timezone").default("UTC").notNull(),
  weeklyHours: integer("weekly_hours").default(40).notNull(),
  // Auto-start a time entry when this user moves one of their tasks to In progress.
  autoStartTimer: boolean("auto_start_timer").default(true).notNull(),
  // How much on-screen coaching this user sees ("on" | "off"). The global switch
  // behind guided steps, coach cards, and onboarding; per-element dismissals live
  // in userGuidanceDismissals below.
  guidanceLevel: text("guidance_level").default("on").notNull(),
  isBot: boolean("is_bot").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Better Auth rate-limit counters (`rateLimit.storage: "database"`), so sign-in
 * limits survive restarts and apply across replicas instead of living in one
 * process's memory. Field names follow Better Auth's model.
 */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/**
 * Per-user coaching state. Keeping stable guidance keys in their own rows makes
 * dismissals follow the account across browsers without growing the auth
 * session payload.
 */
export const userGuidanceDismissals = pgTable(
  "user_guidance_dismissals",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    guidanceKey: text("guidance_key").notNull(),
    dismissedAt: timestamp("dismissed_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.guidanceKey] })]
);

/**
 * Cropped profile photos live beside the auth user rather than in its session
 * payload or external workspace storage. This keeps the small image durable
 * without making every Better Auth session carry its base64 bytes.
 */
export const userAvatars = pgTable("user_avatars", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  data: text("data").notNull(),
  mimeType: text("mime_type").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** WebAuthn credentials managed by Better Auth's official passkey plugin. */
export const passkey = pgTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at").defaultNow(),
    aaguid: text("aaguid"),
  },
  (t) => [
    uniqueIndex("passkey_credential_uq").on(t.credentialID),
    index("passkey_user_idx").on(t.userId),
  ]
);

/**
 * A random HttpOnly browser token is stored only as a hash. Admin finance and
 * security actions accept it for 60 days after an email-code or passkey check.
 */
export const adminTrustedDevices = pgTable(
  "admin_trusted_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    verifiedBy: text("verified_by")
      .$type<"email_code" | "passkey">()
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (t) => [
    uniqueIndex("admin_trusted_devices_token_uq").on(t.tokenHash),
    index("admin_trusted_devices_user_idx").on(t.userId, t.expiresAt),
  ]
);

/** Short-lived, attempt-limited email challenges for admin assurance. */
export const adminAssuranceChallenges = pgTable(
  "admin_assurance_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("admin_assurance_challenges_user_idx").on(t.userId, t.createdAt)]
);

/** Minimal security audit trail. Never stores codes, cookies, or credential data. */
export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    event: text("event").notNull(),
    method: text("method"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("security_events_actor_idx").on(t.actorId, t.createdAt)]
);
