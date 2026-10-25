import "server-only";
import { and, eq } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { activityLog, lectioOperations, notifications, tasks } from "@/lib/db/schema";
import { nextTaskRank, touchTaskQueue } from "@/lib/tasks/queue-service";
import type { IntegrationTransaction } from "./endpoint";
import { IntegrationError } from "./protocol/contract";
import { digest } from "./protocol/signing";

/** Caller holds all affected queue locks. Only fill unplanned work; never rewrite a human's date. */
export async function handoffTranslation(tx: IntegrationTransaction, input: {
  taskId: string; expectedAssigneeId: string | null; projectId: string; projectSlug: string; connectionId: string;
  eventKey: string; completedAt: Date; timezone: string; durationDays: number; coordinatorId: string | null;
}) {
  const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.projectId, input.projectId))).for("update");
  if (!task || task.status === "done") return;
  if (task.assignedTo !== input.expectedAssigneeId) throw new IntegrationError("concurrent_change", "The downstream assignment changed. Retry synchronization.", 409);
  const assignedTo = task.assignedTo || input.coordinatorId;
  const day = formatInTimeZone(input.completedAt, input.timezone, "yyyy-MM-dd");
  const due = new Date(`${day}T12:00:00Z`); due.setUTCDate(due.getUTCDate() + input.durationDays);
  await tx.update(tasks).set({
    assignedTo, rank: task.assignedTo !== assignedTo ? await nextTaskRank(tx, assignedTo) : task.rank,
    dueDate: task.dueDate || (task.dueDateIsManual ? null : due.toISOString().slice(0, 10)), updatedAt: new Date(),
  }).where(eq(tasks.id, task.id));
  if (task.assignedTo !== assignedTo) await touchTaskQueue(tx, assignedTo, null);
  await tx.insert(activityLog).values({ projectId: input.projectId, entityType: "task", entityId: task.id,
    action: "lectio_handoff", summary: "Translation is ready for the next publishing stage", data: { eventKey: input.eventKey } });
  if (!assignedTo) return;
  const [notification] = await tx.insert(notifications).values({ userId: assignedTo, eventKey: input.eventKey,
    type: "task_ready", title: `Ready for you: ${task.title}`, link: `/projects/${input.projectSlug}/tasks?task=${task.id}`,
    data: { taskId: task.id } }).onConflictDoNothing().returning();
  if (notification) await tx.insert(lectioOperations).values({ connectionId: input.connectionId, operationId: `email-${notification.id}`,
    direction: "out", kind: "notification-email", fingerprint: digest(notification.id),
    payload: { notificationId: notification.id, recipientId: assignedTo, type: "task_ready" } }).onConflictDoNothing();
}
