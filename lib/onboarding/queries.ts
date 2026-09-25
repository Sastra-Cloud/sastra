import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { standupRuns, tasks } from "@/lib/db/schema";

/** Cheap, data-derived signals for the dashboard onboarding checklist. */
export type OnboardingSignals = {
  completedTaskCount: number;
  standupCount: number;
};

export async function getOnboardingSignals(
  userId: string
): Promise<OnboardingSignals> {
  const [taskRow, standupRow] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.assignedTo, userId), eq(tasks.status, "done"))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(standupRuns)
      .where(
        and(eq(standupRuns.userId, userId), isNotNull(standupRuns.completedAt))
      ),
  ]);
  return {
    completedTaskCount: taskRow[0]?.n ?? 0,
    standupCount: standupRow[0]?.n ?? 0,
  };
}
