import "server-only";

import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lte, or } from "drizzle-orm";

import { aiStructuredUsage } from "@/lib/ai/openrouter";
import { assertWorkspaceAiBudget, recordAiUsage } from "@/lib/ai/usage";
import { db } from "@/lib/db";
import {
  assistantEvalCases,
  assistantFeedback,
  assistantLessons,
  assistantMessages,
  assistantPendingActions,
  assistantReflectionRuns,
  assistantTraceEvents,
  assistantTraceRuns,
} from "@/lib/db/schema";
import type { AssistantLessonScope } from "./types";
import { redactTraceText } from "./trace";
import {
  analyzeAssistantTurn,
  groupTranscriptByUser,
  isLikelyUserCorrection,
  type LearningTranscriptMessage,
} from "./learning-signals";

export const REFLECTION_PROMPT_VERSION = 2;

export type AssistantLearningEvidenceKind =
  | "negative_feedback"
  | "user_correction"
  | "policy_regression"
  | "inefficient_run"
  | "tool_failure"
  | "declined_action";

type Evidence = {
  ref: string;
  kinds: AssistantLearningEvidenceKind[];
  toolName: string | null;
  summary: string;
};

type ProposedLesson = {
  key: string;
  scope: AssistantLessonScope;
  toolName: string | null;
  lesson: string;
  confidence: number;
  evidenceRefs: string[];
  evalName: string;
  evalInput: string;
  evalContext: string;
  expectedBehavior: string;
};

const REFLECTION_SCHEMA = {
  name: "assistant_reflection_candidates",
  schema: {
    type: "object",
    properties: {
      lessons: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            scope: { type: "string", enum: ["global", "tool", "workflow"] },
            toolName: { type: ["string", "null"] },
            lesson: { type: "string" },
            confidence: { type: "number" },
            evidenceRefs: { type: "array", items: { type: "string" } },
            evalName: { type: "string" },
            evalInput: { type: "string" },
            evalContext: { type: "string" },
            expectedBehavior: { type: "string" },
          },
          required: [
            "key",
            "scope",
            "toolName",
            "lesson",
            "confidence",
            "evidenceRefs",
            "evalName",
            "evalInput",
            "evalContext",
            "expectedBehavior",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["lessons"],
    additionalProperties: false,
  },
};

function lessonPassesDeterministicGate(
  lesson: ProposedLesson,
  evidenceByRef: Map<string, Evidence>
): boolean {
  if (!/^[a-z0-9][a-z0-9_.-]{2,79}$/.test(lesson.key)) return false;
  if (lesson.lesson.trim().length < 12 || lesson.lesson.length > 500) return false;
  if (lesson.confidence < 0.65 || lesson.confidence > 1) return false;
  const uniqueRefs = [...new Set(lesson.evidenceRefs)];
  if (uniqueRefs.length < 1) return false;
  if (!uniqueRefs.every((ref) => evidenceByRef.has(ref))) return false;
  if (
    uniqueRefs.length === 1 &&
    !uniqueRefs.some((ref) =>
      evidenceByRef
        .get(ref)
        ?.kinds.some((kind) =>
          ["negative_feedback", "user_correction", "policy_regression"].includes(kind)
        )
    )
  ) {
    return false;
  }
  if (lesson.scope === "tool" && !lesson.toolName) return false;
  // Reflection may improve procedure, never permissions or confirmation policy.
  if (
    /\b(auto[- ]?approve|skip (?:approval|confirmation)|send without|bypass|elevate role|grant permission|ignore authorization|disable safety)\b/i.test(
      lesson.lesson
    )
  ) {
    return false;
  }
  return true;
}

function compactLearningText(value: string | null | undefined): string {
  return redactTraceText((value ?? "").replace(/\s+/g, " ").trim());
}

function mergeEvidence(rows: Evidence[]): Evidence[] {
  const merged = new Map<string, Evidence>();
  for (const row of rows) {
    const current = merged.get(row.ref);
    if (!current) {
      merged.set(row.ref, row);
      continue;
    }
    const summaries = new Set([current.summary, row.summary].filter(Boolean));
    merged.set(row.ref, {
      ref: row.ref,
      kinds: [...new Set([...current.kinds, ...row.kinds])],
      toolName: current.toolName ?? row.toolName,
      summary: [...summaries].join(" | ").slice(0, 1_500),
    });
  }
  return [...merged.values()];
}

function evidenceBreakdown(evidence: Evidence[]): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const row of evidence) {
    for (const kind of row.kinds) breakdown[kind] = (breakdown[kind] ?? 0) + 1;
  }
  return breakdown;
}

