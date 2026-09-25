"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { requireRole, requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { projectUpdates, projects } from "@/lib/db/schema";
import { logActivity } from "@/lib/activity/log";
import { notifyMany } from "@/lib/notifications";
import { notifyMentions } from "@/lib/mentions/notify";
import { listProjectMentionTargets } from "@/lib/mentions/roster";
import {
  listEarlierProjectUpdates,
  type EarlierUpdate,
} from "./status-queries";

const bodySchema = z
  .string()
  .trim()
  .min(1, "Write something first")
  .max(5000, "That's too long");

/** Post a project status update — managers/admins only. Becomes the latest. */
export async function postProjectUpdate(
  projectId: string,
  slug: string,
  body: string
) {
  const { user } = await requireRole("manager");
  const text = bodySchema.parse(body);
  const [row] = await db
    .insert(projectUpdates)
    .values({ projectId, userId: user.id, body: text })
    .returning({ id: projectUpdates.id });
  await logActivity({
    actorId: user.id,
    projectId,
    entityType: "status_update",
    entityId: row?.id ?? null,
    action: "post",
    summary: "Posted a project status update",
  });
  if (text.includes("@")) {
    await notifyMentions({
      content: text,
      members: await listProjectMentionTargets(projectId),
      actorId: user.id,
      actorName: user.name,
      link: `/projects/${slug}`,
      context: "a status update",
      data: { projectId, updateId: row?.id },
    });
  }
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/dashboard");
  return row?.id ?? null;
}

/** Edit an update/reply — author only. */
export async function editProjectUpdate(id: string, slug: string, body: string) {
  const { user } = await requireUser();
  const text = bodySchema.parse(body);
  const [row] = await db
    .select({ userId: projectUpdates.userId })
    .from(projectUpdates)
    .where(eq(projectUpdates.id, id))
    .limit(1);
  if (!row || row.userId !== user.id) return;
  await db
    .update(projectUpdates)
    .set({
      body: text,
      updatedAt: new Date(),
      aiAnalysis: null,
      aiAnalyzedAt: null,
      aiReviewedAt: null,
    })
    .where(eq(projectUpdates.id, id));
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/dashboard");
}

/** Clear an actionable AI follow-up from manager review queues. */
export async function markProjectUpdateRecommendationsReviewed(
  id: string,
  slug: string
) {
  await requireRole("manager");
  await db
    .update(projectUpdates)
    .set({ aiReviewedAt: new Date() })
    .where(and(eq(projectUpdates.id, id), isNull(projectUpdates.parentId)));
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/overview");
  revalidatePath("/dashboard");
}

/** Delete an update (cascades its replies) or a reply — author or manager. */
export async function deleteProjectUpdate(id: string, slug: string) {
  const { user } = await requireUser();
  const [row] = await db
    .select({ userId: projectUpdates.userId, parentId: projectUpdates.parentId })
    .from(projectUpdates)
    .where(eq(projectUpdates.id, id))
    .limit(1);
  if (!row) return;
  const isManager = can(user, "comments.moderate");
  if (row.userId !== user.id && !isManager) return;
  if (row.parentId === null) {
    await db.delete(projectUpdates).where(eq(projectUpdates.parentId, id));
  }
  await db.delete(projectUpdates).where(eq(projectUpdates.id, id));
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/dashboard");
}

/** Reply to a status update — any authenticated teammate. Notifies the thread. */
export async function replyToProjectUpdate(
  updateId: string,
  slug: string,
  body: string
) {
  const { user } = await requireUser();
  const text = bodySchema.parse(body);
  const [parent] = await db
    .select({
      projectId: projectUpdates.projectId,
      userId: projectUpdates.userId,
      projectTitle: projects.title,
    })
    .from(projectUpdates)
    .leftJoin(projects, eq(projects.id, projectUpdates.projectId))
    .where(and(eq(projectUpdates.id, updateId), isNull(projectUpdates.parentId)))
    .limit(1);
  if (!parent) return;

  const [reply] = await db
    .insert(projectUpdates)
    .values({
      projectId: parent.projectId,
      parentId: updateId,
      userId: user.id,
      body: text,
    })
    .returning({ id: projectUpdates.id });

  // @mentions get their own, higher-signal notification first.
  const mentioned = text.includes("@")
    ? await notifyMentions({
        content: text,
        members: await listProjectMentionTargets(parent.projectId),
        actorId: user.id,
        actorName: user.name,
        link: `/projects/${slug}`,
        context: "a status update",
        project: parent.projectTitle ?? undefined,
        data: { projectId: parent.projectId, updateId, replyId: reply?.id },
      })
    : [];

  // Notify the update author + everyone who has replied, minus the replier and
  // anyone already pinged by an @mention above.
  const priorRepliers = await db
    .select({ userId: projectUpdates.userId })
    .from(projectUpdates)
    .where(eq(projectUpdates.parentId, updateId));
  const recipients = [parent.userId, ...priorRepliers.map((r) => r.userId)].filter(
    (id): id is string => !!id && id !== user.id && !mentioned.includes(id)
  );
  if (recipients.length) {
    await notifyMany(recipients, {
      type: "status_update_reply",
      title: `${user.name} replied to a status update`,
      body: text.slice(0, 140),
      project: parent.projectTitle ?? undefined,
      link: `/projects/${slug}`,
      data: { projectId: parent.projectId, updateId, replyId: reply?.id },
    });
  }
  revalidatePath(`/projects/${slug}`);
}

/** Prior updates for the "earlier updates" toggle. */
export async function listEarlierUpdates(
  projectId: string
): Promise<EarlierUpdate[]> {
  await requireUser();
  return listEarlierProjectUpdates(projectId);
}
