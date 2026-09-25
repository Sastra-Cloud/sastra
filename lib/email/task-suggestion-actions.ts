"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { logActivity } from "@/lib/activity/log";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  emailPreferences,
  emailTaskFeedback,
  emailTaskRules,
  emailTaskSuggestions,
  notifications,
  projects,
  tasks,
  user,
} from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";
import {
  notifyAssignment,
  revalidateForTask,
} from "@/lib/tasks/create";
import { emailTaskSnapshot } from "./task-suggestions";
import {
  snapshotChanged,
  type EmailTaskPriority,
  type EmailTaskSnapshot,
} from "./task-signal-policy";

const suggestionInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4_000).nullable(),
  dueDate: z.union([z.string().date(), z.literal(""), z.null()]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  projectId: z.string().uuid().nullable(),
  assignedTo: z.string().min(1),
});

function finalSnapshot(
  original: EmailTaskSnapshot,
  input: z.infer<typeof suggestionInputSchema>
): EmailTaskSnapshot {
  return {
    ...original,
    title: input.title,
    description: input.description || null,
    dueDate: input.dueDate || null,
    priority: input.priority,
    projectId: input.projectId,
    assignedTo: input.assignedTo,
  };
}

async function resolveSuggestionNotifications(suggestionId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        isNull(notifications.readAt),
        sql`(${notifications.data} ->> 'suggestionId') = ${suggestionId}`
      )
    );
}

export type AcceptedEmailTask = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: EmailTaskPriority;
  projectId: string | null;
  assignedTo: string;
};

/** Create the reviewed task; a conditional status claim prevents duplicates. */
export async function acceptEmailTaskSuggestion(
  suggestionId: string,
  input: z.infer<typeof suggestionInputSchema>
): Promise<{ error?: string; task?: AcceptedEmailTask }> {
  const { user: actor } = await requireUser();
  const parsed = suggestionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid task." };
  }

  const [suggestion] = await db
    .select()
    .from(emailTaskSuggestions)
    .where(eq(emailTaskSuggestions.id, suggestionId))
    .limit(1);
  if (!suggestion || suggestion.status !== "pending") {
    return { error: "This suggestion is no longer available." };
  }
  const manages = canManage(actor);
  if (!manages && suggestion.forwarderUserId !== actor.id) {
    return { error: "You cannot review this suggestion." };
  }

  let values = parsed.data;
  if (!manages) values = { ...values, assignedTo: actor.id };
  const [assignee] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, values.assignedTo), eq(user.isActive, true)))
    .limit(1);
  if (!assignee) return { error: "Choose an active assignee." };
  if (values.projectId) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, values.projectId))
      .limit(1);
    if (!project) return { error: "Choose an available project." };
  }

  const original = emailTaskSnapshot(suggestion);
  const final = finalSnapshot(original, values);
  const created = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(emailTaskSuggestions)
      .set({ status: "created", updatedAt: new Date() })
      .where(
        and(
          eq(emailTaskSuggestions.id, suggestionId),
          eq(emailTaskSuggestions.status, "pending")
        )
      )
      .returning({ id: emailTaskSuggestions.id });
    if (!claimed) return null;

    const [task] = await tx
      .insert(tasks)
      .values({
        projectId: final.projectId,
        title: final.title,
        description: final.description,
        assignedTo: final.assignedTo,
        dueDate: final.dueDate,
        dueDateIsManual: true,
        priority: final.priority,
        status: "todo",
        createdBy: actor.id,
      })
      .returning({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        dueDate: tasks.dueDate,
        priority: tasks.priority,
        projectId: tasks.projectId,
        assignedTo: tasks.assignedTo,
      });
    await tx
      .update(emailTaskSuggestions)
      .set({ createdTaskId: task.id, updatedAt: new Date() })
      .where(eq(emailTaskSuggestions.id, suggestionId));
    await tx.insert(emailTaskFeedback).values({
      suggestionId,
      userId: actor.id,
      signal: snapshotChanged(original, final) ? "edited" : "accepted",
      originalSnapshot: original,
      finalSnapshot: final,
    });
    return task;
  });
  if (!created) return { error: "This suggestion was already handled." };
  if (!created.assignedTo) return { error: "The task has no assignee." };
  const createdAssignee = created.assignedTo;

  await resolveSuggestionNotifications(suggestionId);
  await notifyAssignment(created.id, createdAssignee, actor.id);
  if (created.projectId) {
    await logActivity({
      actorId: actor.id,
      projectId: created.projectId,
      entityType: "task",
      entityId: created.id,
      action: "create",
      summary: `Created task from email "${created.title}"`,
    });
  }
  await revalidateForTask(created.projectId);
  revalidatePath(`/correspondence/${suggestion.threadId}`);
  revalidatePath("/notifications");
  return {
    task: {
      ...created,
      assignedTo: createdAssignee,
      priority: created.priority as EmailTaskPriority,
    },
  };
}

