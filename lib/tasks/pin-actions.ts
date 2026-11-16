"use server";

import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { taskPins, tasks } from "@/lib/db/schema";
import { getMyTasks } from "./queries";

export async function getTaskPinSnapshot() {
  const { user } = await requireUser();
  const [myTasks, pins] = await Promise.all([
    getMyTasks(user.id),
    db.select({ taskId: taskPins.taskId }).from(taskPins)
      .where(eq(taskPins.userId, user.id)).orderBy(asc(taskPins.createdAt), asc(taskPins.id)),
  ]);
  return { tasks: myTasks, pinnedIds: pins.map(pin => pin.taskId) };
}

export async function setTaskPinned(taskId: string, pinned: boolean) {
  const { user } = await requireUser();
  const id = z.string().uuid().parse(taskId);
  z.boolean().parse(pinned);
  if (pinned) {
    // Eligibility is part of the write. Pinning never changes task assignment.
    const [pin] = await db.insert(taskPins).select(db.select({
      id: sql<string>`gen_random_uuid()`.as("id"),
      userId: sql<string>`${user.id}`.as("user_id"),
      taskId: tasks.id,
      createdAt: sql<Date>`now()`.as("created_at"),
    }).from(tasks).where(and(eq(tasks.id, id), eq(tasks.assignedTo, user.id), ne(tasks.status, "done"))))
      .onConflictDoUpdate({ target: [taskPins.userId, taskPins.taskId], set: { taskId: id } })
      .returning({ id: taskPins.taskId });
    if (!pin) throw new Error("Only unfinished tasks assigned to you can be pinned.");
  } else {
    await db.delete(taskPins).where(and(eq(taskPins.userId, user.id), eq(taskPins.taskId, id)));
  }
}
