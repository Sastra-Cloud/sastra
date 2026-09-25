"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { projects, tasks } from "@/lib/db/schema";
import { logActivity } from "@/lib/activity/log";
import type { ActionResult } from "@/lib/actions/result";
import { clearTaskDueDateNotifications } from "@/lib/tasks/due-date-notifications";
import { revalidateForTask } from "@/lib/tasks/create";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function revalidateSchedule(slug?: string) {
  revalidatePath("/schedule");
  revalidatePath("/overview");
  revalidatePath("/projects");
  if (slug) revalidatePath(`/projects/${slug}`);
}

type ProjectSet = {
  updatedAt: Date;
  startDate?: string | null;
  estimatedDurationMonths?: number | null;
};

const updateSchema = z.object({
  startDate: z.string().regex(YMD, "Enter a valid date.").nullable().optional(),
  estimatedDurationMonths: z.number().int().min(1).max(120).nullable().optional(),
  /** When moving the start, shift the project's phases/tasks by the same days. */
  shiftTasksByDays: z.number().int().min(-3650).max(3650).optional(),
});

/**
 * Set a project's planned start and/or estimated duration. When `shiftTasksByDays`
 * is given (a start move the user chose to cascade), also shift the project's
 * phases and its non-manual task due dates by the same number of days.
 */
export async function updateProjectSchedule(
  projectId: string,
  input: z.input<typeof updateSchema>
): Promise<ActionResult> {
  const { user } = await requireRole("manager");
  const data = updateSchema.parse(input);

  const set: ProjectSet = { updatedAt: new Date() };
  if (data.startDate !== undefined) set.startDate = data.startDate;
  if (data.estimatedDurationMonths !== undefined) {
    set.estimatedDurationMonths = data.estimatedDurationMonths;
  }

  const [row] = await db
    .update(projects)
    .set(set)
    .where(eq(projects.id, projectId))
    .returning({ slug: projects.slug });
  if (!row) return { ok: false, error: { message: "Project not found." } };

  const delta = data.shiftTasksByDays ?? 0;
  let shiftedTaskIds: string[] = [];
  if (delta !== 0) {
    // Postgres `date + integer` adds days; null dates stay null. Non-manual task
    // due dates and all phase dates move with the project.
    shiftedTaskIds = await db.transaction(async (tx) => {
      const shifted = await tx
        .update(tasks)
        .set({
          dueDate: sql`${tasks.dueDate} + ${delta}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tasks.projectId, projectId),
            eq(tasks.dueDateIsManual, false),
            isNotNull(tasks.dueDate)
          )
        )
        .returning({ id: tasks.id });
      await tx.execute(
        sql`update phases set start_date = start_date + ${delta}, due_date = due_date + ${delta}
            where project_id = ${projectId} and (start_date is not null or due_date is not null)`
      );
      return shifted.map((task) => task.id);
    });
    await clearTaskDueDateNotifications(shiftedTaskIds);
  }

  await logActivity({
    actorId: user.id,
    projectId,
    entityType: "project",
    entityId: projectId,
    action: "update",
    summary: delta !== 0 ? "Rescheduled the project and its plan" : "Updated the project schedule",
  });

  if (shiftedTaskIds.length > 0) await revalidateForTask(projectId);
  revalidateSchedule(row.slug);
  return { ok: true };
}

const dueDateSchema = z.string().regex(YMD, "Enter a valid date.").nullable();

/**
 * Set (or clear) a project's target completion date. A focused single-field edit
 * used by the "missing a due date" portfolio screen; unlike the full project
 * form it does not touch status, tasks, or phases.
 */
export async function setProjectDueDate(
  projectId: string,
  dueDate: string | null
): Promise<ActionResult<{ slug: string }>> {
  const { user } = await requireRole("manager");
  const parsed = dueDateSchema.safeParse(dueDate);
  if (!parsed.success) {
    return {
      ok: false,
      error: { message: parsed.error.issues[0]?.message ?? "Enter a valid date." },
    };
  }

  const [row] = await db
    .update(projects)
    .set({ dueDate: parsed.data, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning({ slug: projects.slug });
  if (!row) return { ok: false, error: { message: "Project not found." } };

  await logActivity({
    actorId: user.id,
    projectId,
    entityType: "project",
    entityId: projectId,
    action: "update",
    summary: parsed.data
      ? "Set the project due date"
      : "Cleared the project due date",
  });

  revalidateSchedule(row.slug);
  revalidatePath("/dashboard");
  return { ok: true, data: { slug: row.slug } };
}

const bulkSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      startDate: z.string().regex(YMD),
      estimatedDurationMonths: z.number().int().min(1).max(120).nullable().optional(),
    })
  )
  .max(500);

/**
 * Apply an auto-scheduled plan: set each project's start (and optional duration)
 * in one transaction. Portfolio-level only — does not cascade task dates.
 */
export async function bulkRescheduleProjects(
  assignments: z.input<typeof bulkSchema>
): Promise<ActionResult<{ updated: number }>> {
  await requireRole("manager");
  const data = bulkSchema.parse(assignments);
  if (data.length === 0) return { ok: true, data: { updated: 0 } };

  await db.transaction(async (tx) => {
    for (const a of data) {
      const set: ProjectSet = { updatedAt: new Date(), startDate: a.startDate };
      if (a.estimatedDurationMonths !== undefined) {
        set.estimatedDurationMonths = a.estimatedDurationMonths;
      }
      await tx.update(projects).set(set).where(eq(projects.id, a.id));
    }
  });

  revalidateSchedule();
  return { ok: true, data: { updated: data.length } };
}
