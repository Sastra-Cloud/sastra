"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { phases, projects } from "@/lib/db/schema";
import { logActivity } from "@/lib/activity/log";
import { addDaysYmd } from "@/lib/timeline/scale";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function revalidateProject(projectId: string) {
  const [p] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!p) return;
  revalidatePath(`/projects/${p.slug}`);
  revalidatePath(`/projects/${p.slug}/tasks`);
  revalidatePath("/overview");
}

const datesSchema = z.object({
  startDate: ymd.nullable().optional(),
  dueDate: ymd.nullable().optional(),
});

/** Set/clear a phase's start/due dates (Gantt resize or form edit). */
export async function updatePhaseDates(
  phaseId: string,
  input: z.infer<typeof datesSchema>
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const d = datesSchema.parse(input);
  const [row] = await db
    .update(phases)
    .set({
      ...(d.startDate !== undefined ? { startDate: d.startDate } : {}),
      ...(d.dueDate !== undefined ? { dueDate: d.dueDate } : {}),
    })
    .where(eq(phases.id, phaseId))
    .returning({ projectId: phases.projectId, name: phases.name });
  if (!row) return { error: "Phase not found." };
  await logActivity({
    actorId: user.id,
    projectId: row.projectId,
    entityType: "project",
    action: "phase",
    summary: `Rescheduled phase "${row.name}"`,
  });
  await revalidateProject(row.projectId);
  return {};
}

/**
 * Shift a phase's dates by whole days (Gantt drag). With `cascade`, later
 * phases (higher orderIndex) that have any dates shift by the same delta so
 * the plan moves as a block. Undo = call again with the negated delta.
 */
export async function shiftPhase(
  phaseId: string,
  deltaDays: number,
  cascade: boolean
): Promise<{ error?: string; shifted?: number }> {
  const { user } = await requireRole("manager");
  const delta = Math.trunc(deltaDays);
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 3650) {
    return { error: "Invalid shift." };
  }
  const [phase] = await db
    .select()
    .from(phases)
    .where(eq(phases.id, phaseId))
    .limit(1);
  if (!phase) return { error: "Phase not found." };

  const targets = cascade
    ? [
        phase,
        ...(await db
          .select()
          .from(phases)
          .where(
            and(
              eq(phases.projectId, phase.projectId),
              gt(phases.orderIndex, phase.orderIndex)
            )
          )),
      ]
    : [phase];

  let shifted = 0;
  await db.transaction(async (tx) => {
    for (const p of targets) {
      if (!p.startDate && !p.dueDate) continue;
      await tx
        .update(phases)
        .set({
          startDate: p.startDate ? addDaysYmd(p.startDate, delta) : null,
          dueDate: p.dueDate ? addDaysYmd(p.dueDate, delta) : null,
        })
        .where(eq(phases.id, p.id));
      shifted += 1;
    }
  });

  await logActivity({
    actorId: user.id,
    projectId: phase.projectId,
    entityType: "project",
    action: "phase",
    summary: `Shifted ${shifted} phase${shifted === 1 ? "" : "s"} by ${delta > 0 ? "+" : ""}${delta}d`,
  });
  await revalidateProject(phase.projectId);
  return { shifted };
}
