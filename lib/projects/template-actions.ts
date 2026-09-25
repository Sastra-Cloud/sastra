"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { logActivity } from "@/lib/activity/log";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { phaseTemplates, planTemplates, projectRoles, taskTemplates, workspaceSettings } from "@/lib/db/schema";

const schema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(600),
  isActive: z.boolean(),
});

export async function updatePlanTemplate(input: z.input<typeof schema>) {
  const { user } = await requireRole("admin");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the template." };
  await db.update(planTemplates).set({
    name: parsed.data.name,
    description: parsed.data.description || null,
    isActive: parsed.data.isActive,
    updatedAt: new Date(),
  }).where(eq(planTemplates.id, parsed.data.id));
  await logActivity({
    actorId: user.id,
    entityType: "plan_template",
    entityId: parsed.data.id,
    action: "update",
    summary: `Updated plan template “${parsed.data.name}”`,
  });
  revalidatePath("/settings/templates");
  revalidatePath("/projects/new");
  return {};
}

const structureSchema = z.object({
  templateId: z.string().uuid(),
  phases: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
    durationDays: z.number().int().min(0).max(3650).nullable(),
    tasks: z.array(z.object({
      name: z.string().trim().min(1).max(200),
      description: z.string().trim().max(1000),
      roleId: z.string().uuid().nullable(),
      offsetDays: z.number().int().min(-3650).max(3650).nullable(),
      isPerUnit: z.boolean(),
    })).max(100),
  })).min(1).max(50),
});

export async function replacePlanTemplateStructure(input: z.input<typeof structureSchema>) {
  const { user } = await requireRole("admin");
  const parsed = structureSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the phases and tasks." };
  const roleIds = new Set((await db.select({ id: projectRoles.id }).from(projectRoles)).map((row) => row.id));
  if (parsed.data.phases.some((phase) => phase.tasks.some((task) => task.roleId && !roleIds.has(task.roleId)))) {
    return { error: "One of the selected project roles no longer exists." };
  }
  await db.transaction(async (tx) => {
    await tx.delete(phaseTemplates).where(eq(phaseTemplates.planTemplateId, parsed.data.templateId));
    for (let phaseIndex = 0; phaseIndex < parsed.data.phases.length; phaseIndex++) {
      const phase = parsed.data.phases[phaseIndex];
      const [created] = await tx.insert(phaseTemplates).values({
        planTemplateId: parsed.data.templateId,
        name: phase.name,
        orderIndex: phaseIndex,
        defaultDurationDays: phase.durationDays,
        color: phase.color,
      }).returning({ id: phaseTemplates.id });
      if (phase.tasks.length) {
        await tx.insert(taskTemplates).values(phase.tasks.map((task, taskIndex) => ({
          phaseTemplateId: created.id,
          name: task.name,
          description: task.description || null,
          orderIndex: taskIndex,
          defaultProjectRoleId: task.roleId,
          defaultOffsetDays: task.offsetDays,
          isPerUnit: task.isPerUnit,
        })));
      }
    }
  });
  await logActivity({ actorId: user.id, entityType: "plan_template", entityId: parsed.data.templateId, action: "structure", summary: "Updated plan template phases and tasks" });
  revalidatePath("/settings/templates");
  revalidatePath("/projects/new");
  return {};
}

export async function setDefaultPlanTemplate(key: string | null) {
  const { user } = await requireRole("admin");
  if (key) {
    const [template] = await db.select({ key: planTemplates.key }).from(planTemplates).where(eq(planTemplates.key, key)).limit(1);
    if (!template) return { error: "Template not found." };
  }
  await db.update(workspaceSettings).set({ defaultPlanTemplateKey: key, updatedBy: user.id, updatedAt: new Date() }).where(eq(workspaceSettings.id, "workspace"));
  revalidatePath("/settings/templates");
  revalidatePath("/projects/new");
  return {};
}
