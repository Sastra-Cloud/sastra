import "server-only";

import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { monthStartUtc } from "@/lib/assistant/budget-math";
import { CREDITS_USED_UP_MESSAGE } from "@/lib/hosted/credits";
import { isHostedInstance } from "@/lib/hosted/mode";
import { db } from "@/lib/db";
import { aiUsageEvents, aiUsageSettings, files, wikiMedia } from "@/lib/db/schema";
import {
  DEFAULT_CLOUDFLARE_MONTHLY_BUDGET_USD,
  DEFAULT_WORKSPACE_AI_MONTHLY_BUDGET_USD,
  bytesToGib,
  estimateR2StandardMonthlyCost,
} from "./usage-costs";

const SETTINGS_ID = "workspace";

export type AiUsageProvider =
  | "openrouter"
  | "cloudflare_workers_ai"
  | "cloudflare_r2"
  | "typesafe";

export type AiUsageScope = "member" | "workspace";

export class AiBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiBudgetExceededError";
  }
}

export type AiMetering = {
  scope: AiUsageScope;
  feature: string;
  operation: string;
  taskKey?: string;
  userId?: string | null;
  actorUserId?: string | null;
  projectId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function getAiUsageSettings() {
  const [row] = await db
    .select()
    .from(aiUsageSettings)
    .where(eq(aiUsageSettings.id, SETTINGS_ID))
    .limit(1);
  return {
    id: SETTINGS_ID,
    workspaceAiMonthlyBudgetUsd:
      row?.workspaceAiMonthlyBudgetUsd ?? DEFAULT_WORKSPACE_AI_MONTHLY_BUDGET_USD,
    workspaceAiEnabled: row?.workspaceAiEnabled ?? true,
    cloudflareMonthlyBudgetUsd:
      row?.cloudflareMonthlyBudgetUsd ?? DEFAULT_CLOUDFLARE_MONTHLY_BUDGET_USD,
    cloudflareEnabled: row?.cloudflareEnabled ?? true,
    typesafeEnabled: row?.typesafeEnabled ?? false,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function recordAiUsage(input: {
  provider: AiUsageProvider;
  scope: AiUsageScope;
  taskKey?: string | null;
  feature: string;
  operation: string;
  model?: string | null;
  userId?: string | null;
  actorUserId?: string | null;
  projectId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  units?: number;
  unitName?: string | null;
  costUsd?: number;
  estimated?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(aiUsageEvents).values({
    provider: input.provider,
    scope: input.scope,
    taskKey: input.taskKey ?? null,
    feature: input.feature,
    operation: input.operation,
    model: input.model ?? null,
    userId: input.userId ?? null,
    actorUserId: input.actorUserId ?? null,
    projectId: input.projectId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    promptTokens: Math.max(0, Math.round(input.promptTokens ?? 0)),
    completionTokens: Math.max(0, Math.round(input.completionTokens ?? 0)),
    units: Math.max(0, input.units ?? 0),
    unitName: input.unitName ?? null,
    costUsd: Math.max(0, input.costUsd ?? 0),
    estimated: input.estimated ?? false,
    metadata: input.metadata,
  });
}

export async function workspaceAiMonthSpendUsd(now = new Date()): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${aiUsageEvents.costUsd}), 0)::float8`,
    })
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.provider, "openrouter"),
        eq(aiUsageEvents.scope, "workspace"),
        gte(aiUsageEvents.createdAt, monthStartUtc(now))
      )
    );
  return Number(row?.total ?? 0);
}

export async function getR2CurrentMonthlyEstimate(now = new Date()) {
  const [fileStorage, wikiStorage] = await Promise.all([
    db
      .select({
        bytes: sql<number>`coalesce(sum(${files.sizeBytes}), 0)::float8`,
        fileCount: sql<number>`count(*)::int`,
      })
      .from(files)
      .where(eq(files.status, "ready"))
      .then((rows) => rows[0]),
    db
      .select({
        bytes: sql<number>`coalesce(sum(${wikiMedia.sizeBytes}), 0)::float8`,
        fileCount: sql<number>`count(*)::int`,
      })
      .from(wikiMedia)
      .where(and(eq(wikiMedia.status, "ready"), sql`${wikiMedia.r2Key} is not null`))
      .then((rows) => rows[0]),
  ]);

  const [ops] = await db
    .select({
      classA: sql<number>`coalesce(sum(case when ${aiUsageEvents.operation} = 'class_a' then ${aiUsageEvents.units} else 0 end), 0)::float8`,
      classB: sql<number>`coalesce(sum(case when ${aiUsageEvents.operation} = 'class_b' then ${aiUsageEvents.units} else 0 end), 0)::float8`,
    })
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.provider, "cloudflare_r2"),
        gte(aiUsageEvents.createdAt, monthStartUtc(now))
      )
    );

  const storageBytes =
    Number(fileStorage?.bytes ?? 0) + Number(wikiStorage?.bytes ?? 0);
  const storageGbMonth = bytesToGib(storageBytes);
  const classAOperations = Number(ops?.classA ?? 0);
  const classBOperations = Number(ops?.classB ?? 0);
  const estimate = estimateR2StandardMonthlyCost({
    storageGbMonth,
    classAOperations,
    classBOperations,
  });

  return {
    storageBytes,
    storageGbMonth,
    fileCount:
      Number(fileStorage?.fileCount ?? 0) + Number(wikiStorage?.fileCount ?? 0),
    classAOperations,
    classBOperations,
    ...estimate,
  };
}

export async function cloudflareMonthSpendUsd(now = new Date()): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${aiUsageEvents.costUsd}), 0)::float8`,
    })
    .from(aiUsageEvents)
    .where(
      and(
        inArray(aiUsageEvents.provider, [
          "cloudflare_workers_ai",
          "cloudflare_r2",
        ]),
        gte(aiUsageEvents.createdAt, monthStartUtc(now))
      )
    );
  const r2 = await getR2CurrentMonthlyEstimate(now);
  return Number(row?.total ?? 0) + r2.totalCostUsd;
}