export async function dismissEmailTaskSuggestion(
  suggestionId: string,
  reason?: string
): Promise<{ error?: string }> {
  const { user: actor } = await requireUser();
  const [suggestion] = await db
    .select()
    .from(emailTaskSuggestions)
    .where(eq(emailTaskSuggestions.id, suggestionId))
    .limit(1);
  if (!suggestion || suggestion.status !== "pending") {
    return { error: "This suggestion is no longer available." };
  }
  if (!canManage(actor) && suggestion.forwarderUserId !== actor.id) {
    return { error: "You cannot review this suggestion." };
  }
  const [dismissed] = await db
    .update(emailTaskSuggestions)
    .set({ status: "dismissed", updatedAt: new Date() })
    .where(
      and(
        eq(emailTaskSuggestions.id, suggestionId),
        eq(emailTaskSuggestions.status, "pending")
      )
    )
    .returning({ id: emailTaskSuggestions.id });
  if (!dismissed) return { error: "This suggestion was already handled." };
  await db.insert(emailTaskFeedback).values({
    suggestionId,
    userId: actor.id,
    signal: "dismissed",
    originalSnapshot: emailTaskSnapshot(suggestion),
    reason: reason?.trim().slice(0, 500) || null,
  });
  await resolveSuggestionNotifications(suggestionId);
  revalidatePath("/tasks");
  revalidatePath(`/correspondence/${suggestion.threadId}`);
  revalidatePath("/notifications");
  return {};
}

/**
 * Settle a real task request that was completed before the email was captured.
 * This intentionally creates no task and records neutral evidence, so it does
 * not train the dismissal/suppression rules to treat similar requests as noise.
 */
export async function markEmailTaskSuggestionAlreadyDone(
  suggestionId: string
): Promise<{ error?: string }> {
  const { user: actor } = await requireUser();
  const [suggestion] = await db
    .select()
    .from(emailTaskSuggestions)
    .where(eq(emailTaskSuggestions.id, suggestionId))
    .limit(1);
  if (!suggestion || suggestion.status !== "pending") {
    return { error: "This suggestion is no longer available." };
  }
  if (!canManage(actor) && suggestion.forwarderUserId !== actor.id) {
    return { error: "You cannot review this suggestion." };
  }

  const settled = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(emailTaskSuggestions)
      .set({ status: "dismissed", updatedAt: new Date() })
      .where(
        and(
          eq(emailTaskSuggestions.id, suggestionId),
          eq(emailTaskSuggestions.status, "pending")
        )
      )
      .returning({ id: emailTaskSuggestions.id });
    if (!claimed) return false;
    await tx.insert(emailTaskFeedback).values({
      suggestionId,
      userId: actor.id,
      signal: "already_done",
      originalSnapshot: emailTaskSnapshot(suggestion),
    });
    return true;
  });
  if (!settled) return { error: "This suggestion was already handled." };

  await resolveSuggestionNotifications(suggestionId);
  revalidatePath("/tasks");
  revalidatePath(`/correspondence/${suggestion.threadId}`);
  revalidatePath("/notifications");
  return {};
}

