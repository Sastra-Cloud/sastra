import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { assistantSettings, assistantUsage } from "@/lib/db/schema";
import {
  computeBudgetStatus,
  DEFAULT_MONTHLY_BUDGET_USD,
  monthStartUtc,
  type BudgetStatus,
} from "./budget-math";

/** Sum of this user's assistant spend since the start of the current UTC month. */
export async function monthSpendUsd(
  userId: string,
  now = new Date()
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${assistantUsage.costUsd}), 0)` })
    .from(assistantUsage)
    .where(
      and(
        eq(assistantUsage.userId, userId),
        gte(assistantUsage.createdAt, monthStartUtc(now))
      )
    );
  return Number(row?.total ?? 0);
}

export async function getBudget(
  userId: string
): Promise<{ monthlyBudgetUsd: number; enabled: boolean }> {
  const [row] = await db
    .select()
    .from(assistantSettings)
    .where(eq(assistantSettings.userId, userId))
    .limit(1);
  return {
    monthlyBudgetUsd: row?.monthlyBudgetUsd ?? DEFAULT_MONTHLY_BUDGET_USD,
    enabled: row?.enabled ?? true,
  };
}

export async function getBudgetStatus(
  userId: string,
  now = new Date()
): Promise<BudgetStatus> {
  const [budget, spent] = await Promise.all([
    getBudget(userId),
    monthSpendUsd(userId, now),
  ]);
  return computeBudgetStatus(spent, budget.monthlyBudgetUsd, budget.enabled);
}

/** Append a usage row from an OpenRouter response's usage (cost in USD). */
export async function recordUsage(input: {
  userId: string;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}): Promise<void> {
  await db.insert(assistantUsage).values({
    userId: input.userId,
    model: input.model,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    costUsd: input.costUsd,
  });
}
