import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import type {
  AssistantConversationSummary,
  AssistantMemoryCategory,
  AssistantLessonScope,
  StoredToolCall,
} from "@/lib/assistant/types";

/**
 * The per-user assistant conversation (a single ongoing 1:1 thread per user).
 * `id` is a UUID v7 generated app-side so rows sort by time. A row is one of:
 *  - role "user"      → the user's message (content)
 *  - role "assistant" → the model's turn (content and/or toolCalls)
 *  - role "tool"      → a tool result (content + toolCallId + toolName)
 */
export const assistantMessages = pgTable(
  "assistant_messages",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content"),
    toolCalls: jsonb("tool_calls").$type<StoredToolCall[]>(),
    toolCallId: text("tool_call_id"),
    toolName: text("tool_name"),
    status: text("status").notNull().default("complete"),
    model: text("model"),
    costUsd: doublePrecision("cost_usd"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("assistant_messages_user_idx").on(t.userId, t.id)]
);

/** Write tool-calls the model proposed, held for explicit user approval. */
export const assistantPendingActions = pgTable(
  "assistant_pending_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => assistantMessages.id, { onDelete: "cascade" }),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    args: jsonb("args").$type<Record<string, unknown>>().notNull().default({}),
    preview: text("preview").notNull(),
    status: text("status").notNull().default("pending"),
    result: text("result"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [index("assistant_pending_user_idx").on(t.userId, t.status)]
);

/** Legacy Markdown memory retained only for migration/audit; never injected. */
export const assistantMemory = pgTable("assistant_memory", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Durable user memory is stored as reviewable facts. Only `active` rows are
 * injected, and their source is always an explicit user message or a human
 * edit—never tool output or third-party correspondence.
 */
export const assistantMemoryFacts = pgTable(
  "assistant_memory_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    category: text("category").$type<AssistantMemoryCategory>().notNull(),
    content: text("content").notNull(),
    source: text("source").notNull().default("explicit_user"),
    sourceMessageId: uuid("source_message_id").references(() => assistantMessages.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("candidate"),
    confidence: real("confidence").notNull().default(1),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("assistant_memory_facts_user_status_idx").on(t.userId, t.status),
    index("assistant_memory_facts_expiry_idx").on(t.expiresAt),
  ]
);

/** Structured, non-durable compaction of one user's older conversation turns. */
export const assistantConversationSummaries = pgTable(
  "assistant_conversation_summaries",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    summary: jsonb("summary").$type<AssistantConversationSummary>().notNull(),
    throughMessageId: uuid("through_message_id").references(() => assistantMessages.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  }
);

/** One user-initiated assistant run, used for latency/outcome/eval sampling. */
export const assistantTraceRuns = pgTable(
  "assistant_trace_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    userMessageId: uuid("user_message_id").references(() => assistantMessages.id, {
      onDelete: "set null",
    }),
    promptVersion: integer("prompt_version").notNull(),
    outcome: text("outcome").notNull().default("running"),
    model: text("model"),
    iterationCount: integer("iteration_count").notNull().default(0),
    toolNames: jsonb("tool_names").$type<string[]>().notNull().default([]),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [
    index("assistant_trace_runs_user_idx").on(t.userId, t.startedAt),
    index("assistant_trace_runs_outcome_idx").on(t.outcome, t.startedAt),
  ]
);

/** Redacted event details within a trace; prompts and email bodies are not stored. */
export const assistantTraceEvents = pgTable(
  "assistant_trace_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => assistantTraceRuns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    name: text("name"),
    status: text("status").notNull(),
    durationMs: integer("duration_ms"),
    model: text("model"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("assistant_trace_events_run_idx").on(t.runId, t.createdAt)]
);

/** User rating/correction on a visible assistant response. */
export const assistantFeedback = pgTable(
  "assistant_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => assistantMessages.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("assistant_feedback_user_message_uq").on(t.userId, t.messageId),
    index("assistant_feedback_rating_idx").on(t.rating, t.createdAt),
  ]
);

/** A scheduled reflection pass. It can create candidates, never activate them. */
export const assistantReflectionRuns = pgTable(
  "assistant_reflection_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: text("status").notNull().default("running"),
    promptVersion: integer("prompt_version").notNull(),
    model: text("model"),
    windowStart: timestamp("window_start").notNull(),
    windowEnd: timestamp("window_end").notNull(),
    evidenceCount: integer("evidence_count").notNull().default(0),
    candidateCount: integer("candidate_count").notNull().default(0),
    evidenceBreakdown: jsonb("evidence_breakdown")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    decisionSummary: text("decision_summary"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [index("assistant_reflection_runs_status_idx").on(t.status, t.createdAt)]
);

/** Shared procedural lessons proposed by reflection and promoted by an admin. */
export const assistantLessons = pgTable(
  "assistant_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reflectionRunId: uuid("reflection_run_id").references(
      () => assistantReflectionRuns.id,
      { onDelete: "set null" }
    ),
    key: text("key").notNull(),
    scope: text("scope").$type<AssistantLessonScope>().notNull(),
    toolName: text("tool_name"),
    lesson: text("lesson").notNull(),
    status: text("status").notNull().default("candidate"),
    confidence: real("confidence").notNull(),
    evidenceCount: integer("evidence_count").notNull(),
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull().default([]),
    evalStatus: text("eval_status").notNull().default("pending"),
    evalScore: real("eval_score"),
    baselineScore: real("baseline_score"),
    version: integer("version").notNull().default(1),
    rolloutPercent: integer("rollout_percent").notNull().default(0),
    supersedesId: uuid("supersedes_id"),
    approvedBy: text("approved_by").references(() => user.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("assistant_lessons_status_idx").on(t.status, t.createdAt),
    index("assistant_lessons_key_idx").on(t.key, t.status),
  ]
);

/** Regression cases generated from failures/corrections and curated by humans. */
export const assistantEvalCases = pgTable(
  "assistant_eval_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id").references(() => assistantLessons.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    source: text("source").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    expected: jsonb("expected").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("assistant_eval_cases_lesson_idx").on(t.lessonId, t.status)]
);

/** One row per model call for monthly cost rollup + audit (cost is from OpenRouter). */
export const assistantUsage = pgTable(
  "assistant_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    model: text("model"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("assistant_usage_user_idx").on(t.userId, t.createdAt)]
);

/** Admin-set per-user assistant budget + enable flag. Default $5/user/month. */
export const assistantSettings = pgTable("assistant_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  monthlyBudgetUsd: doublePrecision("monthly_budget_usd").notNull().default(5),
  enabled: boolean("enabled").notNull().default(true),
  memoryEnabled: boolean("memory_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
