import "server-only";

import { and, asc, desc, eq, inArray, isNull, max, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  blockers,
  budgetItems,
  emailMessages,
  emailThreadProjects,
  phases,
  printRuns,
  projectMembers,
  projectRoles,
  projectUpdates,
  projects,
  rightsItems,
  tasks,
  units,
  user,
} from "@/lib/db/schema";
import type {
  PrintFundingStatus,
  ProjectFundingSummary,
} from "./print-funding";
import { listProjectFundingSummaries } from "./funding-queries";
import type { BookFormatEvidence } from "./book-format";
import { serializeActivityTimestamp } from "./activity-time";

export type ProjectListItem = {
  id: string;
  slug: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  latestInboundEmailAt: string | null;
  latestStatusUpdateAt: string | null;
  latestStatusUpdateBody: string | null;
  latestStatusUpdateAuthorName: string | null;
  latestStatusUpdateCreatedAt: string | null;
  kind: string | null;
  printFundingStatus: PrintFundingStatus;
  fundingSummary?: ProjectFundingSummary | null;
  bookFormat?: BookFormatEvidence | null;
  videoProductionMode: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  completeByDate: string | null;
  healthStatus: string | null;
  totalTasks: number;
  doneTasks: number;
  memberCount: number;
  blockerCount: number;
  activeReprintTitle: string | null;
  activeReprintStatus: string | null;
  activeReprintNumber: number | null;
  activeReprintDueDate: string | null;
  activeReprintTotalTasks: number;
  activeReprintDoneTasks: number;
};

