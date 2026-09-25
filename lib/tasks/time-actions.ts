"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { tasks, timeEntries, user } from "@/lib/db/schema";
import { revalidateForTask } from "./create";
import { getMyTasks } from "./queries";
import { getTaskTimeEntries } from "./time-queries";
import { startTimerFor, stopTimerFor } from "./time-service";

/** Entries + total for a task (for the task detail Time-tracking section). */
export async function loadTaskTime(taskId: string) {
  await requireUser();
  return getTaskTimeEntries(taskId);
}

/** The current user's open tasks, for the timer widget's "start on…" picker. */
export async function listStartableTasks(): Promise<
  { id: string; title: string; projectTitle: string | null }[]
> {
  const { user: u } = await requireUser();
  const rows = await getMyTasks(u.id);
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    projectTitle: t.projectTitle,
  }));
}

async function revalidateTask(taskId: string) {
  const [t] = await db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  await revalidateForTask(t?.projectId ?? null);
}

export async function startTimer(taskId: string, note?: string) {
  const { user: u } = await requireUser();
  await startTimerFor(u.id, taskId, "timer", note);
  await revalidateTask(taskId);
}

export async function stopTimer() {
  const { user: u } = await requireUser();
  const taskId = await stopTimerFor(u.id);
  if (taskId) await revalidateTask(taskId);
}

const logSchema = z.object({
  taskId: z.string().uuid(),
  minutes: z.number().int().positive().max(24 * 60),
  note: z.string().trim().max(500).optional(),
  /** ISO date/datetime for the entry's start; defaults to now − minutes. */
  startedAt: z.string().optional(),
});

export async function logTime(input: z.infer<typeof logSchema>) {
  const { user: u } = await requireUser();
  const { taskId, minutes, note, startedAt } = logSchema.parse(input);
  const durationSeconds = minutes * 60;
  const start = startedAt
    ? new Date(startedAt)
    : new Date(Date.now() - durationSeconds * 1000);
  const end = new Date(start.getTime() + durationSeconds * 1000);
  await db.insert(timeEntries).values({
    taskId,
    userId: u.id,
    startedAt: start,
    endedAt: end,
    durationSeconds,
    source: "manual",
    note: note ?? null,
  });
  await revalidateTask(taskId);
}

const editSchema = z.object({
  minutes: z.number().int().min(0).max(24 * 60).optional(),
  note: z.string().trim().max(500).nullable().optional(),
  startedAt: z.string().optional(),
});

export async function updateTimeEntry(
  id: string,
  input: z.infer<typeof editSchema>
) {
  const { user: u } = await requireUser();
  const f = editSchema.parse(input);
  const [entry] = await db
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.id, id))
    .limit(1);
  if (!entry || entry.userId !== u.id) return; // own entries only

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  const start = f.startedAt ? new Date(f.startedAt) : entry.startedAt;
  if (f.startedAt !== undefined) patch.startedAt = start;
  if (f.note !== undefined) patch.note = f.note;
  // Only completed entries carry a duration; editing minutes shifts the end.
  if (f.minutes !== undefined && entry.endedAt !== null) {
    const durationSeconds = f.minutes * 60;
    patch.durationSeconds = durationSeconds;
    patch.endedAt = new Date(start.getTime() + durationSeconds * 1000);
  } else if (f.startedAt !== undefined && entry.durationSeconds !== null) {
    patch.endedAt = new Date(start.getTime() + entry.durationSeconds * 1000);
  }
  await db.update(timeEntries).set(patch).where(eq(timeEntries.id, id));
  await revalidateTask(entry.taskId);
}

export async function deleteTimeEntry(id: string) {
  const { user: u } = await requireUser();
  const [entry] = await db
    .select({ userId: timeEntries.userId, taskId: timeEntries.taskId })
    .from(timeEntries)
    .where(eq(timeEntries.id, id))
    .limit(1);
  if (!entry || entry.userId !== u.id) return;
  await db.delete(timeEntries).where(eq(timeEntries.id, id));
  await revalidateTask(entry.taskId);
}

export async function setAutoStartTimer(enabled: boolean) {
  const { user: u } = await requireUser();
  await db
    .update(user)
    .set({ autoStartTimer: enabled, updatedAt: new Date() })
    .where(eq(user.id, u.id));
  revalidatePath("/settings/profile");
}
