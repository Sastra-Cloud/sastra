import "server-only";

import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";

import { resolveRange, type UsageRange } from "@/lib/assistant/usage-math";
import { db } from "@/lib/db";
import {
  aiUsageEvents,
  assistantSettings,
  assistantUsage,
  projects,
  user,
} from "@/lib/db/schema";
import {
  DEFAULT_MONTHLY_BUDGET_USD,
  monthStartUtc,
} from "@/lib/assistant/budget-math";
import { hostedAccountUrl, isHostedInstance } from "@/lib/hosted/mode";
import { getOpenRouterApiKeyStatus } from "@/lib/ai/keys";
import type { AiAmountUnit } from "@/lib/ai/amount-format";
import {
  CLOUDFLARE_VOICE_NEURONS_PER_AUDIO_MINUTE,
  DEFAULT_CLOUDFLARE_MONTHLY_BUDGET_USD,
  DEFAULT_WORKSPACE_AI_MONTHLY_BUDGET_USD,
} from "./usage-costs";
import {
  getAiUsageSettings,
  getCloudflareBudgetStatus,
  getR2CurrentMonthlyEstimate,
  getWorkspaceAiBudgetStatus,
} from "./usage";

function assistantRange(start: Date | null) {
  return start ? gte(assistantUsage.createdAt, start) : sql`true`;
}

function eventRange(start: Date | null) {
  return start ? gte(aiUsageEvents.createdAt, start) : sql`true`;
}

/**
 * The assistant now writes member-scope openrouter rows to `aiUsageEvents` (for
 * the by-task/feature breakdown), but the same spend is ALSO in `assistantUsage`
 * (the per-user budget ledger). Any query that unions both tables must exclude
 * these member-scope rows from the `aiUsageEvents` side to avoid double-counting;
 * `assistantUsage` stays the single source of truth for assistant spend there.
 */
const notAssistantEvent = sql`not (${aiUsageEvents.provider} = 'openrouter' and ${aiUsageEvents.scope} = 'member')`;

export type UnifiedUsageTotals = {
  spendUsd: number;
  memberOpenrouterSpendUsd: number;
  workspaceOpenrouterSpendUsd: number;
  typesafeSpendUsd: number;
  cloudflareSpendUsd: number;
  cloudflareVoiceSpendUsd: number;
  r2SpendUsd: number;
  aiCalls: number;
  tokens: number;
  activeUsers: number;
  voiceMinutes: number;
  r2Operations: number;
};

export type UsageBucket = { bucket: string; spendUsd: number; tokens: number };

export type UsageByModel = {
  provider: string;
  model: string;
  spendUsd: number;
  requests: number;
  tokens: number;
};

export type WorkspaceUsageByTask = {
  provider: string;
  feature: string;
  operation: string;
  spendUsd: number;
  requests: number;
  tokens: number;
};

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

