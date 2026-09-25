import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { assistantTraceEvents, assistantTraceRuns } from "@/lib/db/schema";

export const ASSISTANT_PROMPT_VERSION = 4;

export function redactTraceText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[id]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .slice(0, 500);
}

export async function startAssistantTrace(
  userId: string,
  userMessageId?: string | null
): Promise<{ id: string; startedAt: number }> {
  const [run] = await db
    .insert(assistantTraceRuns)
    .values({
      userId,
      userMessageId: userMessageId ?? null,
      promptVersion: ASSISTANT_PROMPT_VERSION,
    })
    .returning({ id: assistantTraceRuns.id });
  return { id: run.id, startedAt: Date.now() };
}

export async function recordAssistantTraceEvent(input: {
  runId?: string;
  userId: string;
  eventType: string;
  name?: string | null;
  status: string;
  durationMs?: number;
  model?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!input.runId) return;
  await db.insert(assistantTraceEvents).values({
    runId: input.runId,
    userId: input.userId,
    eventType: input.eventType,
    name: input.name ?? null,
    status: input.status,
    durationMs: input.durationMs,
    model: input.model ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function recordAssistantModelCall(input: {
  runId?: string;
  userId: string;
  model: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  cachedTokens: number;
  provider: string | null;
  toolNames: string[];
}): Promise<void> {
  if (!input.runId) return;
  await Promise.all([
    db
      .update(assistantTraceRuns)
      .set({
        model: input.model,
        iterationCount: sql`${assistantTraceRuns.iterationCount} + 1`,
        promptTokens: sql`${assistantTraceRuns.promptTokens} + ${input.promptTokens}`,
        completionTokens: sql`${assistantTraceRuns.completionTokens} + ${input.completionTokens}`,
        costUsd: sql`${assistantTraceRuns.costUsd} + ${input.costUsd}`,
        toolNames: sql`${assistantTraceRuns.toolNames} || ${JSON.stringify(
          input.toolNames
        )}::jsonb`,
      })
      .where(eq(assistantTraceRuns.id, input.runId)),
    recordAssistantTraceEvent({
      runId: input.runId,
      userId: input.userId,
      eventType: "model_call",
      name: "assistant",
      status: "complete",
      durationMs: input.durationMs,
      model: input.model,
      metadata: {
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        costUsd: input.costUsd,
        cachedTokens: input.cachedTokens,
        provider: input.provider,
        toolNames: input.toolNames,
      },
    }),
  ]);
}

export async function finishAssistantTrace(input: {
  runId: string;
  startedAt: number;
  outcome: string;
  error?: unknown;
}): Promise<void> {
  await db
    .update(assistantTraceRuns)
    .set({
      outcome: input.outcome,
      latencyMs: Math.max(0, Date.now() - input.startedAt),
      error:
        input.error == null
          ? null
          : redactTraceText(
              input.error instanceof Error ? input.error.message : String(input.error)
            ),
      completedAt: new Date(),
    })
    .where(eq(assistantTraceRuns.id, input.runId));
}
