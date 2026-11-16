"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { requireProjectCapability } from "@/lib/auth/project-access";
import { isAdminRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { defaultProjectPeople, projectManagers, projectMembers, projectPeople, projects, user } from "@/lib/db/schema";

const assignment = z.object({ projectId: z.uuid(), userId: z.string().min(1) });

async function revalidatePeople(projectId?: string) {
  if (projectId) {
    const [project] = await db.select({ slug: projects.slug }).from(projects).where(eq(projects.id, projectId)).limit(1);
    if (project) revalidatePath(`/projects/${project.slug}`, "layout");
  } else revalidatePath("/projects", "layout");
  revalidatePath("/chat", "layout");
  revalidatePath("/settings/team");
}

export async function addProjectPerson(projectId: string, userId: string) {
  const { user: actor } = await requireProjectCapability(projectId);
  assignment.parse({ projectId, userId });
  const [person] = await db.select({ id: user.id, name: user.name, image: user.image }).from(user)
    .where(and(eq(user.id, userId), eq(user.isActive, true), eq(user.isBot, false))).limit(1);
  if (!person) throw new Error("Choose an active teammate.");
  await db.insert(projectPeople).values({ projectId, userId, addedBy: actor.id }).onConflictDoNothing();
  await revalidatePeople(projectId);
  return person;
}

export async function removeProjectPerson(projectId: string, userId: string) {
  await requireUser();
  await requireProjectCapability(projectId);
  assignment.parse({ projectId, userId });
  await db.transaction(async (tx) => {
    const [person] = await tx.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1);
    if (person && isAdminRole(person)) throw new Error("Workspace admins retain access to every project chat.");
    const [manager] = await tx.select({ id: projectManagers.id }).from(projectManagers)
      .where(and(eq(projectManagers.projectId, projectId), eq(projectManagers.userId, userId))).limit(1);
    if (manager) throw new Error("Remove project management access first, then remove this person.");
    await tx.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    await tx.delete(projectPeople).where(and(eq(projectPeople.projectId, projectId), eq(projectPeople.userId, userId)));
  });
  await revalidatePeople(projectId);
}

export async function saveDefaultProjectPeople(userIds: string[]) {
  await requireRole("admin");
  const ids = [...new Set(z.array(z.string().min(1)).max(1000).parse(userIds))];
  await db.transaction(async (tx) => {
    const people = ids.length ? await tx.select({ id: user.id }).from(user)
      .where(and(inArray(user.id, ids), eq(user.isActive, true), eq(user.isBot, false))) : [];
    if (people.length !== ids.length) throw new Error("Some selected people are no longer active. Refresh and try again.");
    await tx.delete(defaultProjectPeople);
    if (ids.length) await tx.insert(defaultProjectPeople).values(ids.map(userId => ({ userId })));
  });
  await revalidatePeople();
}

/** A server-computed preview; applying rechecks both this roster and project set. */
export async function previewDefaultProjectPeople() {
  await requireRole("admin");
  const people = await db.select({ id: user.id, name: user.name }).from(defaultProjectPeople)
    .innerJoin(user, eq(user.id, defaultProjectPeople.userId))
    .where(and(eq(user.isActive, true), eq(user.isBot, false))).orderBy(user.id);
  const projectRows = await db.select({ id: projects.id }).from(projects).orderBy(projects.id);
  return { people, projectCount: projectRows.length, fingerprint: JSON.stringify([people.map(p => p.id), projectRows.map(p => p.id)]) };
}

export async function applyDefaultProjectPeople(fingerprint: string) {
  const { user: actor } = await requireRole("admin");
  // Both reads and writes share a transaction, so a failed bulk insert is atomic.
  const added = await db.transaction(async tx => {
    const people = await tx.select({ id: user.id }).from(defaultProjectPeople)
      .innerJoin(user, eq(user.id, defaultProjectPeople.userId))
      .where(and(eq(user.isActive, true), eq(user.isBot, false))).orderBy(user.id);
    const projectRows = await tx.select({ id: projects.id }).from(projects).orderBy(projects.id);
    if (fingerprint !== JSON.stringify([people.map(p => p.id), projectRows.map(p => p.id)])) {
      throw new Error("The defaults or project list changed. Preview the update again.");
    }
    if (!people.length || !projectRows.length) return 0;
    // INSERT SELECT avoids a large parameter list when the workspace has many projects.
    const rows = await tx.insert(projectPeople).select(
      tx.select({
        id: sql<string>`gen_random_uuid()`.as("id"), projectId: projects.id, userId: user.id,
        addedBy: sql<string>`${actor.id}`.as("added_by"), createdAt: sql<Date>`now()`.as("created_at"),
      }).from(projects).crossJoin(defaultProjectPeople).innerJoin(user, eq(user.id, defaultProjectPeople.userId))
        .where(and(eq(user.isActive, true), eq(user.isBot, false), inArray(user.id, people.map(p => p.id)), inArray(projects.id, projectRows.map(p => p.id))))
    ).onConflictDoNothing().returning({ id: projectPeople.id });
    return rows.length;
  });
  await revalidatePeople();
  return { added };
}
