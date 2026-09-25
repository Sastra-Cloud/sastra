"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireRole, requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  assistantFeedback,
  assistantMessages,
  assistantPendingActions,
  assistantSettings,
} from "@/lib/db/schema";
import { getProjectBySlug } from "@/lib/projects/queries";
import { listPrintRuns } from "@/lib/print/queries";
import {
  approveAllPending,
  approvePendingAction,
  declinePendingAction,
  runAssistantTurn,
  updatePendingAction,
  type AgentContext,
  type TurnOutcome,
} from "./agent";
import { getBudgetStatus } from "./budget";
import { clearConversationSummary } from "./context";
import type { BudgetStatus } from "./budget-math";
import {
  getPendingActions,
  getThread,
  type AssistantThreadMessage,
  type PendingActionView,
} from "./queries";
import type { Role } from "./tools";
import { finishAssistantTrace, startAssistantTrace } from "./trace";
import {
  clearMemoryFacts,
  setMemoryFactStatus,
  updateMemoryFact,
} from "./memory";

type ActionOpts = { projectSlug?: string; runScope?: string | null };

type PrintRun = Awaited<ReturnType<typeof listPrintRuns>>[number];

function runLabel(run: PrintRun): string {
  return run.kind === "reprint"
    ? `Reprint ${run.printNumber ?? ""}`.trim()
    : run.title || "the main project";
}

/**
 * Resolve which Tasks-board scope the user is viewing, mirroring the tasks
 * page: an explicit `?run=<id>` selects that run, `?run=all` is the whole
 * project, and no param defaults to the active reprint (else the whole project).
 */
function resolveTaskScope(
  runs: PrintRun[],
  runScope?: string | null
): { runId: string | null; label: string } {
  if (runScope && runScope !== "all") {
    const found = runs.find((run) => run.id === runScope);
    if (found) return { runId: found.id, label: runLabel(found) };
  }
  if (runScope === "all") return { runId: null, label: "the whole project" };
  const active = runs.find(
    (run) =>
      run.kind === "reprint" &&
      run.status !== "completed" &&
      run.status !== "cancelled"
  );
  return active
    ? { runId: active.id, label: runLabel(active) }
    : { runId: null, label: "the whole project" };
}

/** Build the turn context, resolving the current project (floating assistant). */
async function context(
  projectSlug?: string,
  runScope?: string | null
): Promise<AgentContext> {
  const { user } = await requireUser();
  const ctx: AgentContext = {
    userId: user.id,
    role: (user.role as Role) ?? "member",
    userName: user.name,
    timezone: user.timezone ?? "UTC",
  };
  if (projectSlug) {
    const data = await getProjectBySlug(projectSlug);
    if (data) {
      ctx.currentProjectId = data.project.id;
      ctx.currentProjectTitle = data.project.title;
      ctx.currentProjectSlug = data.project.slug;
      // Match the Tasks-board scope the user is viewing, so new tasks land where
      // they're looking instead of on a scope they can't see.
      const runs = await listPrintRuns(data.project.id);
      if (runs.length > 0) {
        ctx.currentTaskScope = resolveTaskScope(runs, runScope);
      }
    }
  }
  return ctx;
}

export async function sendAssistantMessage(
  text: string,
  opts?: ActionOpts
): Promise<TurnOutcome> {
  const clean = text.trim();
  if (!clean) return "complete";
  const ctx = await context(opts?.projectSlug, opts?.runScope);
  const outcome = await runAssistantTurn(ctx, clean.slice(0, 4000));
  revalidatePath("/assistant");
  return outcome;
}

export async function approveAssistantAction(
  actionId: string,
  opts?: ActionOpts
): Promise<{ status: string; result: string | null }> {
  const ctx = await context(opts?.projectSlug, opts?.runScope);
  actionId = z.string().uuid().parse(actionId);
  const trace = await startAssistantTrace(ctx.userId);
  try {
    await approvePendingAction({ ...ctx, traceRunId: trace.id }, actionId);
    await finishAssistantTrace({
      runId: trace.id,
      startedAt: trace.startedAt,
      outcome: "approval_complete",
    });
  } catch (error) {
    await finishAssistantTrace({
      runId: trace.id,
      startedAt: trace.startedAt,
      outcome: "error",
      error,
    }).catch(() => undefined);
    throw error;
  }
  revalidatePath("/assistant");
  const [resolved] = await db
    .select({
      status: assistantPendingActions.status,
      result: assistantPendingActions.result,
    })
    .from(assistantPendingActions)
    .where(
      and(
        eq(assistantPendingActions.id, actionId),
        eq(assistantPendingActions.userId, ctx.userId)
      )
    )
    .limit(1);
  return resolved ?? { status: "failed", result: "Action result not found." };
}

export async function declineAssistantAction(actionId: string): Promise<void> {
  const ctx = await context();
  actionId = z.string().uuid().parse(actionId);
  const trace = await startAssistantTrace(ctx.userId);
  await declinePendingAction({ ...ctx, traceRunId: trace.id }, actionId);
  await finishAssistantTrace({
    runId: trace.id,
    startedAt: trace.startedAt,
    outcome: "declined",
  });
  revalidatePath("/assistant");
}

export async function updateAssistantAction(
  actionId: string,
  patch: Record<string, string>,
  opts?: ActionOpts
): Promise<void> {
  const ctx = await context(opts?.projectSlug, opts?.runScope);
  actionId = z.string().uuid().parse(actionId);
  await updatePendingAction(ctx, actionId, patch);
  revalidatePath("/assistant");
}

