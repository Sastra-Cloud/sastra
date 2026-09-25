"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { projectRoles } from "@/lib/db/schema";
import { slugify } from "@/lib/slug";

export type RoleState = { error?: string; ok?: boolean };

export async function createProjectRole(
  _prev: RoleState,
  formData: FormData
): Promise<RoleState> {
  await requireRole("manager");
  const label = String(formData.get("label") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim() || null;
  if (!label) return { error: "Label is required." };
  const key = slugify(label);

  const [existing] = await db
    .select({ id: projectRoles.id })
    .from(projectRoles)
    .where(eq(projectRoles.key, key))
    .limit(1);
  if (existing) return { error: "A role with that name already exists." };

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${projectRoles.sortOrder}), 0)::int` })
    .from(projectRoles);

  await db
    .insert(projectRoles)
    .values({ key, label, color, sortOrder: (max ?? 0) + 10 });

  revalidatePath("/settings/roles");
  return { ok: true };
}

export async function toggleProjectRoleActive(id: string, isActive: boolean) {
  await requireRole("manager");
  await db.update(projectRoles).set({ isActive }).where(eq(projectRoles.id, id));
  revalidatePath("/settings/roles");
}

const updateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  color: z.string().trim().optional(),
});

export async function updateProjectRole(
  _prev: RoleState,
  formData: FormData
): Promise<RoleState> {
  await requireRole("manager");
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    label: formData.get("label"),
    color: formData.get("color") || undefined,
  });
  if (!parsed.success) return { error: "Invalid input." };
  await db
    .update(projectRoles)
    .set({ label: parsed.data.label, color: parsed.data.color ?? null })
    .where(eq(projectRoles.id, parsed.data.id));
  revalidatePath("/settings/roles");
  return { ok: true };
}
