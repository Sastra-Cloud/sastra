import "server-only";

import {
  and,
  asc,
  eq,
  gte,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import {
  phases,
  printRuns,
  projects,
  recurringTasks,
  licenseObligations,
  taskComments,
  taskDependencies,
  taskDriveFiles,
  timeEntries,
  tasks,
  units,
  user,
  budgetApprovalAssignments,
  budgetApprovalRequests,
  emailTaskSuggestions,
} from "@/lib/db/schema";
import { nextDueDate, type Frequency } from "@/lib/recurring/schedule";
import { daysUntil } from "@/lib/format";
import { getTeamTrackedSeconds } from "./time-queries";

const todayIso = () => new Date().toISOString().slice(0, 10);

export type RecurringTaskRow = {
  id: string;
  title: string;
  description: string | null;
  frequency: string;
  anchorDate: string;
  endDate: string | null;
  isActive: boolean;
  priority: string;
  assigneeId: string | null;
  assigneeName: string | null;
  sourceObligationId: string | null;
  sourceClauseRef: string | null;
  nextDue: string | null;
};

/** Recurring rules for a project, with the next computed due date. */
export async function listRecurringTasks(
  projectId: string
): Promise<RecurringTaskRow[]> {
  const rows = await db
    .select({
      id: recurringTasks.id,
      title: recurringTasks.title,
      description: recurringTasks.description,
      frequency: recurringTasks.frequency,
      anchorDate: recurringTasks.anchorDate,
      endDate: recurringTasks.endDate,
      isActive: recurringTasks.isActive,
      priority: recurringTasks.priority,
      assigneeId: recurringTasks.assigneeId,
      assigneeName: user.name,
      sourceObligationId: licenseObligations.id,
      sourceClauseRef: licenseObligations.clauseRef,
    })
    .from(recurringTasks)
    .leftJoin(user, eq(user.id, recurringTasks.assigneeId))
    .leftJoin(
      licenseObligations,
      eq(licenseObligations.recurringTaskId, recurringTasks.id)
    )
    .where(eq(recurringTasks.projectId, projectId))
    .orderBy(asc(recurringTasks.createdAt));

  return rows.map((r) => ({
    ...r,
    nextDue: r.isActive
      ? nextDueDate(r.anchorDate, r.frequency as Frequency, todayIso(), r.endDate)
      : null,
  }));
}

export type TaskRow = {
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  isMilestone: boolean;
  rank: number;
  estimateHours: string | null;
  updatedAt: Date;
  assignedTo: string | null;
  assigneeName: string | null;
  printRunId: string | null;
  printPaymentId: string | null;
  printRunTitle: string | null;
  printRunKind: string | null;
  printNumber: number | null;
  phaseId: string | null;
  phaseName: string | null;
  unitId: string | null;
  unitName: string | null;
  driveFolderId: string | null;
  driveFolderName: string | null;
  driveFolderUrl: string | null;
  driveFileCount: number;
  driveFileName: string | null;
  driveFileUrl: string | null;
  sourceRecurringTaskId: string | null;
  approvalAssignmentId: string | null;
  approvalRequestId: string | null;
  approvalDecision: "pending" | "approved" | "changes_requested" | null;
  approvalRequestStatus:
    | "pending"
    | "approved"
    | "changes_requested"
    | "superseded"
    | null;
  approvalProjectSlug: string | null;
  sourceEmailSuggestionId: string | null;
  sourceEmailThreadId: string | null;
  sourceEmailUrl: string | null;
  sourceEmailUrlLabel: string | null;
  sourceEmailSubject: string | null;
  sourceEmailSender: string | null;
  sourceEmailMode: "explicit_auto" | "implicit_review" | null;
};

const baseSelect = {
  id: tasks.id,
  projectId: tasks.projectId,
  title: tasks.title,
  description: tasks.description,
  status: tasks.status,
  priority: tasks.priority,
  dueDate: tasks.dueDate,
  isMilestone: tasks.isMilestone,
  rank: tasks.rank,
  estimateHours: tasks.estimateHours,
  updatedAt: tasks.updatedAt,
  assignedTo: tasks.assignedTo,
  assigneeName: user.name,
  printRunId: tasks.printRunId,
  printPaymentId: tasks.printPaymentId,
  printRunTitle: printRuns.title,
  printRunKind: printRuns.kind,
  printNumber: printRuns.printNumber,
  phaseId: tasks.phaseId,
  phaseName: phases.name,
  unitId: tasks.unitId,
  unitName: units.name,
  driveFolderId: tasks.driveFolderId,
  driveFolderName: tasks.driveFolderName,
  driveFolderUrl: tasks.driveFolderUrl,
  driveFileCount: sql<number>`(select count(*)::int from ${taskDriveFiles} where ${taskDriveFiles.taskId} = ${tasks.id})`,
  driveFileName: sql<string | null>`(
    select ${taskDriveFiles.name}
    from ${taskDriveFiles}
    where ${taskDriveFiles.taskId} = ${tasks.id}
    order by ${taskDriveFiles.createdAt} asc, ${taskDriveFiles.id} asc
    limit 1
  )`,
  driveFileUrl: sql<string | null>`(
    select ${taskDriveFiles.url}
    from ${taskDriveFiles}
    where ${taskDriveFiles.taskId} = ${tasks.id}
    order by ${taskDriveFiles.createdAt} asc, ${taskDriveFiles.id} asc
    limit 1
  )`,
  sourceRecurringTaskId: tasks.sourceRecurringTaskId,
  approvalAssignmentId: sql<string | null>`(
    select ${budgetApprovalAssignments.id}
    from ${budgetApprovalAssignments}
    where ${budgetApprovalAssignments.taskId} = ${tasks.id}
    limit 1
  )`,
  approvalRequestId: sql<string | null>`(
    select ${budgetApprovalAssignments.requestId}
    from ${budgetApprovalAssignments}
    where ${budgetApprovalAssignments.taskId} = ${tasks.id}
    limit 1
  )`,
  approvalDecision: sql<TaskRow["approvalDecision"]>`(
    select ${budgetApprovalAssignments.decision}
    from ${budgetApprovalAssignments}
    where ${budgetApprovalAssignments.taskId} = ${tasks.id}
    limit 1
  )`,
  approvalRequestStatus: sql<TaskRow["approvalRequestStatus"]>`(
    select ${budgetApprovalRequests.status}
    from ${budgetApprovalAssignments}
    inner join ${budgetApprovalRequests}
      on ${budgetApprovalRequests.id} = ${budgetApprovalAssignments.requestId}
    where ${budgetApprovalAssignments.taskId} = ${tasks.id}
    limit 1
  )`,
  approvalProjectSlug: sql<string | null>`(
    select ${projects.slug}
    from ${budgetApprovalAssignments}
    inner join ${budgetApprovalRequests}
      on ${budgetApprovalRequests.id} = ${budgetApprovalAssignments.requestId}
    inner join ${projects}
      on ${projects.id} = ${budgetApprovalRequests.projectId}
    where ${budgetApprovalAssignments.taskId} = ${tasks.id}
    limit 1
  )`,
  sourceEmailSuggestionId: sql<string | null>`(
    select ${emailTaskSuggestions.id}
    from ${emailTaskSuggestions}
    where ${emailTaskSuggestions.createdTaskId} = ${tasks.id}
    limit 1
  )`,
  sourceEmailThreadId: sql<string | null>`(
    select ${emailTaskSuggestions.threadId}
    from ${emailTaskSuggestions}
    where ${emailTaskSuggestions.createdTaskId} = ${tasks.id}
    limit 1
  )`,
  sourceEmailUrl: sql<string | null>`(
    select ${emailTaskSuggestions.primaryUrl}
    from ${emailTaskSuggestions}
    where ${emailTaskSuggestions.createdTaskId} = ${tasks.id}
    limit 1
  )`,
  sourceEmailUrlLabel: sql<string | null>`(
    select ${emailTaskSuggestions.primaryUrlLabel}
    from ${emailTaskSuggestions}
    where ${emailTaskSuggestions.createdTaskId} = ${tasks.id}
    limit 1
  )`,
  sourceEmailSubject: sql<string | null>`(
    select ${emailTaskSuggestions.sourceSubject}
    from ${emailTaskSuggestions}
    where ${emailTaskSuggestions.createdTaskId} = ${tasks.id}
    limit 1
  )`,
  sourceEmailSender: sql<string | null>`(
    select ${emailTaskSuggestions.sourceSender}
    from ${emailTaskSuggestions}
    where ${emailTaskSuggestions.createdTaskId} = ${tasks.id}
    limit 1
  )`,
  sourceEmailMode: sql<TaskRow["sourceEmailMode"]>`(
    select ${emailTaskSuggestions.mode}
    from ${emailTaskSuggestions}
    where ${emailTaskSuggestions.createdTaskId} = ${tasks.id}
    limit 1
  )`,
};

/** All tasks for a project, joined with assignee/phase/unit names. */
export async function getProjectTasks(
  projectId: string,
  printRunId?: string
): Promise<TaskRow[]> {
  return db
    .select(baseSelect)
    .from(tasks)
    .leftJoin(user, eq(user.id, tasks.assignedTo))
    .leftJoin(printRuns, eq(printRuns.id, tasks.printRunId))
    .leftJoin(phases, eq(phases.id, tasks.phaseId))
    .leftJoin(units, eq(units.id, tasks.unitId))
    .where(
      printRunId
        ? and(eq(tasks.projectId, projectId), eq(tasks.printRunId, printRunId))
        : eq(tasks.projectId, projectId)
    )
    .orderBy(asc(tasks.rank), asc(tasks.orderIndex), asc(tasks.createdAt));
}

export type PipelineData = {
  units: { id: string; name: string }[];
  phases: { id: string; name: string; color: string | null }[];
  cells: TaskRow[]; // per-chapter tasks (unitId + phaseId set)
};

/** Chapter × stage matrix data for the Pipeline view. */
export async function getProjectPipeline(
  projectId: string
): Promise<PipelineData> {
  const [unitRows, phaseRows, cellRows] = await Promise.all([
    db
      .select({ id: units.id, name: units.name })
      .from(units)
      .where(eq(units.projectId, projectId))
      .orderBy(asc(units.orderIndex)),
    db
      .select({ id: phases.id, name: phases.name, color: phases.color })
      .from(phases)
      .where(eq(phases.projectId, projectId))
      .orderBy(asc(phases.orderIndex)),
    db
      .select(baseSelect)
      .from(tasks)
      .leftJoin(user, eq(user.id, tasks.assignedTo))
      .leftJoin(printRuns, eq(printRuns.id, tasks.printRunId))
      .leftJoin(phases, eq(phases.id, tasks.phaseId))
      .leftJoin(units, eq(units.id, tasks.unitId))
      .where(
        and(eq(tasks.projectId, projectId), isNotNull(tasks.unitId))
      ),
  ]);
  return { units: unitRows, phases: phaseRows, cells: cellRows };
}

export type MyTaskRow = TaskRow & {
  projectSlug: string | null;
  projectTitle: string | null;
};

export type MyWorkTaskRow = MyTaskRow & {
  completedAt: Date | null;
  trackedSeconds: number;
};

/** A user's open tasks (not done) across all projects + standalone, rank-ordered. */
export async function getMyTasks(userId: string): Promise<MyTaskRow[]> {
  return db
    .select({
      ...baseSelect,
      projectSlug: projects.slug,
      projectTitle: projects.title,
    })
    .from(tasks)
    .leftJoin(user, eq(user.id, tasks.assignedTo))
    .leftJoin(printRuns, eq(printRuns.id, tasks.printRunId))
    .leftJoin(phases, eq(phases.id, tasks.phaseId))
    .leftJoin(units, eq(units.id, tasks.unitId))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.assignedTo, userId), sql`${tasks.status} <> 'done'`))
    .orderBy(asc(tasks.rank), asc(tasks.dueDate));
}

