"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import {
  recomputeAllBlockers,
  recomputeProjectBlockers,
} from "@/lib/blockers/engine";
import { getCronRuns, recordCronRun } from "@/lib/cron/runs";
import { reconcileSatisfiedRightsTasks } from "@/lib/rights/task-reconciliation";

/** Manual single-project refresh throttle — recomputes are cheap but not free. */
const PROJECT_THROTTLE_MS = 2 * 60_000;
/** Manual recompute-all throttle (also runs daily via cron). */
const ALL_THROTTLE_MS = 10 * 60_000;
const MANUAL_ALL_NAME = "manual-recompute";

/**
 * Recompute one project's blockers/health on demand (manager action from the
 * project overview). Throttled: within the window it reports `skipped` instead
 * of re-running, so the button can't be hammered.
 */
export async function refreshProjectHealth(
  projectId: string
): Promise<{ health?: string; skipped?: boolean; error?: string }> {
  const { user } = await requireRole("manager");
  const [project] = await db
    .select({ slug: projects.slug, healthComputedAt: projects.healthComputedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return { error: "Project not found." };

  const reconciledTasks = await reconcileSatisfiedRightsTasks(projectId, user.id);
  if (
    reconciledTasks.length === 0 &&
    project.healthComputedAt &&
    Date.now() - project.healthComputedAt.getTime() < PROJECT_THROTTLE_MS
  ) {
    return { skipped: true };
  }

  const { health } = await recomputeProjectBlockers(projectId);
  revalidatePath(`/projects/${project.slug}`);
  revalidatePath("/projects");
  revalidatePath("/overview");
  revalidatePath("/dashboard");
  return { health };
}

/** Recompute every project on demand (manager action from /overview). */
export async function refreshAllHealth(): Promise<{
  projects?: number;
  skipped?: boolean;
  error?: string;
}> {
  await requireRole("manager");
  const runs = await getCronRuns();
  const last = runs.find((r) => r.name === MANUAL_ALL_NAME);
  if (last && Date.now() - last.lastRunAt.getTime() < ALL_THROTTLE_MS) {
    return { skipped: true };
  }

  const count = await recomputeAllBlockers();
  await recordCronRun(MANUAL_ALL_NAME, true, `${count} projects (manual)`);
  revalidatePath("/overview");
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { projects: count };
}
