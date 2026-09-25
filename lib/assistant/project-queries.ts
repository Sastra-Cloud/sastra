import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { readOnlyDb } from "@/lib/db/read-only";
import {
  blockers,
  printRuns,
  projectMembers,
  projectRoles,
  projects,
  rightsHolders,
  rightsItems,
  tasks,
  user,
} from "@/lib/db/schema";
import {
  PRINT_FUNDING_STATUSES,
  type PrintFundingStatus,
} from "@/lib/projects/print-funding";

const MAX_ROWS = 50;
const DEFAULT_ROWS = 25;
const MAX_RESULT_BYTES = 32 * 1024;

const PROJECT_STATUSES = [
  "proposal",
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
] as const;
const PROJECT_KINDS = [
  "book",
  "article",
  "podcast",
  "video_series",
  "other",
] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const HEALTHS = ["red", "amber", "green", "unknown"] as const;
const RIGHTS_STATES = ["complete", "incomplete", "missing"] as const;
const LICENSE_STATES = ["complete", "incomplete", "not_needed"] as const;
const DEADLINE_STATES = ["overdue", "upcoming", "unscheduled"] as const;
const DETAILS = ["summary", "team", "rights", "operations", "full"] as const;
const SORTS = [
  "title",
  "due_soonest",
  "recent",
  "health",
  "print_funding",
] as const;

type ProjectStatus = (typeof PROJECT_STATUSES)[number];
type ProjectKind = (typeof PROJECT_KINDS)[number];
type Priority = (typeof PRIORITIES)[number];
type Health = (typeof HEALTHS)[number];
type RightsState = (typeof RIGHTS_STATES)[number];
type LicenseState = (typeof LICENSE_STATES)[number];
type DeadlineState = (typeof DEADLINE_STATES)[number];
type Detail = (typeof DETAILS)[number];
type Sort = (typeof SORTS)[number];

export type ProjectPortfolioQueryInput = {
  projectText?: unknown;
  statuses?: unknown;
  kinds?: unknown;
  printFundingStatuses?: unknown;
  priorities?: unknown;
  sourceLanguage?: unknown;
  targetLanguage?: unknown;
  memberName?: unknown;
  health?: unknown;
  dueBefore?: unknown;
  dueAfter?: unknown;
  deadlineState?: unknown;
  rightsHolder?: unknown;
  mouHolder?: unknown;
  licenseHolder?: unknown;
  rightsState?: unknown;
  licenseState?: unknown;
  scope?: unknown;
  sort?: unknown;
  detail?: unknown;
  limit?: unknown;
};

export type NormalizedProjectPortfolioQuery = {
  projectText?: string;
  statuses: ProjectStatus[];
  kinds: ProjectKind[];
  printFundingStatuses: PrintFundingStatus[];
  priorities: Priority[];
  sourceLanguage?: string;
  targetLanguage?: string;
  memberName?: string;
  health: Health[];
  dueBefore?: string;
  dueAfter?: string;
  deadlineState?: DeadlineState;
  rightsHolder?: string;
  mouHolder?: string;
  licenseHolder?: string;
  rightsState?: RightsState;
  licenseState?: LicenseState;
  scope: "open" | "all";
  sort: Sort;
  detail: Detail;
  limit: number;
};

export type ProjectPortfolioRole =
  | "super_admin"
  | "admin"
  | "manager"
  | "member";

export type BaseProjectRow = {
  id: string;
  slug: string;
  title: string;
  kind: ProjectKind | null;
  printFundingStatus: PrintFundingStatus;
  status: ProjectStatus;
  priority: Priority;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  description: string | null;
  dueDate: string | null;
  effectiveDeadline: string | null;
  healthStatus: string | null;
  healthComputedAt: Date | null;
  rightsId: string | null;
  agreementType: "mou_only" | "mou_plus_license" | "license_only" | null;
  mouStatus: "not_needed" | "not_started" | "in_progress" | "signed" | null;
  licenseStatus:
    | "not_needed"
    | "not_started"
    | "in_progress"
    | "signed"
    | null;
  rightsOverall: "none" | "in_progress" | "complete" | null;
  rightsCompleteBy: string | null;
  mouHolder: string | null;
  licenseHolder: string | null;
};