/**
 * A user's full personal-work surface: every open task plus recently completed
 * work for the board and daily progress recap.
 */
export async function getMyWorkTasks(
  userId: string,
  recentDoneSince = new Date(Date.now() - 7 * 86_400_000)
): Promise<MyWorkTaskRow[]> {
  return db
    .select({
      ...baseSelect,
      projectSlug: projects.slug,
      projectTitle: projects.title,
      completedAt: tasks.completedAt,
      trackedSeconds: sql<number>`coalesce((
        select sum(${timeEntries.durationSeconds})
        from ${timeEntries}
        where ${timeEntries.taskId} = ${tasks.id}
      ), 0)::int`,
    })
    .from(tasks)
    .leftJoin(user, eq(user.id, tasks.assignedTo))
    .leftJoin(printRuns, eq(printRuns.id, tasks.printRunId))
    .leftJoin(phases, eq(phases.id, tasks.phaseId))
    .leftJoin(units, eq(units.id, tasks.unitId))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        eq(tasks.assignedTo, userId),
        or(
          ne(tasks.status, "done"),
          and(eq(tasks.status, "done"), gte(tasks.completedAt, recentDoneSince))
        )
      )
    )
    .orderBy(asc(tasks.rank), asc(tasks.dueDate));
}

/** All open (not-done) assigned tasks across the team, for the workload view. */
export async function getOpenAssignedTasks(): Promise<MyTaskRow[]> {
  return db
    .select({
      ...baseSelect,
      projectSlug: projects.slug,
      projectTitle: projects.title,
    })
    .from(tasks)
    .leftJoin(user, eq(user.id, tasks.assignedTo))
    .leftJoin(printRuns, eq(printRuns.id, tasks.printRunId))
    .leftJoin(phases, eq(phases.id, tasks.phaseId))
    .leftJoin(units, eq(units.id, tasks.unitId))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(sql`${tasks.assignedTo} is not null`, sql`${tasks.status} <> 'done'`))
    .orderBy(asc(tasks.rank), asc(tasks.dueDate));
}

