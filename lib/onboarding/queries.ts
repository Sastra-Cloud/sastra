import "server-only";
import { and, eq, gt, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitations, projects, standupParticipants, standupRuns, standups, tasks, user, workspaceSettings } from "@/lib/db/schema";
import type { OnboardingSignals } from "./steps";
export type { OnboardingSignals } from "./steps";

/** Saved outcomes, never checklist clicks. Only counts and available destinations leave the server. */
export async function getOnboardingSignals(userId: string): Promise<OnboardingSignals> {
  const [taskRows, completed, participation, workspace, projectRows, teammates, invites, assigned] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int`, done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int` }).from(tasks).where(eq(tasks.assignedTo, userId)),
    db.select({ n: sql<number>`count(*)::int` }).from(standupRuns).where(and(eq(standupRuns.userId, userId), isNotNull(standupRuns.completedAt))),
    db.select({ id: standups.id }).from(standupParticipants).innerJoin(standups, eq(standups.id, standupParticipants.standupId)).where(and(eq(standupParticipants.userId, userId), eq(standups.isActive, true))).limit(1),
    db.select({ confirmed: workspaceSettings.setupCompletedAt }).from(workspaceSettings).where(eq(workspaceSettings.id, "workspace")).limit(1),
    db.select({ slug: projects.slug, kind: projects.kind }).from(projects).orderBy(sql`case when ${projects.status} in ('completed', 'cancelled') then 1 else 0 end`, projects.createdAt, projects.id),
    db.select({ id: user.id }).from(user).where(and(ne(user.id, userId), eq(user.isActive, true), eq(user.isBot, false))).limit(1),
    db.select({ id: invitations.id }).from(invitations).where(and(isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date()))).limit(1),
    db.select({ id: tasks.id }).from(tasks).where(and(isNotNull(tasks.assignedTo), isNotNull(tasks.projectId))).limit(1),
  ]);
  return {
    completedTaskCount: taskRows[0]?.done ?? 0,
    assignedTaskCount: (taskRows[0]?.total ?? 0) - (taskRows[0]?.done ?? 0),
    standupCount: completed[0]?.n ?? 0,
    hasStandup: participation.length > 0,
    workspaceConfirmed: !!workspace[0]?.confirmed,
    projectSlug: projectRows[0]?.slug ?? null,
    budgetProjectSlug: projectRows.find(p => p.kind === "book")?.slug ?? null,
    hasTeammate: teammates.length > 0 || invites.length > 0,
    hasAssignedWork: assigned.length > 0,
  };
}