export type ProjectQuerySource = {
  listBase(
    query: NormalizedProjectPortfolioQuery,
    today: string,
    includeOperations: boolean
  ): Promise<BaseProjectRow[]>;
  listTaskCounts(projectIds: string[]): Promise<
    Array<{ projectId: string; total: number; done: number }>
  >;
  listMembers(projectIds: string[]): Promise<
    Array<{ projectId: string; name: string; role: string }>
  >;
  listBlockers(projectIds: string[]): Promise<
    Array<{
      projectId: string;
      title: string;
      type: string;
      severity: string;
    }>
  >;
  listActiveReprints(projectIds: string[]): Promise<
    Array<{
      projectId: string;
      title: string;
      status: string;
      dueDate: string | null;
      createdAt: Date;
    }>
  >;
};

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : undefined;
}

function arrayOf<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (item): item is T =>
          typeof item === "string" && allowed.includes(item as T)
      )
    ),
  ];
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().replace(/\s+/g, " ").slice(0, 120);
  return clean || undefined;
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
}

export function normalizeProjectPortfolioQuery(
  input: ProjectPortfolioQueryInput
): NormalizedProjectPortfolioQuery {
  const requestedLimit =
    typeof input.limit === "number" && Number.isFinite(input.limit)
      ? Math.round(input.limit)
      : DEFAULT_ROWS;

  return {
    projectText: cleanText(input.projectText),
    statuses: arrayOf(input.statuses, PROJECT_STATUSES),
    kinds: arrayOf(input.kinds, PROJECT_KINDS),
    printFundingStatuses: arrayOf(
      input.printFundingStatuses,
      PRINT_FUNDING_STATUSES
    ),
    priorities: arrayOf(input.priorities, PRIORITIES),
    sourceLanguage: cleanText(input.sourceLanguage),
    targetLanguage: cleanText(input.targetLanguage),
    memberName: cleanText(input.memberName),
    health: arrayOf(input.health, HEALTHS),
    dueBefore: isoDate(input.dueBefore),
    dueAfter: isoDate(input.dueAfter),
    deadlineState: oneOf(input.deadlineState, DEADLINE_STATES),
    rightsHolder: cleanText(input.rightsHolder),
    mouHolder: cleanText(input.mouHolder),
    licenseHolder: cleanText(input.licenseHolder),
    rightsState: oneOf(input.rightsState, RIGHTS_STATES),
    licenseState: oneOf(input.licenseState, LICENSE_STATES),
    scope: input.scope === "all" ? "all" : "open",
    sort: oneOf(input.sort, SORTS) ?? "title",
    detail: oneOf(input.detail, DETAILS) ?? "summary",
    limit: Math.min(MAX_ROWS, Math.max(1, requestedLimit)),
  };
}