export type TaskComment = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string | null;
  authorName: string | null;
  authorImage: string | null;
};

/** Comments on a task, oldest first, joined with author name/avatar. */
export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  return db
    .select({
      id: taskComments.id,
      content: taskComments.content,
      createdAt: taskComments.createdAt,
      updatedAt: taskComments.updatedAt,
      userId: taskComments.userId,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(taskComments)
    .leftJoin(user, eq(user.id, taskComments.userId))
    .where(eq(taskComments.taskId, taskId))
    .orderBy(asc(taskComments.createdAt));
}

/** Standalone (project-less) tasks created by / assigned to a user. */
export async function getStandaloneTasks(userId: string): Promise<TaskRow[]> {
  return db
    .select(baseSelect)
    .from(tasks)
    .leftJoin(user, eq(user.id, tasks.assignedTo))
    .leftJoin(printRuns, eq(printRuns.id, tasks.printRunId))
    .leftJoin(phases, eq(phases.id, tasks.phaseId))
    .leftJoin(units, eq(units.id, tasks.unitId))
    .where(and(isNull(tasks.projectId), eq(tasks.assignedTo, userId)))
    .orderBy(asc(tasks.rank), asc(tasks.dueDate));
}

export type WeeklyCount = { week: string; count: number };

/** Tasks completed per ISO week over the last `weeks` (team-wide or one project). */
export async function weeklyTaskCompletions(
  projectId?: string,
  weeks = 10
): Promise<WeeklyCount[]> {
  return db
    .select({
      week: sql<string>`to_char(date_trunc('week', ${tasks.completedAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(tasks)
    .where(
      and(
        sql`${tasks.completedAt} is not null`,
        sql`${tasks.completedAt} >= now() - (${weeks} * interval '1 week')`,
        projectId ? eq(tasks.projectId, projectId) : sql`true`
      )
    )
    .groupBy(sql`date_trunc('week', ${tasks.completedAt})`)
    .orderBy(sql`date_trunc('week', ${tasks.completedAt})`);
}

export type DependencyEdge = {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  dependsOnTaskId: string;
  blockedByTitle: string;
  blockedByStatus: string;
  blockedByDueDate: string | null;
};

/** Dated milestone tasks across all projects (for portfolio timeline diamonds). */
export async function listProjectMilestones(): Promise<
  { projectId: string; title: string; dueDate: string }[]
> {
  const rows = await db
    .select({
      projectId: tasks.projectId,
      title: tasks.title,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .where(and(eq(tasks.isMilestone, true), isNotNull(tasks.dueDate)));
  return rows.filter(
    (r): r is { projectId: string; title: string; dueDate: string } =>
      r.projectId !== null && r.dueDate !== null
  );
}

/** Dependency edges for a project's tasks (dependent → predecessor details). */
export async function getProjectDependencyEdges(
  projectId: string
): Promise<DependencyEdge[]> {
  const dep = alias(tasks, "dep");
  return db
    .select({
      taskId: tasks.id,
      taskTitle: tasks.title,
      taskStatus: tasks.status,
      dependsOnTaskId: taskDependencies.dependsOnTaskId,
      blockedByTitle: dep.title,
      blockedByStatus: dep.status,
      blockedByDueDate: dep.dueDate,
    })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
    .innerJoin(dep, eq(dep.id, taskDependencies.dependsOnTaskId))
    .where(eq(tasks.projectId, projectId));
}

export type TeamLoadPerson = {
  userId: string;
  name: string;
  open: number;
  overdue: number;
  soon: number;
  estHours: number;
  weeklyHours: number;
  /** Actual tracked seconds over the last 7 days (0 if none). */
  trackedSeconds: number;
};

/**
 * Per-person open-task load + capacity for the Team-load / Workload views. Returns
 * a row for EVERY active (non-bot) user — including those with zero open tasks, so
 * they are valid reassignment targets — plus any inactive assignee who still holds
 * open tasks. "soon" = due within 7 days (and not overdue).
 */
export async function getTeamLoad(): Promise<TeamLoadPerson[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [openTasks, capacities, tracked] = await Promise.all([
    getOpenAssignedTasks(),
    db
      .select({ userId: user.id, name: user.name, weeklyHours: user.weeklyHours })
      .from(user)
      .where(and(eq(user.isBot, false), eq(user.isActive, true)))
      .orderBy(asc(user.name)),
    getTeamTrackedSeconds(since),
  ]);

  const byUser = new Map<string, TeamLoadPerson>();
  for (const c of capacities) {
    byUser.set(c.userId, {
      userId: c.userId,
      name: c.name,
      open: 0,
      overdue: 0,
      soon: 0,
      estHours: 0,
      weeklyHours: c.weeklyHours,
      trackedSeconds: tracked.get(c.userId) ?? 0,
    });
  }
  for (const t of openTasks) {
    if (!t.assignedTo) continue;
    let e = byUser.get(t.assignedTo);
    if (!e) {
      e = {
        userId: t.assignedTo,
        name: t.assigneeName ?? "Unknown",
        open: 0,
        overdue: 0,
        soon: 0,
        estHours: 0,
        weeklyHours: 0,
        trackedSeconds: tracked.get(t.assignedTo) ?? 0,
      };
      byUser.set(t.assignedTo, e);
    }
    e.open += 1;
    e.estHours += Number(t.estimateHours ?? 0);
    const d = daysUntil(t.dueDate);
    if (d !== null && d < 0) e.overdue += 1;
    else if (d !== null && d <= 7) e.soon += 1;
  }
  return [...byUser.values()];
}

export type OpenTaskBlocker = { blockedByTitle: string; blockedByStatus: string };

/**
 * Team-wide map of open (not-done) tasks that are blocked by an unfinished
 * dependency → the blocking task's title/status. First unfinished blocker wins.
 */
export async function getOpenTaskBlockers(): Promise<Map<string, OpenTaskBlocker>> {
  const dep = alias(tasks, "dep");
  const rows = await db
    .select({
      taskId: tasks.id,
      blockedByTitle: dep.title,
      blockedByStatus: dep.status,
    })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
    .innerJoin(dep, eq(dep.id, taskDependencies.dependsOnTaskId))
    .where(and(sql`${tasks.status} <> 'done'`, sql`${dep.status} <> 'done'`));

  const map = new Map<string, OpenTaskBlocker>();
  for (const r of rows) {
    if (!map.has(r.taskId)) {
      map.set(r.taskId, {
        blockedByTitle: r.blockedByTitle,
        blockedByStatus: r.blockedByStatus,
      });
    }
  }
  return map;
}
