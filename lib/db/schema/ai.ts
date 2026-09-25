import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { projects } from "./projects";
import { draftStatus } from "./enums";
import type { ConversationMessage, ProposedPlan } from "@/lib/ai/types";

/** Per-task OpenRouter model config (editable in Settings ▸ AI). */
export const aiTaskModels = pgTable("ai_task_models", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskKey: text("task_key").notNull().unique(),
  model: text("model").notNull(),
  fallbackModels: text("fallback_models").array(),
  temperature: doublePrecision("temperature"),
  updatedBy: text("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** AI planner drafts — the interview transcript + the editable proposed plan. */
export const aiPlanDrafts = pgTable("ai_plan_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "set null",
  }),
  status: draftStatus("status").notNull().default("interviewing"),
  conversation: jsonb("conversation")
    .$type<ConversationMessage[]>()
    .notNull()
    .default([]),
  proposedPlan: jsonb("proposed_plan").$type<ProposedPlan>(),
  model: text("model"),
  committedAt: timestamp("committed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Singleton controls for AI usage that is not governed by per-user assistant budgets. */
export const aiUsageSettings = pgTable("ai_usage_settings", {
  id: text("id").primaryKey().default("workspace"),
  workspaceAiMonthlyBudgetUsd: doublePrecision("workspace_ai_monthly_budget_usd")
    .notNull()
    .default(25),
  workspaceAiEnabled: boolean("workspace_ai_enabled").notNull().default(true),
  cloudflareMonthlyBudgetUsd: doublePrecision("cloudflare_monthly_budget_usd")
    .notNull()
    .default(10),
  cloudflareEnabled: boolean("cloudflare_enabled").notNull().default(true),
  /** Fast typed pre-judgments (TypeSafe Jev). Opt-in per deployment. */
  typesafeEnabled: boolean("typesafe_enabled").notNull().default(false),
  /**
   * Admin-entered OpenRouter key, sealed with `lib/crypto/secret-box`. Takes
   * precedence over `OPENROUTER_API_KEY`; never returned to the browser.
   */
  openrouterApiKeyEncrypted: text("openrouter_api_key_encrypted"),
  openrouterApiKeyUpdatedAt: timestamp("openrouter_api_key_updated_at"),
  openrouterApiKeyUpdatedBy: text("openrouter_api_key_updated_by").references(
    () => user.id,
    { onDelete: "set null" }
  ),
  updatedBy: text("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Usage ledger for background/admin AI and estimated Cloudflare provider costs. */
export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    scope: text("scope").notNull().default("workspace"),
    taskKey: text("task_key"),
    feature: text("feature").notNull(),
    operation: text("operation").notNull(),
    model: text("model"),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    units: doublePrecision("units").notNull().default(0),
    unitName: text("unit_name"),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    estimated: boolean("estimated").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("ai_usage_events_scope_idx").on(t.scope, t.createdAt),
    index("ai_usage_events_provider_idx").on(t.provider, t.createdAt),
    index("ai_usage_events_task_idx").on(t.taskKey, t.createdAt),
    index("ai_usage_events_user_idx").on(t.userId, t.createdAt),
    index("ai_usage_events_project_idx").on(t.projectId, t.createdAt),
  ]
);