/** All projects with task-progress + member-count rollups (one cheap pass). */
export async function listProjects(
  options: { includeDashboardActivity?: boolean } = {}
): Promise<ProjectListItem[]> {
  const rows = await db
    .select()
    .from(projects)
    .orderBy(desc(projects.createdAt));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const fundingSummariesPromise = listProjectFundingSummaries(ids);

  const taskCounts = await db
    .select({
      projectId: tasks.projectId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
    })
    .from(tasks)
    .where(inArray(tasks.projectId, ids))
    .groupBy(tasks.projectId);

  const memberCounts = await db
    .select({
      projectId: projectMembers.projectId,
      members: sql<number>`count(distinct ${projectMembers.userId})::int`,
    })
    .from(projectMembers)
    .where(inArray(projectMembers.projectId, ids))
    .groupBy(projectMembers.projectId);

  const [
    blockerCounts,
    reprintRows,
    rightsDeadlineRows,
    printFormatRows,
    inboundEmailActivityRows,
    statusUpdateActivityRows,
    latestStatusUpdateRows,
    fundingSummaries,
  ] = await Promise.all([
    db
      .select({
        projectId: blockers.projectId,
        count: sql<number>`count(*)::int`,
        critical: sql<number>`count(*) filter (where ${blockers.severity} = 'critical')::int`,
      })
      .from(blockers)
      .where(
        and(
          inArray(blockers.projectId, ids),
          eq(blockers.isResolved, false),
          ne(blockers.type, "overdue_dependency")
        )
      )
      .groupBy(blockers.projectId),
    db
      .select({
        id: printRuns.id,
        projectId: printRuns.projectId,
        title: printRuns.title,
        status: printRuns.status,
        printNumber: printRuns.printNumber,
        campaignDueDate: printRuns.campaignDueDate,
        createdAt: printRuns.createdAt,
      })
      .from(printRuns)
      .where(
        and(
          inArray(printRuns.projectId, ids),
          eq(printRuns.kind, "reprint"),
          sql`${printRuns.status} not in ('completed', 'cancelled')`
        )
      )
      .orderBy(desc(printRuns.createdAt)),
    db
      .select({
        projectId: rightsItems.projectId,
        completeByDate: rightsItems.completeByDate,
        formatPrint: rightsItems.formatPrint,
        formatEbook: rightsItems.formatEbook,
      })
      .from(rightsItems)
      .where(inArray(rightsItems.projectId, ids)),
    db
      .select({ projectId: printRuns.projectId })
      .from(printRuns)
      .where(inArray(printRuns.projectId, ids))
      .groupBy(printRuns.projectId),
    options.includeDashboardActivity
      ? db
          .select({
            projectId: emailThreadProjects.projectId,
            processedAt: max(emailMessages.createdAt),
          })
          .from(emailThreadProjects)
          .innerJoin(
            emailMessages,
            eq(emailMessages.threadId, emailThreadProjects.threadId)
          )
          .where(
            and(
              inArray(emailThreadProjects.projectId, ids),
              eq(emailMessages.direction, "inbound")
            )
          )
          .groupBy(emailThreadProjects.projectId)
      : Promise.resolve([]),
    options.includeDashboardActivity
      ? db
          .select({
            projectId: projectUpdates.projectId,
            updatedAt: max(projectUpdates.updatedAt),
          })
          .from(projectUpdates)
          .where(
            and(
              inArray(projectUpdates.projectId, ids),
              isNull(projectUpdates.parentId)
            )
          )
          .groupBy(projectUpdates.projectId)
      : Promise.resolve([]),
    options.includeDashboardActivity
      ? db
          .selectDistinctOn([projectUpdates.projectId], {
            projectId: projectUpdates.projectId,
            body: projectUpdates.body,
            authorName: user.name,
            createdAt: projectUpdates.createdAt,
          })
          .from(projectUpdates)
          .leftJoin(user, eq(user.id, projectUpdates.userId))
          .where(
            and(
              inArray(projectUpdates.projectId, ids),
              isNull(projectUpdates.parentId)
            )
          )
          .orderBy(projectUpdates.projectId, desc(projectUpdates.createdAt))
      : Promise.resolve([]),
    fundingSummariesPromise,
  ]);

  const taskMap = new Map(taskCounts.map((t) => [t.projectId, t]));
  const memberMap = new Map(memberCounts.map((m) => [m.projectId, m.members]));
  const blockerMap = new Map(blockerCounts.map((b) => [b.projectId, b]));
  const rightsMap = new Map(
    rightsDeadlineRows.map((rights) => [rights.projectId, rights])
  );
  const printWorkflowProjectIds = new Set(
    printFormatRows.map((row) => row.projectId)
  );
  const inboundEmailActivityMap = new Map(
    inboundEmailActivityRows.map((activity) => [
      activity.projectId,
      serializeActivityTimestamp(activity.processedAt),
    ])
  );
  const statusUpdateActivityMap = new Map(
    statusUpdateActivityRows.map((activity) => [
      activity.projectId,
      serializeActivityTimestamp(activity.updatedAt),
    ])
  );
  const latestStatusUpdateMap = new Map(
    latestStatusUpdateRows.map((update) => [update.projectId, update])
  );
  const fundingSummaryMap = new Map(
    fundingSummaries.map((summary) => [summary.projectId, summary])
  );
  const reprintMap = new Map<string, (typeof reprintRows)[number]>();
  for (const run of reprintRows) {
    if (!reprintMap.has(run.projectId)) reprintMap.set(run.projectId, run);
  }
  const activeReprintIds = [...reprintMap.values()].map((run) => run.id);
  const reprintTaskCounts =
    activeReprintIds.length > 0
      ? await db
          .select({
            printRunId: tasks.printRunId,
            total: sql<number>`count(*)::int`,
            done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
          })
          .from(tasks)
          .where(inArray(tasks.printRunId, activeReprintIds))
          .groupBy(tasks.printRunId)
      : [];
  const reprintTaskMap = new Map(
    reprintTaskCounts.map((counts) => [counts.printRunId, counts])
  );

  return rows.map((p) => {
    const blockerSummary = blockerMap.get(p.id);
    const blockerCount = blockerSummary?.count ?? 0;
    const activeReprint = reprintMap.get(p.id);
    const activeReprintTasks = activeReprint
      ? reprintTaskMap.get(activeReprint.id)
      : null;
    const latestStatusUpdate = latestStatusUpdateMap.get(p.id);
    const fundingSummary = fundingSummaryMap.get(p.id) ?? {
      needed: 0,
      committed: 0,
      received: 0,
      spent: 0,
      printNeeded: 0,
      printSecured: 0,
      currency: "USD",
    };
    const rights = rightsMap.get(p.id);
    const healthStatus = p.healthComputedAt
      ? (blockerSummary?.critical ?? 0) > 0
        ? "red"
        : blockerCount > 0
          ? "amber"
          : "green"
      : p.healthStatus;
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      latestInboundEmailAt: inboundEmailActivityMap.get(p.id) ?? null,
      latestStatusUpdateAt: statusUpdateActivityMap.get(p.id) ?? null,
      latestStatusUpdateBody: latestStatusUpdate?.body ?? null,
      latestStatusUpdateAuthorName: latestStatusUpdate?.authorName ?? null,
      latestStatusUpdateCreatedAt: serializeActivityTimestamp(
        latestStatusUpdate?.createdAt ?? null
      ),
      kind: p.kind,
      printFundingStatus: p.printFundingStatus,
      fundingSummary,
      bookFormat: {
        hasRightsRecord: Boolean(rights),
        formatPrint: rights?.formatPrint ?? false,
        formatEbook: rights?.formatEbook ?? false,
        hasPrintWorkflow:
          printWorkflowProjectIds.has(p.id) || fundingSummary.printNeeded > 0,
      },
      videoProductionMode: p.videoProductionMode,
      status: p.status,
      priority: p.priority,
      startDate: p.startDate,
      dueDate: p.dueDate,
      completeByDate: rights?.completeByDate ?? null,
      healthStatus,
      totalTasks: taskMap.get(p.id)?.total ?? 0,
      doneTasks: taskMap.get(p.id)?.done ?? 0,
      memberCount: memberMap.get(p.id) ?? 0,
      blockerCount,
      activeReprintTitle: activeReprint?.title ?? null,
      activeReprintStatus: activeReprint?.status ?? null,
      activeReprintNumber: activeReprint?.printNumber ?? null,
      activeReprintDueDate: activeReprint?.campaignDueDate ?? null,
      activeReprintTotalTasks: activeReprintTasks?.total ?? 0,
      activeReprintDoneTasks: activeReprintTasks?.done ?? 0,
    };
  });
}

