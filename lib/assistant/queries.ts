import "server-only";

import { and, asc, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  assistantMessages,
  assistantFeedback,
  assistantPendingActions,
  assistantSettings,
  assistantUsage,
  user,
} from "@/lib/db/schema";
import { DEFAULT_MONTHLY_BUDGET_USD, monthStartUtc } from "./budget-math";
import {
  editableFieldsFor,
  riskLevelFor,
  type ActionRiskLevel,
  type EditableField,
} from "./tools";
import { resolveRange, type UsageRange } from "./usage-math";

export type AssistantThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  feedback: { rating: 1 | -1; comment: string | null } | null;
};

/** The visible transcript: user + assistant text turns (tool plumbing hidden). */
export async function getThread(userId: string): Promise<AssistantThreadMessage[]> {
  const rows = await db
    .select({
      id: assistantMessages.id,
      role: assistantMessages.role,
      content: assistantMessages.content,
      createdAt: assistantMessages.createdAt,
      feedbackRating: assistantFeedback.rating,
      feedbackComment: assistantFeedback.comment,
    })
    .from(assistantMessages)
    .leftJoin(
      assistantFeedback,
      and(
        eq(assistantFeedback.messageId, assistantMessages.id),
        eq(assistantFeedback.userId, userId)
      )
    )
    .where(eq(assistantMessages.userId, userId))
    .orderBy(asc(assistantMessages.id));
  return rows
    .filter(
      (r) =>
        (r.role === "user" || r.role === "assistant") &&
        !!r.content &&
        r.content.trim().length > 0
    )
    .map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      content: r.content as string,
      createdAt: r.createdAt.toISOString(),
      feedback:
        r.feedbackRating === 1 || r.feedbackRating === -1
          ? {
              rating: r.feedbackRating,
              comment: r.feedbackComment,
            }
          : null,
    }));
}

export type PendingActionView = {
  id: string;
  messageId: string;
  toolName: string;
  riskLevel: ActionRiskLevel;
  preview: string;
  /** Fields the user may edit before approving (empty when not editable). */
  editableFields: EditableField[];
  /** Current value of each editable field, as a string. */
  values: Record<string, string>;
};

export async function getPendingActions(
  userId: string
): Promise<PendingActionView[]> {
  const rows = await db
    .select({
      id: assistantPendingActions.id,
      messageId: assistantPendingActions.messageId,
      toolName: assistantPendingActions.toolName,
      preview: assistantPendingActions.preview,
      args: assistantPendingActions.args,
    })
    .from(assistantPendingActions)
    .where(
      and(
        eq(assistantPendingActions.userId, userId),
        eq(assistantPendingActions.status, "pending")
      )
    )
    .orderBy(asc(assistantPendingActions.createdAt));

  return rows.map((r) => {
    const editableFields = editableFieldsFor(r.toolName);
    const args = (r.args ?? {}) as Record<string, unknown>;
    const values: Record<string, string> = {};
    for (const f of editableFields) {
      const v = args[f.name];
      values[f.name] = v == null ? "" : String(v);
    }
    return {
      id: r.id,
      messageId: r.messageId,
      toolName: r.toolName,
      riskLevel: riskLevelFor(r.toolName),
      preview: r.preview,
      editableFields,
      values,
    };
  });
}

export type AssistantBudgetRow = {
  budgetUsd: number;
  enabled: boolean;
  spentUsd: number;
};

/** Per-user budget + this-month spend, for the admin team panel. */
export async function getAssistantBudgetMap(
  now = new Date()
): Promise<Record<string, AssistantBudgetRow>> {
  const [settings, spend] = await Promise.all([
    db.select().from(assistantSettings),
    db
      .select({
        userId: assistantUsage.userId,
        total: sql<number>`coalesce(sum(${assistantUsage.costUsd}), 0)`,
      })
      .from(assistantUsage)
      .where(gte(assistantUsage.createdAt, monthStartUtc(now)))
      .groupBy(assistantUsage.userId),
  ]);

  const spendByUser = new Map(spend.map((s) => [s.userId, Number(s.total)]));
  const out: Record<string, AssistantBudgetRow> = {};
  for (const s of settings) {
    out[s.userId] = {
      budgetUsd: s.monthlyBudgetUsd,
      enabled: s.enabled,
      spentUsd: spendByUser.get(s.userId) ?? 0,
    };
  }
  // Users with spend but no settings row → defaults.
  for (const [userId, total] of spendByUser) {
    if (!out[userId]) {
      out[userId] = {
        budgetUsd: DEFAULT_MONTHLY_BUDGET_USD,
        enabled: true,
        spentUsd: total,
      };
    }
  }
  return out;
}

// ── Admin usage report (assistant + email-compose calls in assistant_usage) ───

/** Only bound by created_at when the range has a start (all-time has none). */
function rangeFilter(start: Date | null) {
  return start ? gte(assistantUsage.createdAt, start) : sql`true`;
}