function budgetStatus(input: {
  spentUsd: number;
  budgetUsd: number;
  enabled: boolean;
}) {
  const remainingUsd = Math.max(0, input.budgetUsd - input.spentUsd);
  return {
    ...input,
    remainingUsd,
    percentUsed:
      input.budgetUsd > 0
        ? Math.min(100, Math.round((input.spentUsd / input.budgetUsd) * 100))
        : 100,
    blocked:
      !input.enabled || input.budgetUsd <= 0 || input.spentUsd >= input.budgetUsd,
  };
}

export async function getWorkspaceAiBudgetStatus(now = new Date()) {
  const [settings, spentUsd] = await Promise.all([
    getAiUsageSettings(),
    workspaceAiMonthSpendUsd(now),
  ]);
  return budgetStatus({
    spentUsd,
    budgetUsd: settings.workspaceAiMonthlyBudgetUsd,
    enabled: settings.workspaceAiEnabled,
  });
}

export async function getCloudflareBudgetStatus(now = new Date()) {
  const [settings, spentUsd] = await Promise.all([
    getAiUsageSettings(),
    cloudflareMonthSpendUsd(now),
  ]);
  return budgetStatus({
    spentUsd,
    budgetUsd: settings.cloudflareMonthlyBudgetUsd,
    enabled: settings.cloudflareEnabled,
  });
}

export async function assertWorkspaceAiBudget(now = new Date()) {
  const status = await getWorkspaceAiBudgetStatus(now);
  if (status.blocked) {
    throw new AiBudgetExceededError(
      !status.enabled
        ? "Workspace AI usage is disabled."
        : isHostedInstance()
          ? CREDITS_USED_UP_MESSAGE
          : `Workspace AI budget reached (${status.spentUsd.toFixed(2)} / ${status.budgetUsd.toFixed(2)} USD).`
    );
  }
}

export async function assertCloudflareBudget(now = new Date()) {
  const status = await getCloudflareBudgetStatus(now);
  if (status.blocked) {
    throw new AiBudgetExceededError(
      status.enabled
        ? `Cloudflare usage budget reached (${status.spentUsd.toFixed(2)} / ${status.budgetUsd.toFixed(2)} USD).`
        : "Cloudflare AI usage is disabled."
    );
  }
}

export async function recordR2Operation(input: {
  classType: "A" | "B";
  operationName: string;
  units?: number;
  actorUserId?: string | null;
  userId?: string | null;
  projectId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await recordAiUsage({
    provider: "cloudflare_r2",
    scope: "workspace",
    feature: "files",
    operation: input.classType === "A" ? "class_a" : "class_b",
    actorUserId: input.actorUserId ?? null,
    userId: input.userId ?? null,
    projectId: input.projectId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    units: input.units ?? 1,
    unitName: "request",
    estimated: true,
    metadata: {
      operationName: input.operationName,
      ...(input.metadata ?? {}),
    },
  });
}