export async function getUnifiedUsageTotals(
  range: UsageRange,
  now = new Date()
): Promise<UnifiedUsageTotals> {
  const { start } = resolveRange(range, now);
  const [member, events, r2] = await Promise.all([
    db
      .select({
        spendUsd: sql<number>`coalesce(sum(${assistantUsage.costUsd}), 0)::float8`,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${assistantUsage.promptTokens} + ${assistantUsage.completionTokens}), 0)::int`,
        activeUsers: sql<number>`count(distinct ${assistantUsage.userId})::int`,
      })
      .from(assistantUsage)
      .where(assistantRange(start))
      .then((rows) => rows[0]),
    db
      .select({
        openrouterSpendUsd: sql<number>`coalesce(sum(case when ${aiUsageEvents.provider} = 'openrouter' and ${aiUsageEvents.scope} = 'workspace' then ${aiUsageEvents.costUsd} else 0 end), 0)::float8`,
        cloudflareVoiceSpendUsd: sql<number>`coalesce(sum(case when ${aiUsageEvents.provider} = 'cloudflare_workers_ai' then ${aiUsageEvents.costUsd} else 0 end), 0)::float8`,
        typesafeSpendUsd: sql<number>`coalesce(sum(case when ${aiUsageEvents.provider} = 'typesafe' then ${aiUsageEvents.costUsd} else 0 end), 0)::float8`,
        aiCalls: sql<number>`coalesce(sum(case when ${aiUsageEvents.provider} in ('openrouter', 'cloudflare_workers_ai', 'typesafe') then 1 else 0 end), 0)::int`,
        tokens: sql<number>`coalesce(sum(${aiUsageEvents.promptTokens} + ${aiUsageEvents.completionTokens}), 0)::int`,
        activeUsers: sql<number>`count(distinct ${aiUsageEvents.userId})::int`,
        voiceMinutes: sql<number>`coalesce(sum(case when ${aiUsageEvents.provider} = 'cloudflare_workers_ai' then ${aiUsageEvents.units} / ${CLOUDFLARE_VOICE_NEURONS_PER_AUDIO_MINUTE} else 0 end), 0)::float8`,
        r2Operations: sql<number>`coalesce(sum(case when ${aiUsageEvents.provider} = 'cloudflare_r2' then ${aiUsageEvents.units} else 0 end), 0)::float8`,
      })
      .from(aiUsageEvents)
      // Exclude member-scope assistant rows — counted via `assistantUsage` above.
      .where(and(eventRange(start), notAssistantEvent))
      .then((rows) => rows[0]),
    getR2CurrentMonthlyEstimate(now),
  ]);

  const memberSpend = Number(member?.spendUsd ?? 0);
  const workspaceOpenrouterSpendUsd = Number(events?.openrouterSpendUsd ?? 0);
  const cloudflareVoiceSpendUsd = Number(events?.cloudflareVoiceSpendUsd ?? 0);
  const typesafeSpendUsd = Number(events?.typesafeSpendUsd ?? 0);
  const r2SpendUsd = r2.totalCostUsd;
  return {
    spendUsd:
      memberSpend +
      workspaceOpenrouterSpendUsd +
      cloudflareVoiceSpendUsd +
      typesafeSpendUsd +
      r2SpendUsd,
    memberOpenrouterSpendUsd: memberSpend,
    workspaceOpenrouterSpendUsd,
    typesafeSpendUsd,
    cloudflareSpendUsd: cloudflareVoiceSpendUsd + r2SpendUsd,
    cloudflareVoiceSpendUsd,
    r2SpendUsd,
    aiCalls: Number(member?.requests ?? 0) + Number(events?.aiCalls ?? 0),
    tokens: Number(member?.tokens ?? 0) + Number(events?.tokens ?? 0),
    activeUsers: Math.max(
      Number(member?.activeUsers ?? 0),
      Number(events?.activeUsers ?? 0)
    ),
    voiceMinutes: Number(events?.voiceMinutes ?? 0),
    r2Operations: Number(events?.r2Operations ?? 0),
  };
}

export async function getUnifiedUsageOverTime(
  range: UsageRange,
  now = new Date()
): Promise<UsageBucket[]> {
  const { start, bucket } = resolveRange(range, now);
  const truncAssistant = sql`date_trunc(${bucket === "month" ? sql`'month'` : sql`'day'`}, ${assistantUsage.createdAt})`;
  const truncEvents = sql`date_trunc(${bucket === "month" ? sql`'month'` : sql`'day'`}, ${aiUsageEvents.createdAt})`;
  const [memberRows, eventRows] = await Promise.all([
    db
      .select({
        bucket: sql<string>`to_char(${truncAssistant}, 'YYYY-MM-DD')`,
        spendUsd: sql<number>`coalesce(sum(${assistantUsage.costUsd}), 0)::float8`,
        tokens: sql<number>`coalesce(sum(${assistantUsage.promptTokens} + ${assistantUsage.completionTokens}), 0)::int`,
      })
      .from(assistantUsage)
      .where(assistantRange(start))
      .groupBy(truncAssistant)
      .orderBy(truncAssistant),
    db
      .select({
        bucket: sql<string>`to_char(${truncEvents}, 'YYYY-MM-DD')`,
        spendUsd: sql<number>`coalesce(sum(${aiUsageEvents.costUsd}), 0)::float8`,
        tokens: sql<number>`coalesce(sum(${aiUsageEvents.promptTokens} + ${aiUsageEvents.completionTokens}), 0)::int`,
      })
      .from(aiUsageEvents)
      .where(
        and(
          eventRange(start),
          inArray(aiUsageEvents.provider, [
            "openrouter",
            "cloudflare_workers_ai",
            "typesafe",
          ]),
          notAssistantEvent
        )
      )
      .groupBy(truncEvents)
      .orderBy(truncEvents),
  ]);

  const merged = new Map<string, UsageBucket>();
  for (const row of [...memberRows, ...eventRows]) {
    const prev = merged.get(row.bucket) ?? {
      bucket: row.bucket,
      spendUsd: 0,
      tokens: 0,
    };
    prev.spendUsd += Number(row.spendUsd);
    prev.tokens += Number(row.tokens);
    merged.set(row.bucket, prev);
  }
  return [...merged.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export async function getUnifiedUsageByModel(
  range: UsageRange,
  now = new Date()
): Promise<UsageByModel[]> {
  const { start } = resolveRange(range, now);
  const [memberRows, eventRows] = await Promise.all([
    db
      .select({
        provider: sql<string>`'openrouter'`,
        model: sql<string>`coalesce(${assistantUsage.model}, 'unknown')`,
        spendUsd: sql<number>`coalesce(sum(${assistantUsage.costUsd}), 0)::float8`,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${assistantUsage.promptTokens} + ${assistantUsage.completionTokens}), 0)::int`,
      })
      .from(assistantUsage)
      .where(assistantRange(start))
      .groupBy(sql`coalesce(${assistantUsage.model}, 'unknown')`),
    db
      .select({
        provider: aiUsageEvents.provider,
        model: sql<string>`coalesce(${aiUsageEvents.model}, ${aiUsageEvents.taskKey}, ${aiUsageEvents.operation}, 'unknown')`,
        spendUsd: sql<number>`coalesce(sum(${aiUsageEvents.costUsd}), 0)::float8`,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${aiUsageEvents.promptTokens} + ${aiUsageEvents.completionTokens}), 0)::int`,
      })
      .from(aiUsageEvents)
      .where(
        and(
          eventRange(start),
          inArray(aiUsageEvents.provider, [
            "openrouter",
            "cloudflare_workers_ai",
            "typesafe",
          ]),
          notAssistantEvent
        )
      )
      .groupBy(
        aiUsageEvents.provider,
        sql`coalesce(${aiUsageEvents.model}, ${aiUsageEvents.taskKey}, ${aiUsageEvents.operation}, 'unknown')`
      ),
  ]);
  return [...memberRows, ...eventRows]
    .map((r) => ({
      provider: r.provider,
      model: r.model,
      spendUsd: Number(r.spendUsd),
      requests: Number(r.requests),
      tokens: Number(r.tokens),
    }))
    .sort((a, b) => b.spendUsd - a.spendUsd);
}

export async function getWorkspaceUsageByTask(
  range: UsageRange,
  now = new Date()
): Promise<WorkspaceUsageByTask[]> {
  const { start } = resolveRange(range, now);
  const rows = await db
    .select({
      provider: aiUsageEvents.provider,
      feature: aiUsageEvents.feature,
      operation: aiUsageEvents.operation,
      spendUsd: sql<number>`coalesce(sum(${aiUsageEvents.costUsd}), 0)::float8`,
      requests: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${aiUsageEvents.promptTokens} + ${aiUsageEvents.completionTokens}), 0)::int`,
    })
    .from(aiUsageEvents)
    .where(and(eventRange(start), ne(aiUsageEvents.provider, "cloudflare_r2")))
    .groupBy(aiUsageEvents.provider, aiUsageEvents.feature, aiUsageEvents.operation)
    .orderBy(desc(sql<number>`coalesce(sum(${aiUsageEvents.costUsd}), 0)`));
  return rows.map((r) => ({
    provider: r.provider,
    feature: r.feature,
    operation: r.operation,
    spendUsd: Number(r.spendUsd),
    requests: Number(r.requests),
    tokens: Number(r.tokens),
  }));
}

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
      .where(assistantRange(start))
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
      if (!person) return null;
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

