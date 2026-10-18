import "server-only";

import { and, eq, ne, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { taskQueues, tasks } from "@/lib/db/schema";

export type TaskTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Lock in a stable order, including empty queues, before reading/changing ranks. */
export async function lockTaskQueues(tx: TaskTransaction, userIds: (string | null)[]) {
  const queues = new Map<string, typeof taskQueues.$inferSelect>();
  for (const userId of [...new Set(userIds.filter((id): id is string => Boolean(id)))].sort()) {
    await tx.insert(taskQueues).values({ userId }).onConflictDoNothing();
    const [queue] = await tx.select().from(taskQueues).where(eq(taskQueues.userId, userId)).for("update");
    queues.set(userId, queue);
  }
  return queues;
}

export async function touchTaskQueue(tx: TaskTransaction, userId: string | null, actorId: string | null) {
  if (!userId) return null;
  const [queue] = await tx.update(taskQueues).set({
    revision: sql`${taskQueues.revision} + 1`,
    updatedBy: actorId,
    updatedAt: new Date(),
  }).where(eq(taskQueues.userId, userId)).returning();
  return queue;
}

export async function nextTaskRank(tx: TaskTransaction, userId: string | null) {
  if (!userId) return 0;
  const [row] = await tx.select({ rank: sql<number>`coalesce(max(${tasks.rank}), -1) + 1` })
    .from(tasks).where(and(eq(tasks.assignedTo, userId), ne(tasks.status, "done")));
  return Number(row.rank);
}
