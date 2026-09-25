"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { projectRoles, userRoleCapacity } from "@/lib/db/schema";
import type { ActionResult } from "@/lib/actions/result";

const setSchema = z.object({
  userId: z.string().min(1),
  projectRoleId: z.string().uuid(),
  capacityGroupKey: z.string().trim().min(1).max(40),
  projectsAtOnce: z.number().int().min(0).max(50),
});

/**
 * Set (or clear) how many projects a person carries at once in a role on a work
 * path. Zero (or clearing) removes the capability on that path. Manager/admin
 * only.
 */
export async function setUserRoleCapacity(
  input: z.input<typeof setSchema>
): Promise<ActionResult> {
  await requireRole("manager");
  const { userId, projectRoleId, capacityGroupKey, projectsAtOnce } =
    setSchema.parse(input);

  if (projectsAtOnce <= 0) {
    await db
      .delete(userRoleCapacity)
      .where(
        and(
          eq(userRoleCapacity.userId, userId),
          eq(userRoleCapacity.projectRoleId, projectRoleId),
          eq(userRoleCapacity.capacityGroupKey, capacityGroupKey)
        )
      );
  } else {
    await db
      .insert(userRoleCapacity)
      .values({ userId, projectRoleId, capacityGroupKey, projectsAtOnce })
      .onConflictDoUpdate({
        target: [
          userRoleCapacity.userId,
          userRoleCapacity.projectRoleId,
          userRoleCapacity.capacityGroupKey,
        ],
        set: { projectsAtOnce, updatedAt: new Date() },
      });
  }

  revalidatePath("/schedule");
  revalidatePath("/settings/team");
  return { ok: true };
}

const durationSchema = z.object({
  roleId: z.string().uuid(),
  defaultDurationDays: z.number().int().min(0).max(3650).nullable(),
});

/** Set a role's typical stage duration (days), used by the due-date cascade. */
export async function updateProjectRoleDuration(
  input: z.input<typeof durationSchema>
): Promise<ActionResult> {
  await requireRole("manager");
  const { roleId, defaultDurationDays } = durationSchema.parse(input);
  await db
    .update(projectRoles)
    .set({ defaultDurationDays })
    .where(eq(projectRoles.id, roleId));
  revalidatePath("/settings/roles");
  revalidatePath("/schedule");
  return { ok: true };
}