/** Lightweight project header (for the workspace layout — no heavy joins). */
export async function getProjectHeader(slug: string) {
  const [project] = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      title: projects.title,
      status: projects.status,
      priority: projects.priority,
      dueDate: projects.dueDate,
      kind: projects.kind,
      printFundingStatus: projects.printFundingStatus,
      videoProductionMode: projects.videoProductionMode,
      rightsId: rightsItems.id,
      formatPrint: rightsItems.formatPrint,
      formatEbook: rightsItems.formatEbook,
      hasPrintWorkflow: sql<boolean>`exists (select 1 from ${printRuns} where ${printRuns.projectId} = ${projects.id}) or exists (select 1 from ${budgetItems} where ${budgetItems.projectId} = ${projects.id} and ${budgetItems.category} = 'print_ship' and ${budgetItems.amount} > 0)`,
    })
    .from(projects)
    .leftJoin(rightsItems, eq(rightsItems.projectId, projects.id))
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) return null;
  const {
    rightsId,
    formatPrint,
    formatEbook,
    hasPrintWorkflow,
    ...header
  } = project;
  return {
    ...header,
    bookFormat: {
      hasRightsRecord: Boolean(rightsId),
      formatPrint: formatPrint ?? false,
      formatEbook: formatEbook ?? false,
      hasPrintWorkflow,
    } satisfies BookFormatEvidence,
  };
}

export async function getProjectBySlug(slug: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) return null;

  const [phaseRows, taskRows, unitRows, memberRows] = await Promise.all([
    db
      .select()
      .from(phases)
      .where(eq(phases.projectId, project.id))
      .orderBy(asc(phases.orderIndex)),
    db.select().from(tasks).where(eq(tasks.projectId, project.id)),
    db
      .select()
      .from(units)
      .where(eq(units.projectId, project.id))
      .orderBy(asc(units.orderIndex)),
    db
      .select({
        id: projectMembers.id,
        userId: projectMembers.userId,
        userName: user.name,
        userImage: user.image,
        userEmail: user.email,
        roleId: projectRoles.id,
        roleKey: projectRoles.key,
        roleLabel: projectRoles.label,
        roleColor: projectRoles.color,
      })
      .from(projectMembers)
      .innerJoin(user, eq(user.id, projectMembers.userId))
      .innerJoin(projectRoles, eq(projectRoles.id, projectMembers.projectRoleId))
      .where(eq(projectMembers.projectId, project.id)),
  ]);

  return { project, phases: phaseRows, tasks: taskRows, units: unitRows, members: memberRows };
}