/** Reverse a newly auto-created task and preserve the correction as evidence. */
export async function undoAutoCreatedEmailTask(
  suggestionId: string
): Promise<{ error?: string }> {
  const { user: actor } = await requireUser();
  const [suggestion] = await db
    .select()
    .from(emailTaskSuggestions)
    .where(eq(emailTaskSuggestions.id, suggestionId))
    .limit(1);
  if (
    !suggestion ||
    suggestion.mode !== "explicit_auto" ||
    suggestion.status !== "created" ||
    !suggestion.createdTaskId
  ) {
    return { error: "This automatic task can no longer be undone." };
  }
  if (!canManage(actor) && suggestion.forwarderUserId !== actor.id) {
    return { error: "You cannot undo this task." };
  }
  await db.transaction(async (tx) => {
    await tx.delete(tasks).where(eq(tasks.id, suggestion.createdTaskId!));
    await tx
      .update(emailTaskSuggestions)
      .set({ status: "dismissed", createdTaskId: null, updatedAt: new Date() })
      .where(eq(emailTaskSuggestions.id, suggestionId));
    await tx.insert(emailTaskFeedback).values({
      suggestionId,
      userId: actor.id,
      signal: "undone",
      originalSnapshot: emailTaskSnapshot(suggestion),
    });
  });
  await resolveSuggestionNotifications(suggestionId);
  await revalidateForTask(suggestion.projectId);
  return {};
}

export async function approveEmailTaskRule(ruleId: string) {
  const session = await requireUser();
  const [rule] = await db
    .select()
    .from(emailTaskRules)
    .where(eq(emailTaskRules.id, z.string().uuid().parse(ruleId)))
    .limit(1);
  if (!rule || rule.status !== "candidate") throw new Error("Rule not found.");
  if (rule.scope === "workspace") await requireRole("admin");
  else if (rule.userId !== session.user.id) throw new Error("Not allowed.");
  await db
    .update(emailTaskRules)
    .set({
      status: "approved",
      approvedBy: session.user.id,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emailTaskRules.id, rule.id));
  revalidatePath("/tasks");
  revalidatePath("/settings/ai");
}

export async function retireEmailTaskRule(ruleId: string) {
  const session = await requireUser();
  const [rule] = await db
    .select()
    .from(emailTaskRules)
    .where(eq(emailTaskRules.id, z.string().uuid().parse(ruleId)))
    .limit(1);
  if (!rule || rule.status !== "approved") throw new Error("Rule not found.");
  if (rule.scope === "workspace") await requireRole("admin");
  else if (rule.userId !== session.user.id) throw new Error("Not allowed.");
  await db
    .update(emailTaskRules)
    .set({ status: "retired", updatedAt: new Date() })
    .where(eq(emailTaskRules.id, rule.id));
  revalidatePath("/tasks");
  revalidatePath("/settings/ai");
}

export async function rejectEmailTaskRule(ruleId: string) {
  const session = await requireUser();
  const [rule] = await db
    .select()
    .from(emailTaskRules)
    .where(eq(emailTaskRules.id, z.string().uuid().parse(ruleId)))
    .limit(1);
  if (!rule || rule.status !== "candidate") throw new Error("Rule not found.");
  if (rule.scope === "workspace") await requireRole("admin");
  else if (rule.userId !== session.user.id) throw new Error("Not allowed.");
  await db
    .update(emailTaskRules)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(emailTaskRules.id, rule.id));
  revalidatePath("/tasks");
  revalidatePath("/settings/ai");
}

export async function updateEmailTaskPreferences(input: {
  suggestionsEnabled: boolean;
  learningEnabled: boolean;
}) {
  const { user: actor } = await requireUser();
  const values = z
    .object({ suggestionsEnabled: z.boolean(), learningEnabled: z.boolean() })
    .parse(input);
  await db
    .insert(emailPreferences)
    .values({
      userId: actor.id,
      unsubscribeToken: generateToken(),
      emailTaskSuggestionsEnabled: values.suggestionsEnabled,
      emailTaskLearningEnabled: values.learningEnabled,
    })
    .onConflictDoUpdate({
      target: emailPreferences.userId,
      set: {
        emailTaskSuggestionsEnabled: values.suggestionsEnabled,
        emailTaskLearningEnabled: values.learningEnabled,
        updatedAt: new Date(),
      },
    });
  revalidatePath("/settings/notifications");
}
