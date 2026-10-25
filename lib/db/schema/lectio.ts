import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { sql } from "drizzle-orm";
import { phases, projects, units } from "./projects";
import { tasks } from "./tasks";
import type { ProjectSnapshot, StageMapping } from "../../lectio/protocol/contract";

/** Entirely opt-in: existing projects/users acquire no integration rows during migration. */
export const lectioConnections = pgTable("lectio_connections", {
  id: text("id").primaryKey(), epoch: text("epoch").notNull(),
  origin: text("origin").notNull(), teamId: text("team_id").notNull(), teamName: text("team_name").notNull(),
  state: text("state").$type<"pending" | "active" | "paused" | "revoked">().notNull().default("pending"),
  incomingKeyId: text("incoming_key_id").notNull().default("initial"),
  incomingSecret: text("incoming_secret").notNull(), outgoingKeyId: text("outgoing_key_id").notNull().default("initial"),
  outgoingSecret: text("outgoing_secret").notNull(),
  previousIncomingKeyId: text("previous_incoming_key_id"), previousIncomingSecret: text("previous_incoming_secret"),
  previousIncomingExpiresAt: timestamp("previous_incoming_expires_at", { withTimezone: true }),
  autoCreate: boolean("auto_create").notNull().default(false),
  profile: jsonb("profile").$type<Record<string, unknown>>().notNull().default({}),
  pairedBy: text("paired_by").references(() => user.id, { onDelete: "set null" }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }), lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("lectio_connection_origin_team").on(t.origin, t.teamId).where(sql`${t.state} <> 'revoked'`)]);

export const lectioProjectLinks = pgTable("lectio_project_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectionId: text("connection_id").notNull().references(() => lectioConnections.id),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  remoteProjectId: text("remote_project_id").notNull(), projectKey: text("project_key").notNull(),
  generation: integer("generation").notNull().default(1),
  state: text("state").$type<"linking" | "active" | "unlinked" | "removed">().notNull().default("linking"),
  stageMap: jsonb("stage_map").$type<StageMapping[]>().notNull().default([]),
  handoffPhaseId: uuid("handoff_phase_id").references(() => phases.id, { onDelete: "set null" }),
  deliverFiles: boolean("deliver_files").notNull().default(false),
  lastVersion: integer("last_version").notNull().default(0), requestedVersion: integer("requested_version").notNull().default(0),
  planningVersion: integer("planning_version").notNull().default(0),
  snapshot: jsonb("snapshot").$type<ProjectSnapshot>(),
  lastAppliedAt: timestamp("last_applied_at", { withTimezone: true }), lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  lastError: text("last_error"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("lectio_project_local").on(t.projectId).where(sql`${t.state} in ('active', 'linking')`),
  uniqueIndex("lectio_project_remote").on(t.connectionId, t.remoteProjectId), uniqueIndex("lectio_project_key").on(t.connectionId, t.projectKey)]);

export const lectioUnitLinks = pgTable("lectio_unit_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  linkId: uuid("link_id").notNull().references(() => lectioProjectLinks.id),
  documentId: text("document_id").notNull(), unitId: uuid("unit_id").notNull().references(() => units.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(true),
  handoffTaskId: uuid("handoff_task_id").references(() => tasks.id, { onDelete: "set null" }),
}, t => [uniqueIndex("lectio_unit_document").on(t.linkId, t.documentId), uniqueIndex("lectio_unit_local").on(t.unitId)]);

export const lectioTaskLinks = pgTable("lectio_task_links", {
  taskId: uuid("task_id").primaryKey().references(() => tasks.id, { onDelete: "cascade" }),
  linkId: uuid("link_id").notNull().references(() => lectioProjectLinks.id),
  documentId: text("document_id").notNull(), stepKeys: jsonb("step_keys").$type<string[]>().notNull(),
  observedState: text("observed_state").notNull().default("todo"),
  reopenPending: boolean("reopen_pending").notNull().default(false),
  retainedCycle: text("retained_cycle"), active: boolean("active").notNull().default(true),
}, t => [index("lectio_tasks_link").on(t.linkId)]);

export const lectioUserLinks = pgTable("lectio_user_links", {
  id: uuid("id").primaryKey().defaultRandom(), connectionId: text("connection_id").notNull().references(() => lectioConnections.id),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  remoteUserId: text("remote_user_id").notNull(), remoteName: text("remote_name").notNull(),
  confirmedBy: text("confirmed_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("lectio_person_local").on(t.connectionId, t.userId), uniqueIndex("lectio_person_remote").on(t.connectionId, t.remoteUserId)]);

export const lectioRequests = pgTable("lectio_requests", {
  id: uuid("id").primaryKey().defaultRandom(), connectionId: text("connection_id").notNull().references(() => lectioConnections.id),
  requestId: text("request_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("lectio_request_replay").on(t.connectionId, t.requestId), index("lectio_requests_cleanup").on(t.createdAt)]);

export const lectioPairingIntents = pgTable("lectio_pairing_intents", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  origin: text("origin").notNull(), verifier: text("verifier").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  connectionId: text("connection_id"), completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const lectioOperations = pgTable("lectio_operations", {
  id: uuid("id").primaryKey().defaultRandom(), connectionId: text("connection_id").notNull().references(() => lectioConnections.id),
  operationId: text("operation_id").notNull(), direction: text("direction").$type<"in" | "out">().notNull(),
  kind: text("kind").notNull(), fingerprint: text("fingerprint").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(), result: jsonb("result").$type<Record<string, unknown>>(),
  state: text("state").$type<"pending" | "done" | "parked">().notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0), availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }), lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("lectio_operation_key").on(t.connectionId, t.direction, t.operationId), index("lectio_operations_due").on(t.state, t.availableAt)]);
