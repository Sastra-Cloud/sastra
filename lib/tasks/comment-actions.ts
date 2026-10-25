"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/lib/auth/guards";
import { hasProjectCapability } from "@/lib/auth/project-access";
import { db } from "@/lib/db";
import { projects, taskComments, tasks } from "@/lib/db/schema";
import { notifyMentions } from "@/lib/mentions/notify";
import {
  listAllMentionTargets,
  listProjectMentionTargets,
} from "@/lib/mentions/roster";
import { assertTaskAccess, withTaskAccess } from "./access";
import { getTaskComments, type TaskComment } from "./queries";
import { revalidateForTask } from "./create";

const contentSchema = z
  .string()
  .trim()
  .min(1, "Comment can't be empty")
  .max(5000, "Comment is too long");

type TaskContext = {
  projectId: string | null;
  projectTitle: string | null;
  title: string;
  slug: string | null;
};

async function taskContext(taskId: string): Promise<TaskContext | null> {
  const [t] = await db
    .select({
      projectId: tasks.projectId,
      projectTitle: projects.title,
      title: tasks.title,
      slug: projects.slug,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(eq(tasks.id, taskId))
    .limit(1);
  return t ?? null;
}

/** Read a task's comments (thin authed wrapper so the client dialog can fetch). */
export async function listTaskComments(taskId: string): Promise<TaskComment[]> {
  const { user } = await requireUser();
  await assertTaskAccess(taskId, user);
  return getTaskComments(taskId);
}

export async function addTaskComment(taskId: string, content: string) {
  const { user } = await requireUser();
  const text = contentSchema.parse(content);
  const [created] = await withTaskAccess(taskId, user, "read", async (tx) => tx
    .insert(taskComments)
    .values({ taskId, userId: user.id, content: text })
    .returning({
      id: taskComments.id,
      content: taskComments.content,
      createdAt: taskComments.createdAt,
      updatedAt: taskComments.updatedAt,
    }));

  const ctx = await taskContext(taskId);
  if (text.includes("@")) {
    const members = ctx?.projectId
      ? await listProjectMentionTargets(ctx.projectId)
      : await listAllMentionTargets();
    await notifyMentions({
      content: text,
      members,
      actorId: user.id,
      actorName: user.name,
      link: ctx?.slug
        ? `/projects/${ctx.slug}/tasks?task=${taskId}`
        : `/tasks?task=${taskId}`,
      context: ctx ? `“${ctx.title}”` : undefined,
      project: ctx?.projectTitle ?? undefined,
      data: { taskId, projectId: ctx?.projectId ?? null },
    });
  }
  await revalidateForTask(ctx?.projectId ?? null);
  return {
    ...created,
    userId: user.id,
    authorName: user.name,
    authorImage: user.image ?? null,
  } satisfies TaskComment;
}

/** Edit a comment — author only. */
export async function editTaskComment(commentId: string, content: string) {
  const { user } = await requireUser();
  const text = contentSchema.parse(content);
  const [c] = await db
    .select({ userId: taskComments.userId, taskId: taskComments.taskId })
    .from(taskComments)
    .where(eq(taskComments.id, commentId))
    .limit(1);
  if (!c || c.userId !== user.id) return;
  await withTaskAccess(c.taskId, user, "read", async (tx) => tx
    .update(taskComments)
    .set({ content: text, updatedAt: new Date() })
    .where(eq(taskComments.id, commentId)));
  await revalidateForTask((await taskContext(c.taskId))?.projectId ?? null);
}

/** Delete a comment — author, or a manager/admin. */
export async function deleteTaskComment(commentId: string) {
  const { user } = await requireUser();
  const [c] = await db
    .select({ userId: taskComments.userId, taskId: taskComments.taskId })
    .from(taskComments)
    .where(eq(taskComments.id, commentId))
    .limit(1);
  if (!c) return;
  const isManager = await hasProjectCapability(user, (await taskContext(c.taskId))?.projectId, "comments.moderate");
  if (c.userId !== user.id && !isManager) return;
  await withTaskAccess(c.taskId, user, "read", async (tx) =>
    tx.delete(taskComments).where(eq(taskComments.id, commentId)));
  await revalidateForTask((await taskContext(c.taskId))?.projectId ?? null);
}