function todayInTimezone(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const mouHolder = alias(rightsHolders, "assistant_mou_holder");
const licenseHolder = alias(rightsHolders, "assistant_license_holder");

const activeReprintExists = sql<boolean>`exists (
  select 1 from ${printRuns}
  where ${printRuns.projectId} = ${projects.id}
    and ${printRuns.kind} = 'reprint'
    and ${printRuns.status} not in ('completed', 'cancelled')
)`;

const activeReprintDeadline = sql<string | null>`(
  select ${printRuns.campaignDueDate} from ${printRuns}
  where ${printRuns.projectId} = ${projects.id}
    and ${printRuns.kind} = 'reprint'
    and ${printRuns.status} not in ('completed', 'cancelled')
  order by ${printRuns.createdAt} desc
  limit 1
)`;

const effectiveDeadline = sql<string | null>`coalesce(
  ${activeReprintDeadline},
  ${rightsItems.completeByDate},
  ${projects.dueDate}
)`;

const postgresProjectQuerySource: ProjectQuerySource = {
  async listBase(query, today, includeOperations) {
    const conditions: SQL[] = [];

    if (query.scope === "open") {
      conditions.push(
        or(
          inArray(projects.status, ["planning", "active", "on_hold"]),
          and(eq(projects.status, "completed"), activeReprintExists)
        )!
      );
    }
    if (query.projectText) {
      const pattern = `%${query.projectText}%`;
      conditions.push(
        or(ilike(projects.title, pattern), ilike(projects.slug, pattern))!
      );
    }
    if (query.statuses.length) {
      conditions.push(inArray(projects.status, query.statuses));
    }
    if (query.kinds.length) conditions.push(inArray(projects.kind, query.kinds));
    if (query.printFundingStatuses.length) {
      conditions.push(
        and(
          or(eq(projects.kind, "book"), isNull(projects.kind)),
          inArray(projects.printFundingStatus, query.printFundingStatuses)
        )!
      );
    }
    if (query.priorities.length) {
      conditions.push(inArray(projects.priority, query.priorities));
    }
    if (query.sourceLanguage) {
      conditions.push(ilike(projects.sourceLanguage, `%${query.sourceLanguage}%`));
    }
    if (query.targetLanguage) {
      conditions.push(ilike(projects.targetLanguage, `%${query.targetLanguage}%`));
    }
    if (query.memberName) {
      conditions.push(sql<boolean>`exists (
        select 1 from ${projectMembers}
        inner join ${user} on ${user.id} = ${projectMembers.userId}
        where ${projectMembers.projectId} = ${projects.id}
          and ${user.name} ilike ${`%${query.memberName}%`}
      )`);
    }
    if (query.health.length) {
      const known = query.health.filter((item) => item !== "unknown");
      const healthConditions: SQL[] = [];
      if (known.length) healthConditions.push(inArray(projects.healthStatus, known));
      if (query.health.includes("unknown")) healthConditions.push(isNull(projects.healthStatus));
      conditions.push(or(...healthConditions)!);
    }
    if (query.dueBefore) {
      conditions.push(sql`${effectiveDeadline} <= ${query.dueBefore}`);
    }
    if (query.dueAfter) {
      conditions.push(sql`${effectiveDeadline} >= ${query.dueAfter}`);
    }
    if (query.deadlineState === "overdue") {
      conditions.push(sql`${effectiveDeadline} < ${today}`);
    } else if (query.deadlineState === "upcoming") {
      conditions.push(sql`${effectiveDeadline} >= ${today}`);
    } else if (query.deadlineState === "unscheduled") {
      conditions.push(sql`${effectiveDeadline} is null`);
    }
    if (query.rightsHolder) {
      const pattern = `%${query.rightsHolder}%`;
      conditions.push(
        or(ilike(mouHolder.name, pattern), ilike(licenseHolder.name, pattern))!
      );
    }
    if (query.mouHolder) {
      conditions.push(ilike(mouHolder.name, `%${query.mouHolder}%`));
    }
    if (query.licenseHolder) {
      conditions.push(ilike(licenseHolder.name, `%${query.licenseHolder}%`));
    }
    if (query.rightsState === "missing") {
      conditions.push(isNull(rightsItems.id));
    } else if (query.rightsState === "complete") {
      conditions.push(eq(rightsItems.overallStatus, "complete"));
    } else if (query.rightsState === "incomplete") {
      conditions.push(
        and(isNotNull(rightsItems.id), ne(rightsItems.overallStatus, "complete"))!
      );
    }
    if (query.licenseState === "complete") {
      conditions.push(eq(rightsItems.licenseStatus, "signed"));
    } else if (query.licenseState === "incomplete") {
      conditions.push(
        and(
          inArray(rightsItems.agreementType, ["mou_plus_license", "license_only"]),
          inArray(rightsItems.licenseStatus, ["not_started", "in_progress"])
        )!
      );
    } else if (query.licenseState === "not_needed") {
      conditions.push(
        or(
          eq(rightsItems.agreementType, "mou_only"),
          eq(rightsItems.licenseStatus, "not_needed")
        )!
      );
    }

    const selection = readOnlyDb
      .select({
        id: projects.id,
        slug: projects.slug,
        title: projects.title,
        kind: projects.kind,
        printFundingStatus: projects.printFundingStatus,
        status: projects.status,
        priority: projects.priority,
        sourceLanguage: projects.sourceLanguage,
        targetLanguage: projects.targetLanguage,
        description:
          query.detail === "full" ? projects.description : sql<string | null>`null`,
        dueDate: projects.dueDate,
        effectiveDeadline,
        healthStatus: includeOperations
          ? projects.healthStatus
          : sql<string | null>`null`,
        healthComputedAt: includeOperations
          ? projects.healthComputedAt
          : sql<Date | null>`null`,
        rightsId: rightsItems.id,
        agreementType: rightsItems.agreementType,
        mouStatus: rightsItems.mouStatus,
        licenseStatus: rightsItems.licenseStatus,
        rightsOverall: rightsItems.overallStatus,
        rightsCompleteBy: rightsItems.completeByDate,
        mouHolder: mouHolder.name,
        licenseHolder: licenseHolder.name,
      })
      .from(projects)
      .leftJoin(rightsItems, eq(rightsItems.projectId, projects.id))
      .leftJoin(mouHolder, eq(mouHolder.id, rightsItems.mouHolderId))
      .leftJoin(licenseHolder, eq(licenseHolder.id, rightsItems.licenseHolderId))
      .where(conditions.length ? and(...conditions) : undefined);

    if (query.sort === "due_soonest") {
      return selection
        .orderBy(sql`${effectiveDeadline} is null`, asc(effectiveDeadline), asc(projects.title))
        .limit(query.limit + 1);
    }
    if (query.sort === "recent") {
      return selection.orderBy(desc(projects.createdAt), asc(projects.title)).limit(query.limit + 1);
    }
    if (query.sort === "health") {
      return selection
        .orderBy(
          sql`case ${projects.healthStatus}
            when 'red' then 0 when 'amber' then 1 when 'green' then 2 else 3 end`,
          asc(projects.title)
        )
        .limit(query.limit + 1);
    }
    if (query.sort === "print_funding") {
      return selection
        .orderBy(
          sql`case
            when ${projects.kind} is not null and ${projects.kind} <> 'book' then 6
            when ${projects.printFundingStatus} = 'not_assessed' then 0
            when ${projects.printFundingStatus} = 'no_funding' then 1
            when ${projects.printFundingStatus} = 'seeking_funding' then 2
            when ${projects.printFundingStatus} = 'partially_funded' then 3
            when ${projects.printFundingStatus} = 'funded' then 4
            else 5 end`,
          asc(projects.title)
        )
        .limit(query.limit + 1);
    }
    return selection.orderBy(asc(projects.title)).limit(query.limit + 1);
  },

  async listTaskCounts(projectIds) {
    if (!projectIds.length) return [];
    return readOnlyDb
      .select({
        projectId: tasks.projectId,
        total: sql<number>`count(*)`.mapWith(Number),
        done: sql<number>`count(*) filter (where ${tasks.status} = 'done')`.mapWith(Number),
      })
      .from(tasks)
      .where(inArray(tasks.projectId, projectIds))
      .groupBy(tasks.projectId)
      .then((rows) =>
        rows.flatMap((row) =>
          row.projectId
            ? [{ projectId: row.projectId, total: row.total, done: row.done }]
            : []
        )
      );
  },

  async listMembers(projectIds) {
    if (!projectIds.length) return [];
    return readOnlyDb
      .select({
        projectId: projectMembers.projectId,
        name: user.name,
        role: projectRoles.label,
      })
      .from(projectMembers)
      .innerJoin(user, eq(user.id, projectMembers.userId))
      .innerJoin(projectRoles, eq(projectRoles.id, projectMembers.projectRoleId))
      .where(inArray(projectMembers.projectId, projectIds))
      .orderBy(asc(user.name), asc(projectRoles.sortOrder));
  },

  async listBlockers(projectIds) {
    if (!projectIds.length) return [];
    return readOnlyDb
      .select({
        projectId: blockers.projectId,
        title: blockers.title,
        type: blockers.type,
        severity: blockers.severity,
      })
      .from(blockers)
      .where(and(inArray(blockers.projectId, projectIds), eq(blockers.isResolved, false)))
      .orderBy(desc(blockers.severity), asc(blockers.title));
  },

  async listActiveReprints(projectIds) {
    if (!projectIds.length) return [];
    return readOnlyDb
      .select({
        projectId: printRuns.projectId,
        title: printRuns.title,
        status: printRuns.status,
        dueDate: printRuns.campaignDueDate,
        createdAt: printRuns.createdAt,
      })
      .from(printRuns)
      .where(
        and(
          inArray(printRuns.projectId, projectIds),
          eq(printRuns.kind, "reprint"),
          sql`${printRuns.status} not in ('completed', 'cancelled')`
        )
      )
      .orderBy(asc(printRuns.projectId), desc(printRuns.createdAt));
  },
};

function groupByProject<T extends { projectId: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const projectRows = grouped.get(row.projectId) ?? [];
    projectRows.push(row);
    grouped.set(row.projectId, projectRows);
  }
  return grouped;
}

function resultBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export async function queryProjectPortfolio(
  input: ProjectPortfolioQueryInput,
  context: { role: ProjectPortfolioRole; timezone: string },
  source: ProjectQuerySource = postgresProjectQuerySource
) {
  const query = normalizeProjectPortfolioQuery(input);
  const warnings: string[] = [];
  const isManager =
    context.role === "manager" ||
    context.role === "admin" ||
    context.role === "super_admin";

  if (!isManager && (query.health.length || query.sort === "health")) {
    query.health = [];
    query.sort = "title";
    warnings.push("Health filters and health-based sorting are manager-only and were not applied.");
  }

  if (!isManager && query.detail === "operations") {
    query.detail = "summary";
    warnings.push("Project health and blocker details are manager-only and were omitted.");
  } else if (!isManager && query.detail === "full") {
    warnings.push("Project health and blocker details are manager-only and were omitted.");
  }

  const narrowForFull = Boolean(
    query.projectText ||
      query.memberName ||
      query.rightsHolder ||
      query.mouHolder ||
      query.licenseHolder ||
      query.sourceLanguage ||
      query.targetLanguage
  );
  if (query.detail === "full" && (!narrowForFull || query.limit > 5)) {
    query.detail = "summary";
    warnings.push("Full detail requires a narrow text/member/rights-holder filter and a limit of 5 or less.");
  }

  if (
    isManager &&
    (query.health.length || query.sort === "health") &&
    query.detail === "summary"
  ) {
    query.detail = "operations";
  } else if (query.memberName && query.detail === "summary") {
    query.detail = "team";
  } else if (
    (query.rightsHolder ||
      query.mouHolder ||
      query.licenseHolder ||
      query.rightsState ||
      query.licenseState) &&
    query.detail === "summary"
  ) {
    query.detail = "rights";
  }

  const today = todayInTimezone(context.timezone);
  const includeTeam = query.detail === "team" || query.detail === "full";
  const includeRights = query.detail === "rights" || query.detail === "full";
  const includeOperations =
    isManager && (query.detail === "operations" || query.detail === "full");

  const baseRows = await source.listBase(query, today, includeOperations);
  let truncated = baseRows.length > query.limit;
  const selected = baseRows.slice(0, query.limit);
  const projectIds = selected.map((row) => row.id);

  const [taskCounts, activeReprints, members, activeBlockers] = await Promise.all([
    source.listTaskCounts(projectIds),
    source.listActiveReprints(projectIds),
    includeTeam ? source.listMembers(projectIds) : Promise.resolve([]),
    includeOperations ? source.listBlockers(projectIds) : Promise.resolve([]),
  ]);

  const taskByProject = new Map(taskCounts.map((row) => [row.projectId, row]));
  const reprintsByProject = groupByProject(activeReprints);
  const membersByProject = groupByProject(members);
  const blockersByProject = groupByProject(activeBlockers);

  const rows = selected.map((project) => {
    const progress = taskByProject.get(project.id) ?? { total: 0, done: 0 };
    const activeReprint = reprintsByProject.get(project.id)?.[0];
    const effectiveDeadline =
      activeReprint?.dueDate ?? project.rightsCompleteBy ?? project.dueDate;
    const deadlineSource = activeReprint?.dueDate
      ? "active_reprint"
      : project.rightsCompleteBy
        ? "rights"
        : project.dueDate
          ? "project"
          : null;

    return {
      id: project.id,
      slug: project.slug,
      title: project.title,
      kind: project.kind,
      printFundingStatus: project.printFundingStatus,
      status: project.status,
      priority: project.priority,
      sourceLanguage: project.sourceLanguage,
      targetLanguage: project.targetLanguage,
      effectiveDeadline,
      deadlineSource,
      progress: { done: progress.done, total: progress.total },
      activeReprint: activeReprint
        ? {
            title: activeReprint.title,
            status: activeReprint.status,
            dueDate: activeReprint.dueDate,
          }
        : undefined,
      ...(includeTeam
        ? {
            team: (membersByProject.get(project.id) ?? [])
              .slice(0, 12)
              .map(({ name, role }) => ({ name, role })),
          }
        : {}),
      ...(query.detail === "full"
        ? { description: project.description?.slice(0, 1000) ?? null }
        : {}),
      ...(includeRights
        ? {
            rights: project.rightsId
              ? {
                  overallStatus: project.rightsOverall,
                  agreementType: project.agreementType,
                  completeByDate: project.rightsCompleteBy,
                  mou: {
                    holder: project.mouHolder,
                    status: project.mouStatus,
                  },
                  license: {
                    holder: project.licenseHolder,
                    status: project.licenseStatus,
                  },
                }
              : null,
          }
        : {}),
      ...(includeOperations
        ? {
            health: project.healthStatus ?? "unknown",
            healthComputedAt: project.healthComputedAt?.toISOString() ?? null,
            blockers: (blockersByProject.get(project.id) ?? [])
              .slice(0, 8)
              .map(({ title, type, severity }) => ({ title, type, severity })),
          }
        : {}),
    };
  });

  const result = {
    asOf: today,
    detail: query.detail,
    count: rows.length,
    truncated,
    warnings,
    projects: rows,
  };

  while (result.projects.length && resultBytes(result) > MAX_RESULT_BYTES) {
    result.projects.pop();
    result.count = result.projects.length;
    result.truncated = true;
    truncated = true;
  }

  return result;
}

export const projectPortfolioLimits = {
  maxRows: MAX_ROWS,
  defaultRows: DEFAULT_ROWS,
  maxResultBytes: MAX_RESULT_BYTES,
} as const;
