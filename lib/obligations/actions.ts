"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { licenseObligations, projects, rightsItems } from "@/lib/db/schema";
import { recomputeProjectBlockers } from "@/lib/blockers/engine";
import {
  deleteRecurringTask,
  setRecurringTaskActive,
} from "@/lib/tasks/recurring-actions";
import {
  cadenceGeneratesTask,
  generateObligationTask,
  projectOwnerId,
} from "./generate";

async function revalidate(projectId: string) {
  await recomputeProjectBlockers(projectId);
  const [p] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!p) return;
  revalidatePath(`/projects/${p.slug}/rights`);
  revalidatePath(`/projects/${p.slug}/tasks`);
  revalidatePath(`/projects/${p.slug}`);
}

const kindEnum = z.enum([
  "attribution",
  "copyright_notice",
  "artwork_approval",
  "analytics_report",
  "format_restriction",
  "territory_restriction",
  "sample_delivery",
  "other",
]);
const cadenceEnum = z.enum([
  "per_episode",
  "per_artwork",
  "monthly",
  "quarterly",
  "annual",
  "standing",
  "on_publish",
]);

const createSchema = z.object({
  clauseRef: z.string().trim().max(20).optional(),
  kind: kindEnum.default("other"),
  cadence: cadenceEnum.default("standing"),
  label: z.string().trim().min(1, "A short label is required").max(200),
  text: z.string().trim().min(1, "The obligation text is required").max(4000),
  assigneeId: z.string().nullable().optional(),
  // Optional agreement-stated first due date for a periodic report.
  anchorDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type CreateObligationInput = z.input<typeof createSchema>;

async function projectRightsItemId(projectId: string): Promise<string | null> {
  const [r] = await db
    .select({ id: rightsItems.id })
    .from(rightsItems)
    .where(eq(rightsItems.projectId, projectId))
    .limit(1);
  return r?.id ?? null;
}

export async function createObligation(
  projectId: string,
  input: CreateObligationInput
): Promise<{ id?: string; recurringTaskId?: string; taskId?: string; error?: string }> {
  const { user } = await requireRole("manager");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const rightsItemId = await projectRightsItemId(projectId);
  // A report reminder / gate task defaults its owner to the project creator so
  // someone is reminded even when the manager doesn't pick an assignee.
  const assigneeId =
    d.assigneeId ??
    (cadenceGeneratesTask(d.cadence) ? await projectOwnerId(projectId) : null);
  const { recurringTaskId, taskId } = await generateObligationTask(
    projectId,
    { ...d, assigneeId },
    user.id
  );

  const [row] = await db
    .insert(licenseObligations)
    .values({
      projectId,
      rightsItemId,
      clauseRef: d.clauseRef?.trim() || null,
      kind: d.kind,
      cadence: d.cadence,
      firstDueDate: d.anchorDate ?? null,
      label: d.label,
      text: d.text,
      assigneeId,
      recurringTaskId,
      taskId,
      createdBy: user.id,
    })
    .returning({ id: licenseObligations.id });

  await revalidate(projectId);
  return {
    id: row.id,
    recurringTaskId: recurringTaskId ?? undefined,
    taskId: taskId ?? undefined,
  };
}

const updateSchema = z.object({
  clauseRef: z.string().trim().max(20).nullable().optional(),
  kind: kindEnum.optional(),
  label: z.string().trim().min(1).max(200).optional(),
  text: z.string().trim().min(1).max(4000).optional(),
  assigneeId: z.string().nullable().optional(),
});

/**
 * Edit an obligation's descriptive fields. Cadence is intentionally NOT editable
 * here — changing it would re-wire generated tasks; delete + recreate instead.
 */
export async function updateObligation(
  id: string,
  input: z.input<typeof updateSchema>
): Promise<{ error?: string }> {
  await requireRole("manager");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  const [row] = await db
    .update(licenseObligations)
    .set({
      ...(d.clauseRef !== undefined
        ? { clauseRef: d.clauseRef?.trim() || null }
        : {}),
      ...(d.kind !== undefined ? { kind: d.kind } : {}),
      ...(d.label !== undefined ? { label: d.label } : {}),
      ...(d.text !== undefined ? { text: d.text } : {}),
      ...(d.assigneeId !== undefined ? { assigneeId: d.assigneeId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(licenseObligations.id, id))
    .returning({ projectId: licenseObligations.projectId });
  if (row) await revalidate(row.projectId);
  return {};
}

/** Pause/resume an obligation; keeps any linked recurring rule in sync. */
export async function toggleObligationActive(
  id: string,
  active: boolean
): Promise<{ error?: string }> {
  await requireRole("manager");
  const [row] = await db
    .update(licenseObligations)
    .set({ isActive: active, updatedAt: new Date() })
    .where(eq(licenseObligations.id, id))
    .returning({
      projectId: licenseObligations.projectId,
      recurringTaskId: licenseObligations.recurringTaskId,
    });
  if (!row) return {};
  if (row.recurringTaskId) {
    await setRecurringTaskActive(row.recurringTaskId, active);
  }
  await revalidate(row.projectId);
  return {};
}

export async function deleteObligation(
  id: string
): Promise<{ error?: string }> {
  await requireRole("manager");
  const [row] = await db
    .delete(licenseObligations)
    .where(eq(licenseObligations.id, id))
    .returning({
      projectId: licenseObligations.projectId,
      recurringTaskId: licenseObligations.recurringTaskId,
    });
  if (!row) return {};
  // Stop future occurrences of a quarterly obligation's recurring rule.
  if (row.recurringTaskId) await deleteRecurringTask(row.recurringTaskId);
  await revalidate(row.projectId);
  return {};
}
