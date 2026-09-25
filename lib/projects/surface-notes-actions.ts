"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { logActivity } from "@/lib/activity/log";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { projectSurfaceNotes } from "@/lib/db/schema";
import { notifyMentions } from "@/lib/mentions/notify";
import { listProjectMentionTargets } from "@/lib/mentions/roster";
import type { ProjectSurface } from "@/lib/projects/surface-notes-queries";

const surfaceSchema = z.enum(["budget", "rights"]);
const SURFACE_LABEL: Record<ProjectSurface, string> = {
  budget: "a budget note",
  rights: "a rights note",
};
const bodySchema = z
  .string()
  .trim()
  .min(1, "Write a note first.")
  .max(5000, "That note is too long.");

function pathFor(slug: string, surface: ProjectSurface) {
  return `/projects/${slug}/${surface}`;
}

export async function addProjectSurfaceNote(
  projectId: string,
  slug: string,
  surface: ProjectSurface,
  body: string
) {
  const { user } = await requireUser();
  const parsedSurface = surfaceSchema.parse(surface);
  const text = bodySchema.parse(body);
  const [row] = await db
    .insert(projectSurfaceNotes)
    .values({
      projectId,
      surface: parsedSurface,
      userId: user.id,
      body: text,
    })
    .returning({ id: projectSurfaceNotes.id });

  await logActivity({
    actorId: user.id,
    projectId,
    entityType: `${parsedSurface}_note`,
    entityId: row?.id ?? null,
    action: "post",
    summary: `Posted a ${parsedSurface} note`,
  });
  if (text.includes("@")) {
    await notifyMentions({
      content: text,
      members: await listProjectMentionTargets(projectId),
      actorId: user.id,
      actorName: user.name,
      link: pathFor(slug, parsedSurface),
      context: SURFACE_LABEL[parsedSurface],
      data: { projectId, surface: parsedSurface, noteId: row?.id },
    });
  }
  revalidatePath(pathFor(slug, parsedSurface));
}

export async function replyToProjectSurfaceNote(
  noteId: string,
  slug: string,
  surface: ProjectSurface,
  body: string
) {
  const { user } = await requireUser();
  const parsedSurface = surfaceSchema.parse(surface);
  const text = bodySchema.parse(body);
  const [parent] = await db
    .select({
      projectId: projectSurfaceNotes.projectId,
      surface: projectSurfaceNotes.surface,
    })
    .from(projectSurfaceNotes)
    .where(
      and(eq(projectSurfaceNotes.id, noteId), isNull(projectSurfaceNotes.parentId))
    )
    .limit(1);

  if (!parent || parent.surface !== parsedSurface) return;

  await db.insert(projectSurfaceNotes).values({
    projectId: parent.projectId,
    surface: parsedSurface,
    parentId: noteId,
    userId: user.id,
    body: text,
  });
  if (text.includes("@")) {
    await notifyMentions({
      content: text,
      members: await listProjectMentionTargets(parent.projectId),
      actorId: user.id,
      actorName: user.name,
      link: pathFor(slug, parsedSurface),
      context: SURFACE_LABEL[parsedSurface],
      data: { projectId: parent.projectId, surface: parsedSurface, noteId },
    });
  }
  revalidatePath(pathFor(slug, parsedSurface));
}

export async function editProjectSurfaceNote(
  noteId: string,
  slug: string,
  surface: ProjectSurface,
  body: string
) {
  const { user } = await requireUser();
  const parsedSurface = surfaceSchema.parse(surface);
  const text = bodySchema.parse(body);
  const [row] = await db
    .select({
      userId: projectSurfaceNotes.userId,
      surface: projectSurfaceNotes.surface,
    })
    .from(projectSurfaceNotes)
    .where(eq(projectSurfaceNotes.id, noteId))
    .limit(1);

  if (!row || row.surface !== parsedSurface || row.userId !== user.id) return;

  await db
    .update(projectSurfaceNotes)
    .set({ body: text, updatedAt: new Date() })
    .where(eq(projectSurfaceNotes.id, noteId));
  revalidatePath(pathFor(slug, parsedSurface));
}

export async function deleteProjectSurfaceNote(
  noteId: string,
  slug: string,
  surface: ProjectSurface
) {
  const { user } = await requireUser();
  const parsedSurface = surfaceSchema.parse(surface);
  const [row] = await db
    .select({
      userId: projectSurfaceNotes.userId,
      surface: projectSurfaceNotes.surface,
      parentId: projectSurfaceNotes.parentId,
    })
    .from(projectSurfaceNotes)
    .where(eq(projectSurfaceNotes.id, noteId))
    .limit(1);

  if (!row || row.surface !== parsedSurface) return;
  const canModerate = can(user, "comments.moderate");
  if (row.userId !== user.id && !canModerate) return;

  if (row.parentId === null) {
    await db
      .delete(projectSurfaceNotes)
      .where(eq(projectSurfaceNotes.parentId, noteId));
  }
  await db.delete(projectSurfaceNotes).where(eq(projectSurfaceNotes.id, noteId));
  revalidatePath(pathFor(slug, parsedSurface));
}
