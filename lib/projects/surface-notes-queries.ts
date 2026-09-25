import "server-only";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { projectSurfaceNotes, user } from "@/lib/db/schema";

export type ProjectSurface = "budget" | "rights";

export type SurfaceNoteRow = {
  id: string;
  userId: string | null;
  authorName: string | null;
  authorImage: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SurfaceNoteThread = SurfaceNoteRow & {
  replies: SurfaceNoteRow[];
};

export async function listProjectSurfaceNotes(
  projectId: string,
  surface: ProjectSurface
): Promise<SurfaceNoteThread[]> {
  const notes = await db
    .select({
      id: projectSurfaceNotes.id,
      userId: projectSurfaceNotes.userId,
      authorName: user.name,
      authorImage: user.image,
      body: projectSurfaceNotes.body,
      createdAt: projectSurfaceNotes.createdAt,
      updatedAt: projectSurfaceNotes.updatedAt,
    })
    .from(projectSurfaceNotes)
    .leftJoin(user, eq(user.id, projectSurfaceNotes.userId))
    .where(
      and(
        eq(projectSurfaceNotes.projectId, projectId),
        eq(projectSurfaceNotes.surface, surface),
        isNull(projectSurfaceNotes.parentId)
      )
    )
    .orderBy(desc(projectSurfaceNotes.createdAt));

  if (notes.length === 0) return [];

  const replies = await db
    .select({
      id: projectSurfaceNotes.id,
      parentId: projectSurfaceNotes.parentId,
      userId: projectSurfaceNotes.userId,
      authorName: user.name,
      authorImage: user.image,
      body: projectSurfaceNotes.body,
      createdAt: projectSurfaceNotes.createdAt,
      updatedAt: projectSurfaceNotes.updatedAt,
    })
    .from(projectSurfaceNotes)
    .leftJoin(user, eq(user.id, projectSurfaceNotes.userId))
    .where(inArray(projectSurfaceNotes.parentId, notes.map((note) => note.id)))
    .orderBy(asc(projectSurfaceNotes.createdAt));

  const repliesByParent = new Map<string, SurfaceNoteRow[]>();
  for (const reply of replies) {
    if (!reply.parentId) continue;
    const list = repliesByParent.get(reply.parentId) ?? [];
    list.push({
      id: reply.id,
      userId: reply.userId,
      authorName: reply.authorName,
      authorImage: reply.authorImage,
      body: reply.body,
      createdAt: reply.createdAt,
      updatedAt: reply.updatedAt,
    });
    repliesByParent.set(reply.parentId, list);
  }

  return notes.map((note) => ({
    ...note,
    replies: repliesByParent.get(note.id) ?? [],
  }));
}
