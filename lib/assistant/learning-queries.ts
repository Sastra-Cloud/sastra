import "server-only";

import { desc, gte, sql } from "drizzle-orm";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  assistantEvalCases,
  assistantLessons,
  assistantReflectionRuns,
  assistantTraceRuns,
} from "@/lib/db/schema";

export async function getAssistantLearningReport() {
  await requireRole("admin");
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [lessons, evalCases, runs, traceMetrics] = await Promise.all([
    db.select().from(assistantLessons).orderBy(desc(assistantLessons.createdAt)),
    db.select().from(assistantEvalCases).orderBy(desc(assistantEvalCases.createdAt)),
    db
      .select()
      .from(assistantReflectionRuns)
      .orderBy(desc(assistantReflectionRuns.createdAt))
      .limit(20),
    db
      .select({
        runs: sql<number>`count(*)::int`,
        errors: sql<number>`count(*) filter (where ${assistantTraceRuns.outcome} = 'error')::int`,
        avgLatencyMs: sql<number>`coalesce(avg(${assistantTraceRuns.latencyMs}), 0)::float8`,
        costUsd: sql<number>`coalesce(sum(${assistantTraceRuns.costUsd}), 0)::float8`,
      })
      .from(assistantTraceRuns)
      .where(gte(assistantTraceRuns.startedAt, since)),
  ]);
  return {
    lessons: lessons.map((row) => ({
      ...row,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    evalCases: evalCases.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    runs: runs.map((row) => ({
      ...row,
      windowStart: row.windowStart.toISOString(),
      windowEnd: row.windowEnd.toISOString(),
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    })),
    traceMetrics: {
      runs: Number(traceMetrics[0]?.runs ?? 0),
      errors: Number(traceMetrics[0]?.errors ?? 0),
      avgLatencyMs: Number(traceMetrics[0]?.avgLatencyMs ?? 0),
      costUsd: Number(traceMetrics[0]?.costUsd ?? 0),
    },
  };
}
