"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";

import { requireRole, requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  licenseObligations,
  projects,
  recurringTasks,
  tasks,
} from "@/lib/db/schema";
import { nextDueDate, type Frequency } from "@/lib/recurring/schedule";
import { notifyAssignment } from "./create";
import { materializeRuleById } from "./recurring";
import { reconcileTaskDueDateChange } from "./due-date-notifications";

const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  description: z.string().trim().optional(),
  projectId: z.string().uuid().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  isMilestone: z.boolean().optional(),
  estimateHours: z.coerce.number().min(0).max(9999).optional(),
  frequency: z.enum(["weekly", "monthly", "quarterly", "annual"]),
  anchorDate: YMD,
  endDate: YMD.nullable().optional(),
});

const updateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(300),
    description: z.string().trim().nullable().optional(),
    assigneeId: z.string().nullable().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    frequency: z.enum(["weekly", "monthly", "quarterly", "annual"]),
    anchorDate: YMD,
    endDate: YMD.nullable().optional(),
  })
  .refine((value) => !value.endDate || value.endDate >= value.anchorDate, {
    message: "End date must be on or after the first due date",
    path: ["endDate"],
  });

export type RecurringTaskInput = z.input<typeof createSchema>;
export type RecurringTaskUpdateInput = z.input<typeof updateSchema>;

async function revalidateRecurring(projectId: string | null) {
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
  revalidatePath("/workload");
  if (projectId) {
    const [p] = await db
      .select({ slug: projects.slug })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (p) revalidatePath(`/projects/${p.slug}/tasks`);
  }
}

/**
 * Edit a recurring rule and keep every unfinished occurrence in sync. Completed
 * occurrences remain historical records. Changing the schedule moves the
 * current/future occurrence to the newly computed due date; overdue work keeps
 * its original deadline.
 */
export async function updateRecurringTask(
  id: string,
  input: RecurringTaskUpdateInput
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  const today = new Date().toISOString().slice(0, 10);

  const [rule] = await db
    .select({
      projectId: recurringTasks.projectId,
      isActive: recurringTasks.isActive,
      assigneeId: recurringTasks.assigneeId,
      sourceObligationId: licenseObligations.id,
    })
    .from(recurringTasks)
    .leftJoin(
      licenseObligations,
      eq(licenseObligations.recurringTaskId, recurringTasks.id)
    )
    .where(eq(recurringTasks.id, id))
    .limit(1);
  if (!rule) return { error: "Recurring task not found" };
  if (rule.sourceObligationId && d.frequency === "weekly") {
    return {
      error: "License report schedules can be monthly, quarterly, or annual",
    };
  }
  if (rule.sourceObligationId && !d.description?.trim()) {
    return { error: "License obligations need the agreement requirement text" };
  }

  const nextDue = nextDueDate(
    d.anchorDate,
    d.frequency as Frequency,
    today,
    d.endDate
  );
  const occurrences = await db
    .select({
      id: tasks.id,
      assignedTo: tasks.assignedTo,
      dueDate: tasks.dueDate,
      status: tasks.status,
    })
    .from(tasks)
    .where(
      and(eq(tasks.sourceRecurringTaskId, id), ne(tasks.status, "done"))
    );

  await db.transaction(async (tx) => {
    await tx
      .update(recurringTasks)
      .set({
        title: d.title,
        description: d.description?.trim() || null,
        assigneeId: d.assigneeId ?? null,
        priority: d.priority,
        frequency: d.frequency,
        anchorDate: d.anchorDate,
        endDate: d.endDate ?? null,
        lastGeneratedDate: rule.isActive ? nextDue : null,
        updatedAt: new Date(),
      })
      .where(eq(recurringTasks.id, id));

    await tx
      .update(tasks)
      .set({
        title: d.title,
        description: d.description?.trim() || null,
        assignedTo: d.assigneeId ?? null,
        priority: d.priority,
        updatedAt: new Date(),
      })
      .where(
        and(eq(tasks.sourceRecurringTaskId, id), ne(tasks.status, "done"))
      );

    if (nextDue) {
      await tx
        .update(tasks)
        .set({
          dueDate: nextDue,
          dueDateIsManual: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tasks.sourceRecurringTaskId, id),
            ne(tasks.status, "done"),
            or(gte(tasks.dueDate, today), isNull(tasks.dueDate))
          )
        );
    } else {
      await tx
        .delete(tasks)
        .where(
          and(
            eq(tasks.sourceRecurringTaskId, id),
            eq(tasks.status, "todo"),
            or(gte(tasks.dueDate, today), isNull(tasks.dueDate))
          )
        );
    }

    if (rule.sourceObligationId) {
      const obligationCadence = d.frequency as
        | "monthly"
        | "quarterly"
        | "annual";
      await tx
        .update(licenseObligations)
        .set({
          label: d.title,
          text: d.description?.trim() || d.title,
          cadence: obligationCadence,
          firstDueDate: d.anchorDate,
          assigneeId: d.assigneeId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(licenseObligations.id, rule.sourceObligationId));
    }
  });

  if (rule.isActive && nextDue) await materializeRuleById(id);
  if ((d.assigneeId ?? null) === rule.assigneeId) {
    await Promise.all(
      occurrences.map((occurrence) =>
        reconcileTaskDueDateChange({
          taskId: occurrence.id,
          previousDueDate: occurrence.dueDate,
          actorId: user.id,
        })
      )
    );
  }
  if ((d.assigneeId ?? null) !== rule.assigneeId) {
    await Promise.all(
      occurrences.map((occurrence) =>
        notifyAssignment(occurrence.id, d.assigneeId ?? null, user.id)
      )
    );
  }
  await revalidateRecurring(rule.projectId);
  return {};
}

export async function createRecurringTask(
  input: RecurringTaskInput
): Promise<{ id?: string; error?: string }> {
  const { user } = await requireUser();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const [row] = await db
    .insert(recurringTasks)
    .values({
      createdBy: user.id,
      projectId: d.projectId ?? null,
      title: d.title,
      description: d.description,
      assigneeId: d.assigneeId ?? null,
      priority: d.priority,
      isMilestone: d.isMilestone ?? false,
      estimateHours: d.estimateHours != null ? String(d.estimateHours) : null,
      frequency: d.frequency,
      anchorDate: d.anchorDate,
      endDate: d.endDate ?? null,
    })
    .returning({ id: recurringTasks.id });

  // Create the first occurrence now so the user sees the task immediately.
  await materializeRuleById(row.id);
  await revalidateRecurring(d.projectId ?? null);
  return { id: row.id };
}

export async function setRecurringTaskActive(id: string, active: boolean) {
  await requireUser();
  const [row] = await db
    .update(recurringTasks)
    .set({ isActive: active, updatedAt: new Date() })
    .where(eq(recurringTasks.id, id))
    .returning({ projectId: recurringTasks.projectId });
  if (active) await materializeRuleById(id);
  await revalidateRecurring(row?.projectId ?? null);
}

export async function deleteRecurringTask(id: string) {
  await requireUser();
  // The rule has no FK cascade to the tasks it materialized. Remove its still-
  // open occurrences (a wrongly-anchored reminder shouldn't linger after the
  // rule is deleted); completed occurrences stay as history.
  await db
    .delete(tasks)
    .where(and(eq(tasks.sourceRecurringTaskId, id), ne(tasks.status, "done")));
  const [row] = await db
    .delete(recurringTasks)
    .where(eq(recurringTasks.id, id))
    .returning({ projectId: recurringTasks.projectId });
  await revalidateRecurring(row?.projectId ?? null);
}