export type AiSpendByProject = {
  projectId: string;
  projectTitle: string;
  projectSlug: string;
  spendUsd: number;
  requests: number;
  tokens: number;
};

/**
 * AI spend attributed to projects (events with a projectId — extraction,
 * doc import, drafting; workspace-level tasks like standups have none).
 * Operational-cost visibility only; never mixed into budget quotations.
 */
export async function getAiSpendByProject(
  range: UsageRange,
  now = new Date()
): Promise<AiSpendByProject[]> {
  const { start } = resolveRange(range, now);
  const rows = await db
    .select({
      projectId: aiUsageEvents.projectId,
      projectTitle: projects.title,
      projectSlug: projects.slug,
      spendUsd: sql<number>`coalesce(sum(${aiUsageEvents.costUsd}), 0)::float8`,
      requests: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${aiUsageEvents.promptTokens} + ${aiUsageEvents.completionTokens}), 0)::int`,
    })
    .from(aiUsageEvents)
    .innerJoin(projects, eq(projects.id, aiUsageEvents.projectId))
    .where(eventRange(start))
    .groupBy(aiUsageEvents.projectId, projects.title, projects.slug)
    .orderBy(desc(sql<number>`coalesce(sum(${aiUsageEvents.costUsd}), 0)`));
  return rows
    .filter((r): r is typeof r & { projectId: string } => r.projectId !== null)
    .map((r) => ({
      projectId: r.projectId,
      projectTitle: r.projectTitle,
      projectSlug: r.projectSlug,
      spendUsd: Number(r.spendUsd),
      requests: Number(r.requests),
      tokens: Number(r.tokens),
    }));
}

/** One project's AI spend: all-time and current-month totals. */
export async function getProjectAiSpend(projectId: string, now = new Date()) {
  const monthStartIso = monthStartUtc(now).toISOString();
  const [row] = await db
    .select({
      allTimeUsd: sql<number>`coalesce(sum(${aiUsageEvents.costUsd}), 0)::float8`,
      monthUsd: sql<number>`coalesce(sum(case when ${aiUsageEvents.createdAt} >= ${monthStartIso}::timestamp then ${aiUsageEvents.costUsd} else 0 end), 0)::float8`,
      requests: sql<number>`count(*)::int`,
    })
    .from(aiUsageEvents)
    .where(eq(aiUsageEvents.projectId, projectId));
  return {
    allTimeUsd: Number(row?.allTimeUsd ?? 0),
    monthUsd: Number(row?.monthUsd ?? 0),
    requests: Number(row?.requests ?? 0),
  };
}

export async function getAiUsageSettingsReport(now = new Date()) {
  const hosted = isHostedInstance();
  const [settings, workspaceBudget, cloudflareBudget, r2Estimate, keyStatus] =
    await Promise.all([
      getAiUsageSettings(),
      getWorkspaceAiBudgetStatus(now),
      getCloudflareBudgetStatus(now),
      getR2CurrentMonthlyEstimate(now),
      getOpenRouterApiKeyStatus(),
    ]);

  return {
    /** On Sastra Cloud the workspace AI cap follows the plan's credits, so admins cannot edit it. */
    budgetManagedByPlan: hosted,
    /** Hosted workspaces see credits only; self-hosted admins see provider dollars. */
    unit: (hosted ? "credits" : "usd") as AiAmountUnit,
    /** A workspace-entered AI key bypasses the plan's credits entirely. */
    ownKey: hosted && keyStatus.source === "settings",
    accountUrl: hosted ? hostedAccountUrl() : null,
    settings: {
      workspaceAiMonthlyBudgetUsd:
        settings.workspaceAiMonthlyBudgetUsd ??
        DEFAULT_WORKSPACE_AI_MONTHLY_BUDGET_USD,
      workspaceAiEnabled: settings.workspaceAiEnabled,
      cloudflareMonthlyBudgetUsd:
        settings.cloudflareMonthlyBudgetUsd ??
        DEFAULT_CLOUDFLARE_MONTHLY_BUDGET_USD,
      cloudflareEnabled: settings.cloudflareEnabled,
    },
    workspaceBudget,
    cloudflareBudget,
    r2Estimate,
  };
}