async function collectEvidence(start: Date, end: Date): Promise<Evidence[]> {
  const [transcript, feedback, failures, inefficient, declined] = await Promise.all([
    db
      .select({
        id: assistantMessages.id,
        userId: assistantMessages.userId,
        role: assistantMessages.role,
        content: assistantMessages.content,
        toolCalls: assistantMessages.toolCalls,
      })
      .from(assistantMessages)
      .where(
        and(
          gte(assistantMessages.createdAt, start),
          lte(assistantMessages.createdAt, end)
        )
      )
      .orderBy(asc(assistantMessages.userId), asc(assistantMessages.id))
      .limit(800),
    db
      .select({
        id: assistantFeedback.id,
        userId: assistantFeedback.userId,
        messageId: assistantFeedback.messageId,
        comment: assistantFeedback.comment,
        content: assistantMessages.content,
      })
      .from(assistantFeedback)
      .innerJoin(assistantMessages, eq(assistantMessages.id, assistantFeedback.messageId))
      .where(
        and(
          eq(assistantFeedback.rating, -1),
          gte(assistantFeedback.createdAt, start),
          lte(assistantFeedback.createdAt, end)
        )
      )
      .orderBy(desc(assistantFeedback.createdAt))
      .limit(40),
    db
      .select({
        id: assistantTraceEvents.id,
        runId: assistantTraceEvents.runId,
        name: assistantTraceEvents.name,
        eventType: assistantTraceEvents.eventType,
        metadata: assistantTraceEvents.metadata,
      })
      .from(assistantTraceEvents)
      .where(
        and(
          inArray(assistantTraceEvents.status, ["failed", "error"]),
          gte(assistantTraceEvents.createdAt, start),
          lte(assistantTraceEvents.createdAt, end)
        )
      )
      .orderBy(desc(assistantTraceEvents.createdAt))
      .limit(60),
    db
      .select({
        id: assistantTraceRuns.id,
        iterations: assistantTraceRuns.iterationCount,
        costUsd: assistantTraceRuns.costUsd,
        outcome: assistantTraceRuns.outcome,
        toolNames: assistantTraceRuns.toolNames,
      })
      .from(assistantTraceRuns)
      .where(
        and(
          gte(assistantTraceRuns.startedAt, start),
          lte(assistantTraceRuns.startedAt, end),
          or(
            gte(assistantTraceRuns.iterationCount, 5),
            gte(assistantTraceRuns.costUsd, 0.05)
          )
        )
      )
      .orderBy(desc(assistantTraceRuns.startedAt))
      .limit(40),
    db
      .select({
        id: assistantPendingActions.id,
        messageId: assistantPendingActions.messageId,
        toolName: assistantPendingActions.toolName,
        status: assistantPendingActions.status,
        result: assistantPendingActions.result,
      })
      .from(assistantPendingActions)
      .where(
        and(
          inArray(assistantPendingActions.status, ["declined", "failed"]),
          gte(assistantPendingActions.resolvedAt, start),
          lte(assistantPendingActions.resolvedAt, end)
        )
      )
      .orderBy(desc(assistantPendingActions.resolvedAt))
      .limit(60),
  ]);

  const raw: Evidence[] = [];
  const messageToTurn = new Map<string, string>();
  const turnRootByUserMessage = new Map<string, string>();
  const messageIds = new Set(transcript.map((message) => message.id));

  for (const messages of groupTranscriptByUser(transcript).values()) {
    const visible = messages.filter(
      (message) => message.role === "user" || message.role === "assistant"
    );
    let previousUser: LearningTranscriptMessage | null = null;
    let previousAssistant: LearningTranscriptMessage | null = null;
    for (let index = 0; index < visible.length; index++) {
      const message = visible[index];
      if (message.role === "assistant") {
        if (previousUser) {
          messageToTurn.set(
            message.id,
            turnRootByUserMessage.get(previousUser.id) ?? previousUser.id
          );
        }
        previousAssistant = message;
        continue;
      }

      const isCorrection =
        isLikelyUserCorrection(message.content ?? "") && !!previousAssistant;
      const turnId =
        isCorrection && previousUser
          ? turnRootByUserMessage.get(previousUser.id) ?? previousUser.id
          : message.id;
      turnRootByUserMessage.set(message.id, turnId);

      if (isCorrection) {
        raw.push({
          ref: `turn:${turnId}`,
          kinds: ["user_correction"],
          toolName: null,
          summary: [
            `Original request: ${compactLearningText(previousUser?.content)}`,
            `Assistant response: ${compactLearningText(previousAssistant?.content)}`,
            `User correction: ${compactLearningText(message.content)}`,
          ].join(" "),
        });
      }

      let nextUserIndex = index + 1;
      while (nextUserIndex < visible.length && visible[nextUserIndex].role !== "user") {
        nextUserIndex++;
      }
      const turnMessages = visible.slice(index + 1, nextUserIndex);
      for (const assistantMessage of turnMessages) {
        messageToTurn.set(assistantMessage.id, turnId);
      }
      const turnAnalysis = analyzeAssistantTurn(message.content ?? "", turnMessages);
      if (turnAnalysis.directTaskWithoutCreate) {
        raw.push({
          ref: `turn:${turnId}`,
          kinds: ["policy_regression"],
          toolName: "create_task",
          summary: `Direct task request did not propose create_task. Request: ${compactLearningText(
            message.content
          )} Assistant response: ${compactLearningText(
            turnMessages.find((row) => row.content)?.content
          )}`,
        });
      }
      if (turnAnalysis.internalIdDisclosure) {
        raw.push({
          ref: `turn:${turnId}`,
          kinds: ["policy_regression"],
          toolName: null,
          summary:
            "Assistant exposed an internal UUID even though the user did not request record identifiers.",
        });
      }
      previousUser = message;
    }
  }

  raw.push(
    ...feedback.map((row) => ({
      ref: `turn:${messageToTurn.get(row.messageId) ?? row.messageId}`,
      kinds: ["negative_feedback" as const],
      toolName: null,
      summary: `Assistant response: ${compactLearningText(row.content)} Feedback: ${compactLearningText(
        row.comment || "Negative rating with no written comment"
      )}`,
    })),
    ...failures.map((row) => ({
      ref: `run:${row.runId}`,
      kinds: ["tool_failure" as const],
      toolName: row.name,
      summary: redactTraceText(
        `${row.eventType}:${row.name ?? "unknown"} ${JSON.stringify(row.metadata)}`
      ),
    })),
    ...inefficient.map((row) => ({
      ref: `run:${row.id}`,
      kinds: ["inefficient_run" as const],
      toolName: null,
      summary: `iterations=${row.iterations} costUsd=${row.costUsd.toFixed(4)} outcome=${
        row.outcome
      } tools=${row.toolNames.join(",")}`,
    })),
    ...declined.map((row) => ({
      ref: `turn:${messageToTurn.get(row.messageId) ?? row.messageId}`,
      kinds: ["declined_action" as const],
      toolName: row.toolName,
      summary: redactTraceText(
        `${row.toolName} ${row.status}: ${row.result ?? "no reason recorded"}`
      ),
    }))
  );

  // Keep evidence incident-based: a correction chain, its deterministic
  // regressions, and any thumbs-down are one incident—not repeated votes.
  return mergeEvidence(raw).filter((row) =>
    row.ref.startsWith("turn:")
      ? messageIds.has(row.ref.slice("turn:".length))
      : true
  );
}