/** Active plan templates for the create-project picker. */
export async function listPlanTemplates() {
  const { planTemplates } = await import("@/lib/db/schema");
  return db
    .select({
      id: planTemplates.id,
      key: planTemplates.key,
      name: planTemplates.name,
      description: planTemplates.description,
    })
    .from(planTemplates)
    .where(eq(planTemplates.isActive, true))
    .orderBy(asc(planTemplates.name));
}

/** Active project roles (for member assignment + role chips). */
export async function listProjectRoles() {
  return db
    .select()
    .from(projectRoles)
    .where(eq(projectRoles.isActive, true))
    .orderBy(asc(projectRoles.sortOrder));
}

/** Lightweight user directory (non-bot, active) for assignment dropdowns. */
export async function listAssignableUsers() {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(and(eq(user.isBot, false), eq(user.isActive, true)))
    .orderBy(asc(user.name));
}

// ── Cross-project rollups (single grouped pass each — for the Portfolio dashboard) ──

export type ProjectBudgetTotal = {
  projectId: string;
  needed: number;
  secured: number;
  spent: number;
  currency: string;
};

/** Σ budget per project in one grouped pass (numeric→float8). */
export async function listProjectBudgetTotals(): Promise<ProjectBudgetTotal[]> {
  return db
    .select({
      projectId: budgetItems.projectId,
      needed: sql<number>`coalesce(sum(${budgetItems.amount}), 0)::float8`,
      secured: sql<number>`coalesce(sum(${budgetItems.amountSecured}), 0)::float8`,
      spent: sql<number>`coalesce(sum(${budgetItems.amountSpent}), 0)::float8`,
      currency: sql<string>`coalesce(max(${budgetItems.currency}), 'USD')`,
    })
    .from(budgetItems)
    .groupBy(budgetItems.projectId);
}

export type ProjectRightsStatus = {
  projectId: string;
  overallStatus: string;
  completeByDate: string | null;
};

/** Rights overall status per project (read-only; no get-or-create side effects). */
export async function listProjectRightsStatus(): Promise<ProjectRightsStatus[]> {
  return db
    .select({
      projectId: rightsItems.projectId,
      overallStatus: rightsItems.overallStatus,
      completeByDate: rightsItems.completeByDate,
    })
    .from(rightsItems);
}

export type ProjectBlockerSummary = {
  projectId: string;
  total: number;
  critical: number;
  warning: number;
};

/** Open-blocker counts split by severity, per project, in one grouped pass. */
export async function listProjectBlockerSummaries(): Promise<
  ProjectBlockerSummary[]
> {
  return db
    .select({
      projectId: blockers.projectId,
      total: sql<number>`count(*)::int`,
      critical: sql<number>`count(*) filter (where ${blockers.severity} = 'critical')::int`,
      warning: sql<number>`count(*) filter (where ${blockers.severity} = 'warning')::int`,
    })
    .from(blockers)
    .where(
      and(
        eq(blockers.isResolved, false),
        ne(blockers.type, "overdue_dependency")
      )
    )
    .groupBy(blockers.projectId);
}

export type UserCapacity = { userId: string; name: string; weeklyHours: number };

/** Active (non-bot) users with their weekly capacity, for utilization views. */
export async function listUserCapacity(): Promise<UserCapacity[]> {
  return db
    .select({ userId: user.id, name: user.name, weeklyHours: user.weeklyHours })
    .from(user)
    .where(and(eq(user.isBot, false), eq(user.isActive, true)))
    .orderBy(asc(user.name));
}
