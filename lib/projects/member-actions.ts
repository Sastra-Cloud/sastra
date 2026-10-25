"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/guards";
import { requireProjectCapability } from "@/lib/auth/project-access";
import { db } from "@/lib/db";
import { projectMembers, projects } from "@/lib/db/schema";

async function revalidateProject(projectId: string) {
  const [p] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (p) {
    revalidatePath(`/projects/${p.slug}/members`);
    revalidatePath(`/projects/${p.slug}`);
  }
}

export async function addProjectMember(
  projectId: string,
  userId: string,
  projectRoleId: string
) {
  await requireProjectCapability(projectId);
  if (!userId || !projectRoleId) return;
  const [created] = await db
    .insert(projectMembers)
    .values({ projectId, userId, projectRoleId })
    .onConflictDoNothing()
    .returning({ id: projectMembers.id });
  const existing = created ?? (
    await db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
          eq(projectMembers.projectRoleId, projectRoleId)
        )
      )
      .limit(1)
  )[0];
  await revalidateProject(projectId);
  return { id: existing?.id };
}

export async function removeProjectMember(memberId: string) {
  await requireUser();
  const [member] = await db.select({ projectId: projectMembers.projectId }).from(projectMembers)
    .where(eq(projectMembers.id, memberId)).limit(1);
  if (!member) return;
  await requireProjectCapability(member.projectId);
  const [row] = await db
    .delete(projectMembers)
    .where(eq(projectMembers.id, memberId))
    .returning({ projectId: projectMembers.projectId });
  if (row) await revalidateProject(row.projectId);
}