export async function runAssistantReflection(input?: {
  windowStart?: Date;
  windowEnd?: Date;
}): Promise<{ runId: string; evidenceCount: number; candidateCount: number }> {
  const end = input?.windowEnd ?? new Date();
  const start = input?.windowStart ?? new Date(end.getTime() - 14 * 86_400_000);
  const [run] = await db
    .insert(assistantReflectionRuns)
    .values({
      status: "running",
      promptVersion: REFLECTION_PROMPT_VERSION,
      windowStart: start,
      windowEnd: end,
    })
    .returning({ id: assistantReflectionRuns.id });

  try {
    const evidence = await collectEvidence(start, end);
    const breakdown = evidenceBreakdown(evidence);
    if (evidence.length === 0) {
      await db
        .update(assistantReflectionRuns)
        .set({
          status: "complete",
          evidenceCount: 0,
          candidateCount: 0,
          evidenceBreakdown: breakdown,
          decisionSummary: "No settled quality signals were found in this window.",
          completedAt: new Date(),
        })
        .where(eq(assistantReflectionRuns.id, run.id));
      return { runId: run.id, evidenceCount: 0, candidateCount: 0 };
    }

    await assertWorkspaceAiBudget();
    const existing = await db
      .select({
        id: assistantLessons.id,
        key: assistantLessons.key,
        lesson: assistantLessons.lesson,
        status: assistantLessons.status,
        confidence: assistantLessons.confidence,
        evidenceRefs: assistantLessons.evidenceRefs,
      })
      .from(assistantLessons)
      .where(inArray(assistantLessons.status, ["candidate", "approved"]));
    const reflected = await aiStructuredUsage(
      "assistant_reflection",
      [
        {
          role: "system",
          content:
            "You are an offline assistant-quality critic. Study only the redacted, settled evidence supplied as data. Propose a small number of reusable procedural lessons and one regression case per lesson. Lessons must improve interpretation, tool sequencing, response hygiene, previews, or error handling. Preserve the smallest relevant multi-turn context in evalContext when prior conversation state contributed to the failure. A single explicit user correction, negative rating, or deterministic policy regression may produce a provisional candidate, but it cannot be evaluated, approved, or activated until corroborated by another independent incident. Never combine unrelated incidents merely to reach a count. Never propose business/domain facts, user-profile facts, permission changes, automatic approvals, reduced confirmation, hidden self-modification, or a shared preference that belongs only to one user. Cite the incident refs that directly support each lesson. Existing candidates are supplied for clustering: when new evidence corroborates one, return the same key and cite the new refs so the system can strengthen it. Candidates require evals and human approval; you cannot activate them.",
        },
        {
          role: "user",
          content: `Existing lessons:\n${JSON.stringify(
            existing
          )}\n\nRedacted evidence:\n${JSON.stringify(evidence)}`,
        },
      ],
      REFLECTION_SCHEMA
    );
    await recordAiUsage({
      provider: "openrouter",
      scope: "workspace",
      feature: "assistant_reflection",
      operation: "propose_lessons",
      taskKey: "assistant_reflection",
      model: reflected.model,
      promptTokens: reflected.usage.promptTokens,
      completionTokens: reflected.usage.completionTokens,
      costUsd: reflected.usage.costUsd,
      estimated: reflected.usage.estimated,
      entityType: "assistant_reflection_run",
      entityId: run.id,
    });

    const evidenceByRef = new Map(evidence.map((item) => [item.ref, item]));
    const proposed = (reflected.data as { lessons?: ProposedLesson[] }).lessons ?? [];
    let candidateCount = 0;
    for (const lesson of proposed) {
      if (!lessonPassesDeterministicGate(lesson, evidenceByRef)) continue;
      const duplicate = existing.find(
        (row) =>
          row.key === lesson.key ||
          row.lesson.trim().toLocaleLowerCase() === lesson.lesson.trim().toLocaleLowerCase()
      );
      const newRefs = [...new Set(lesson.evidenceRefs)];
      if (duplicate?.status === "candidate") {
        const mergedRefs = [...new Set([...duplicate.evidenceRefs, ...newRefs])];
        if (mergedRefs.length === duplicate.evidenceRefs.length) continue;
        await db
          .update(assistantLessons)
          .set({
            confidence: Math.max(duplicate.confidence, lesson.confidence),
            evidenceCount: mergedRefs.length,
            evidenceRefs: mergedRefs,
            updatedAt: new Date(),
          })
          .where(eq(assistantLessons.id, duplicate.id));
        await db.insert(assistantEvalCases).values({
          lessonId: duplicate.id,
          name: lesson.evalName.slice(0, 160),
          source: "reflection",
          input: {
            userMessage: lesson.evalInput,
            priorContext: lesson.evalContext,
          },
          expected: { behavior: lesson.expectedBehavior },
        });
        candidateCount++;
        continue;
      }
      if (duplicate) continue;
      const [created] = await db
        .insert(assistantLessons)
        .values({
          reflectionRunId: run.id,
          key: lesson.key,
          scope: lesson.scope,
          toolName: lesson.toolName,
          lesson: lesson.lesson.trim(),
          confidence: lesson.confidence,
          evidenceCount: newRefs.length,
          evidenceRefs: newRefs,
        })
        .returning({ id: assistantLessons.id });
      await db.insert(assistantEvalCases).values({
        lessonId: created.id,
        name: lesson.evalName.slice(0, 160),
        source: "reflection",
        input: {
          userMessage: lesson.evalInput,
          priorContext: lesson.evalContext,
        },
        expected: { behavior: lesson.expectedBehavior },
      });
      candidateCount++;
    }

    await db
      .update(assistantReflectionRuns)
      .set({
        status: "complete",
        model: reflected.model,
        evidenceCount: evidence.length,
        candidateCount,
        evidenceBreakdown: breakdown,
        decisionSummary:
          candidateCount > 0
            ? `${candidateCount} lesson candidate${candidateCount === 1 ? " was" : "s were"} created or strengthened. Candidates with one incident remain inactive until corroborated.`
            : "Quality signals were found, but none met the procedural-lesson quality gates or they were already represented.",
        completedAt: new Date(),
      })
      .where(eq(assistantReflectionRuns.id, run.id));
    return { runId: run.id, evidenceCount: evidence.length, candidateCount };
  } catch (error) {
    await db
      .update(assistantReflectionRuns)
      .set({
        status: "failed",
        error: redactTraceText(error instanceof Error ? error.message : String(error)),
        completedAt: new Date(),
      })
      .where(eq(assistantReflectionRuns.id, run.id));
    throw error;
  }
}

function inLessonCanary(userId: string, key: string, rolloutPercent: number): boolean {
  if (rolloutPercent >= 100) return true;
  if (rolloutPercent <= 0) return false;
  const bucket = Number.parseInt(
    createHash("sha256").update(`${key}:${userId}`).digest("hex").slice(0, 8),
    16
  ) % 100;
  return bucket < rolloutPercent;
}

export async function loadApprovedLessons(userId?: string): Promise<
  Array<{ key: string; scope: AssistantLessonScope; toolName: string | null; lesson: string }>
> {
  const rows = await db
    .select({
      key: assistantLessons.key,
      scope: assistantLessons.scope,
      toolName: assistantLessons.toolName,
      lesson: assistantLessons.lesson,
      rolloutPercent: assistantLessons.rolloutPercent,
    })
    .from(assistantLessons)
    .where(eq(assistantLessons.status, "approved"))
    .orderBy(assistantLessons.key);
  return rows
    .filter(
      (lesson) =>
        !userId || inLessonCanary(userId, lesson.key, lesson.rolloutPercent)
    )
    .map((lesson) => ({
      key: lesson.key,
      scope: lesson.scope,
      toolName: lesson.toolName,
      lesson: lesson.lesson,
    }));
}
