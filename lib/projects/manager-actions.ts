"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { projectManagers, projects, user } from "@/lib/db/schema";
import { logActivity } from "@/lib/activity/log";

const assignmentSchema = z.object({ projectId: z.string().uuid(), userId: z.string().min(1) });

async function revalidateProject(projectId: string) {
  const [project] = await db.select({ slug: projects.slug }).from(projects)
    .where(eq(projects.id, projectId)).limit(1);
  if (project) revalidatePath(`/projects/${project.slug}`, "layout");
  revalidatePath("/tasks");
}

/** Only workspace managers can delegate authority, including on their own projects. */
export async function addProjectManager(projectId: string, userId: string) {
  const { user: actor } = await requireRole("manager");
  assignmentSchema.parse({ projectId, userId });
  const [teammate] = await db.select({ id: user.id, name: user.name, image: user.image })
    .from(user).where(and(eq(user.id, userId), eq(user.isActive, true), eq(user.isBot, false), eq(user.role, "member")))
    .limit(1);
  if (!teammate) throw new Error("Choose an active member. Workspace managers already manage every project.");
  const [created] = await db.insert(projectManagers).values({ projectId, userId, grantedBy: actor.id })
    .onConflictDoNothing().returning({ id: projectManagers.id });
  if (created) await logActivity({ actorId: actor.id, projectId, entityType: "project", entityId: projectId,
    action: "manager", summary: `Gave ${teammate.name} project management access` });
  await revalidateProject(projectId);
  return { userId: teammate.id, name: teammate.name, image: teammate.image };
}

export async function removeProjectManager(projectId: string, userId: string) {
  const { user: actor } = await requireRole("manager");
  assignmentSchema.parse({ projectId, userId });
  const [removed] = await db.delete(projectManagers)
    .where(and(eq(projectManagers.projectId, projectId), eq(projectManagers.userId, userId)))
    .returning({ id: projectManagers.id });
  if (removed) await logActivity({ actorId: actor.id, projectId, entityType: "project", entityId: projectId,
    action: "manager", summary: "Removed project management access" });
  await revalidateProject(projectId);
}