export type UsageTotals = {
  spendUsd: number;
  requests: number;
  tokens: number;
  activeUsers: number;
};

export async function getUsageTotals(
  range: UsageRange,
  now = new Date()
): Promise<UsageTotals> {
  const { start } = resolveRange(range, now);
  const [row] = await db
    .select({
      spendUsd: sql<number>`coalesce(sum(${assistantUsage.costUsd}), 0)::float8`,
      requests: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${assistantUsage.promptTokens} + ${assistantUsage.completionTokens}), 0)::int`,
      activeUsers: sql<number>`count(distinct ${assistantUsage.userId})::int`,
    })
    .from(assistantUsage)
    .where(rangeFilter(start));
  return {
    spendUsd: Number(row?.spendUsd ?? 0),
    requests: Number(row?.requests ?? 0),
    tokens: Number(row?.tokens ?? 0),
    activeUsers: Number(row?.activeUsers ?? 0),
  };
}

export type UsageBucket = { bucket: string; spendUsd: number; tokens: number };

export async function getUsageOverTime(
  range: UsageRange,
  now = new Date()
): Promise<UsageBucket[]> {
  const { start, bucket } = resolveRange(range, now);
  // Inline the bucket as a literal (only ever 'day'/'month', never user input) so
  // the truncation expression is textually identical in SELECT/GROUP BY/ORDER BY —
  // a bound param would produce distinct placeholders and break the GROUP BY.
  const trunc = sql`date_trunc(${bucket === "month" ? sql`'month'` : sql`'day'`}, ${assistantUsage.createdAt})`;
  const rows = await db
    .select({
      bucket: sql<string>`to_char(${trunc}, 'YYYY-MM-DD')`,
      spendUsd: sql<number>`coalesce(sum(${assistantUsage.costUsd}), 0)::float8`,
      tokens: sql<number>`coalesce(sum(${assistantUsage.promptTokens} + ${assistantUsage.completionTokens}), 0)::int`,
    })
    .from(assistantUsage)
    .where(rangeFilter(start))
    .groupBy(trunc)
    .orderBy(trunc);
  return rows.map((r) => ({
    bucket: r.bucket,
    spendUsd: Number(r.spendUsd),
    tokens: Number(r.tokens),
  }));
}

export type UsageByModel = {
  model: string;
  spendUsd: number;
  requests: number;
  tokens: number;
};

export async function getUsageByModel(
  range: UsageRange,
  now = new Date()
): Promise<UsageByModel[]> {
  const { start } = resolveRange(range, now);
  const rows = await db
    .select({
      model: sql<string>`coalesce(${assistantUsage.model}, 'unknown')`,
      spendUsd: sql<number>`coalesce(sum(${assistantUsage.costUsd}), 0)::float8`,
      requests: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${assistantUsage.promptTokens} + ${assistantUsage.completionTokens}), 0)::int`,
    })
    .from(assistantUsage)
    .where(rangeFilter(start))
    .groupBy(sql`coalesce(${assistantUsage.model}, 'unknown')`)
    .orderBy(desc(sql<number>`coalesce(sum(${assistantUsage.costUsd}), 0)`));
  return rows.map((r) => ({
    model: r.model,
    spendUsd: Number(r.spendUsd),
    requests: Number(r.requests),
    tokens: Number(r.tokens),
  }));
}

export type UsageByUser = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  requests: number;
  tokens: number;
  spendUsd: number;
  budgetUsd: number;
  enabled: boolean;
};

export async function getUsageByUser(
  range: UsageRange,
  now = new Date()
): Promise<UsageByUser[]> {
  const { start } = resolveRange(range, now);
  const [usage, settings, users] = await Promise.all([
    db
      .select({
        userId: assistantUsage.userId,
        spendUsd: sql<number>`coalesce(sum(${assistantUsage.costUsd}), 0)::float8`,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${assistantUsage.promptTokens} + ${assistantUsage.completionTokens}), 0)::int`,
      })
      .from(assistantUsage)
      .where(rangeFilter(start))
      .groupBy(assistantUsage.userId),
    db.select().from(assistantSettings),
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(user)
      .where(eq(user.isBot, false)),
  ]);

  const settingsByUser = new Map(settings.map((s) => [s.userId, s]));
  const userById = new Map(users.map((u) => [u.id, u]));

  return usage
    .map((u) => {
      const person = userById.get(u.userId);
      if (!person) return null; // bot or deleted user — exclude
      const s = settingsByUser.get(u.userId);
      return {
        userId: u.userId,
        name: person.name,
        email: person.email,
        image: person.image,
        requests: Number(u.requests),
        tokens: Number(u.tokens),
        spendUsd: Number(u.spendUsd),
        budgetUsd: s?.monthlyBudgetUsd ?? DEFAULT_MONTHLY_BUDGET_USD,
        enabled: s?.enabled ?? true,
      };
    })
    .filter((r): r is UsageByUser => r !== null)
    .sort((a, b) => b.spendUsd - a.spendUsd);
}