export async function approveAllAssistantActions(
  messageId: string,
  opts?: ActionOpts
): Promise<void> {
  const ctx = await context(opts?.projectSlug, opts?.runScope);
  const trace = await startAssistantTrace(ctx.userId);
  try {
    await approveAllPending(
      { ...ctx, traceRunId: trace.id },
      z.string().uuid().parse(messageId)
    );
    await finishAssistantTrace({
      runId: trace.id,
      startedAt: trace.startedAt,
      outcome: "bulk_approval_complete",
    });
  } catch (error) {
    await finishAssistantTrace({
      runId: trace.id,
      startedAt: trace.startedAt,
      outcome: "error",
      error,
    }).catch(() => undefined);
    throw error;
  }
  revalidatePath("/assistant");
}

export type AssistantSnapshot = {
  messages: AssistantThreadMessage[];
  pending: PendingActionView[];
  budget: BudgetStatus;
  contextProject: {
    id: string;
    title: string;
    slug: string;
  } | null;
};

/** Read the current thread/pending/budget — used by the floating panel on demand. */
export async function getAssistantSnapshot(
  projectSlug?: string
): Promise<AssistantSnapshot> {
  const { user } = await requireUser();
  const [messages, pending, budget, projectData] = await Promise.all([
    getThread(user.id),
    getPendingActions(user.id),
    getBudgetStatus(user.id),
    projectSlug ? getProjectBySlug(projectSlug) : Promise.resolve(null),
  ]);
  return {
    messages,
    pending,
    budget,
    contextProject: projectData
      ? {
          id: projectData.project.id,
          title: projectData.project.title,
          slug: projectData.project.slug,
        }
      : null,
  };
}

export async function clearAssistantThread(): Promise<void> {
  const { user } = await requireUser();
  // Pending actions cascade-delete with their messages.
  await clearConversationSummary(user.id);
  await db.delete(assistantMessages).where(eq(assistantMessages.userId, user.id));
  revalidatePath("/assistant");
}

const messageIdSchema = z.string().uuid();
const feedbackSchema = z.object({
  messageId: messageIdSchema,
  rating: z.union([z.literal(1), z.literal(-1)]),
  comment: z.string().trim().max(1000).nullable().optional(),
});

export async function rateAssistantMessage(
  messageId: string,
  rating: 1 | -1,
  comment?: string | null
): Promise<void> {
  const { user } = await requireUser();
  const data = feedbackSchema.parse({ messageId, rating, comment });
  const [message] = await db
    .select({ id: assistantMessages.id })
    .from(assistantMessages)
    .where(
      and(
        eq(assistantMessages.id, data.messageId),
        eq(assistantMessages.userId, user.id),
        eq(assistantMessages.role, "assistant")
      )
    )
    .limit(1);
  if (!message) throw new Error("Assistant message not found.");
  const now = new Date();
  await db
    .insert(assistantFeedback)
    .values({
      userId: user.id,
      messageId: data.messageId,
      rating: data.rating,
      comment: data.comment || null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [assistantFeedback.userId, assistantFeedback.messageId],
      set: { rating: data.rating, comment: data.comment || null, updatedAt: now },
    });
  revalidatePath("/assistant");
}

const memoryCategorySchema = z.enum(["preference", "profile", "working_style"]);

export async function reviewAssistantMemoryFact(
  factId: string,
  status: "active" | "rejected" | "archived"
): Promise<void> {
  const { user } = await requireUser();
  await setMemoryFactStatus(
    user.id,
    z.string().uuid().parse(factId),
    z.enum(["active", "rejected", "archived"]).parse(status)
  );
  revalidatePath("/assistant");
}

export async function editAssistantMemoryFact(
  factId: string,
  content: string,
  category: "preference" | "profile" | "working_style"
): Promise<void> {
  const { user } = await requireUser();
  await updateMemoryFact(
    user.id,
    z.string().uuid().parse(factId),
    z.string().trim().min(1).max(500).parse(content),
    memoryCategorySchema.parse(category)
  );
  revalidatePath("/assistant");
}

export async function setAssistantMemoryEnabled(enabled: boolean): Promise<void> {
  const { user } = await requireUser();
  const now = new Date();
  await db
    .insert(assistantSettings)
    .values({ userId: user.id, memoryEnabled: z.boolean().parse(enabled), updatedAt: now })
    .onConflictDoUpdate({
      target: assistantSettings.userId,
      set: { memoryEnabled: enabled, updatedAt: now },
    });
  revalidatePath("/assistant");
}

export async function clearAssistantMemory(): Promise<void> {
  const { user } = await requireUser();
  await clearMemoryFacts(user.id);
  revalidatePath("/assistant");
}

// ── admin: per-user budget controls ───────────────────────────────────────────
const budgetSchema = z.coerce.number().min(0).max(1000);

export async function setAssistantBudget(userId: string, usd: number) {
  await requireRole("admin");
  const amount = budgetSchema.parse(usd);
  const now = new Date();
  await db
    .insert(assistantSettings)
    .values({ userId, monthlyBudgetUsd: amount, updatedAt: now })
    .onConflictDoUpdate({
      target: assistantSettings.userId,
      set: { monthlyBudgetUsd: amount, updatedAt: now },
    });
  revalidatePath("/settings/team");
}

export async function setAssistantEnabled(userId: string, enabled: boolean) {
  await requireRole("admin");
  const now = new Date();
  await db
    .insert(assistantSettings)
    .values({ userId, enabled, updatedAt: now })
    .onConflictDoUpdate({
      target: assistantSettings.userId,
      set: { enabled, updatedAt: now },
    });
  revalidatePath("/settings/team");
}
