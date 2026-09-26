import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";

import { getSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import {
  getProjectBySlug,
  listProjectRightsStatus,
} from "@/lib/projects/queries";
import { getProjectFundingSummary } from "@/lib/projects/funding-queries";
import { getPlanningDefaults } from "@/lib/planning/queries";
import { durationForKind } from "@/lib/planning/capacity";
import { listProjectMentionTargets } from "@/lib/mentions/roster";
import { listAttachments } from "@/lib/files/queries";
import { getProjectCopyright } from "@/lib/rights/queries";
import { getComplianceSummary } from "@/lib/obligations/queries";
import { getProjectBlockers, type Blocker } from "@/lib/blockers/queries";
import { listProjectActivity } from "@/lib/activity/queries";
import {
  getOpenAssignedTasks,
  getProjectDependencyEdges,
  type DependencyEdge,
  weeklyTaskCompletions,
} from "@/lib/tasks/queries";
import { getProjectSnapshots } from "@/lib/blockers/snapshots";
import { forecastCompletion } from "@/lib/forecast/velocity";
import { getStandupView } from "@/lib/standup/view-queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpTip } from "@/components/ui/help-tip";
import { FileAttachments } from "@/components/files/file-attachments";
import { ProjectDriveFolder } from "@/components/projects/project-drive-folder";
import { ProjectSettingsDialog } from "@/components/projects/project-settings-dialog";
import { ManagerHealthBand } from "@/components/projects/manager-health-band";
import { RefreshHealthButton } from "@/components/blockers/refresh-health";
import { OverdueReasonCard } from "@/components/projects/overdue-reason";
import { ProjectStatusUpdate } from "@/components/projects/status-update";
import { getLatestProjectUpdate } from "@/lib/projects/status-queries";
import { Gantt } from "@/components/timeline/gantt";
import { daysUntil, formatDate, timeAgo } from "@/lib/format";
import { isEpisodicKind, projectUnitTerms } from "@/lib/projects/kinds";
import { cn } from "@/lib/utils";
import { listProjectExternalFollowUps } from "@/lib/email/follow-ups";
import { listProjectThreadPreviews } from "@/lib/email/queries";
import { ExternalFollowUpCard } from "@/components/correspondence/external-follow-up-card";
import { ProjectCorrespondencePreview } from "@/components/correspondence/project-correspondence-preview";

const ATTENTION_PREVIEW_LIMIT = 3;

function productionHref(slug: string, kind: string | null) {
  if (isEpisodicKind(kind)) return `/projects/${slug}/episodes`;
  if (kind === "article") return `/projects/${slug}/tasks/pipeline`;
  return `/projects/${slug}/tasks`;
}

function blockerDestination(
  blocker: Blocker,
  slug: string,
  kind: string | null
) {
  if (blocker.type === "rights") {
    return { href: `/projects/${slug}/rights`, label: "Review rights" };
  }
  if (blocker.type === "budget") {
    return { href: `/projects/${slug}/budget`, label: "Review budget" };
  }
  if (isEpisodicKind(kind)) {
    return {
      href: productionHref(slug, kind),
      label: kind === "video_series" ? "Open videos" : "Open episodes",
    };
  }
  if (kind === "article") {
    return { href: productionHref(slug, kind), label: "Open pipeline" };
  }
  return { href: productionHref(slug, kind), label: "Open tasks" };
}

function downstreamWaitingCount(
  sourceTaskId: string | null,
  edges: DependencyEdge[]
) {
  if (!sourceTaskId) return 0;
  const dependents = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.taskStatus === "done") continue;
    const current = dependents.get(edge.dependsOnTaskId) ?? [];
    current.push(edge.taskId);
    dependents.set(edge.dependsOnTaskId, current);
  }

  const waiting = new Set<string>();
  const queue = [...(dependents.get(sourceTaskId) ?? [])];
  while (queue.length > 0) {
    const taskId = queue.shift();
    if (!taskId || waiting.has(taskId) || taskId === sourceTaskId) continue;
    waiting.add(taskId);
    queue.push(...(dependents.get(taskId) ?? []));
  }
  return waiting.size;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

const RISK_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

export const dynamic = "force-dynamic";

export default async function ProjectOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    settings?: string | string[];
    focus?: string | string[];
  }>;
}) {
  const { slug } = await params;
  const { settings, focus } = await searchParams;
  const settingsOpen = settings === "1";
  const data = await getProjectBySlug(slug);
  if (!data) notFound();
  const { project, phases, tasks, units, members } = data;
  const projectClosed =
    project.status === "completed" || project.status === "cancelled";
  const unitTerms = projectUnitTerms(project.kind);
  const [
    projectFiles,
    projectBlockers,
    activity,
    copyright,
    status,
    depEdges,
    compliance,
    mentionTargets,
    planningDefaults,
  ] = await Promise.all([
    listAttachments("project", project.id),
    projectClosed ? Promise.resolve([]) : getProjectBlockers(project.id),
    listProjectActivity(project.id),
    getProjectCopyright(project.id),
    getLatestProjectUpdate(project.id),
    getProjectDependencyEdges(project.id),
    getComplianceSummary(project.id),
    listProjectMentionTargets(project.id),
    getPlanningDefaults(),
  ]);
  const defaultDurationMonths = durationForKind(
    planningDefaults.durationByKind,
    project.kind
  );

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const overdueTasks = tasks.filter(
    (t) => t.status !== "done" && (daysUntil(t.dueDate) ?? 0) < 0
  ).length;

  const byPhase = new Map<string, { total: number; done: number }>();
  for (const t of tasks) {
    if (!t.phaseId) continue;
    const e = byPhase.get(t.phaseId) ?? { total: 0, done: 0 };
    e.total += 1;
    if (t.status === "done") e.done += 1;
    byPhase.set(t.phaseId, e);
  }

  // Manager-only health band — members pay no extra fetch cost.
  const session = await getSession();
  const isManager =
    can(session?.user ?? null, "project.edit");
  const canViewCorrespondence = can(
    session?.user ?? null,
    "correspondence.view"
  );
  const [externalFollowUps, recentThreads] = canViewCorrespondence
    ? await Promise.all([
        listProjectExternalFollowUps(project.id),
        listProjectThreadPreviews(project.id, 3),
      ])
    : [[], []];

  let band: ReactNode = null;
  let projectCompleteByDate: string | null = null;
  if (isManager && !projectClosed) {
    const [
      fundingSummary,
      rightsStatus,
      openTasks,
      velocityWeeks,
      standupView,
      snapshots,
    ] = await Promise.all([
      getProjectFundingSummary(project.id),
      listProjectRightsStatus(),
      getOpenAssignedTasks(),
      weeklyTaskCompletions(project.id),
      getStandupView(),
      getProjectSnapshots(project.id),
    ]);
    const bt = fundingSummary?.needed ? fundingSummary : null;
    const rs = rightsStatus.find((r) => r.projectId === project.id) ?? null;
    projectCompleteByDate = rs?.completeByDate ?? null;
    const rightsOverdue = !!(
      rs &&
      rs.overallStatus !== "complete" &&
      rs.completeByDate &&
      (daysUntil(rs.completeByDate) ?? 0) < 0
    );

    const memberIds = new Set(members.map((m) => m.userId));
    const memberNames = new Set(members.map((m) => m.userName));
    const loadMap = new Map<
      string,
      { name: string; open: number; overdue: number }
    >();
    for (const t of openTasks) {
      if (!t.assignedTo || !memberIds.has(t.assignedTo)) continue;
      const e =
        loadMap.get(t.assignedTo) ??
        { name: t.assigneeName ?? "Unknown", open: 0, overdue: 0 };
      e.open += 1;
      const d = daysUntil(t.dueDate);
      if (d !== null && d < 0) e.overdue += 1;
      loadMap.set(t.assignedTo, e);
    }
    const teamLoad = [...loadMap.values()].sort((a, b) => b.open - a.open);

    const impMap = new Map<
      string,
      { userName: string; stuckRisk: string; top: string | null }
    >();
    for (const s of standupView) {
      if (!s.report) continue;
      for (const p of s.report.people) {
        if (!memberNames.has(p.userName)) continue;
        if ((RISK_RANK[p.stuckRisk] ?? 0) < 1) continue;
        const cur = impMap.get(p.userName);
        if (!cur || (RISK_RANK[p.stuckRisk] ?? 0) > (RISK_RANK[cur.stuckRisk] ?? 0)) {
          impMap.set(p.userName, {
            userName: p.userName,
            stuckRisk: p.stuckRisk,
            top: p.impediments[0] ?? null,
          });
        }
      }
    }
    const impediments = [...impMap.values()];

    // Velocity-vs-deadline forecast from the snapshots we already have.
    const forecast = forecastCompletion({
      snapshots: snapshots.map((s) => ({
        snapDate: s.date,
        doneTasks: s.doneTasks,
        totalTasks: s.totalTasks,
      })),
      openTaskCount: total - done,
      dueDate: project.dueDate,
      today: todayYmd(),
    });

    band = (
      <ManagerHealthBand
        budget={
          bt
            ? {
                needed: bt.needed,
                committed: bt.committed,
                received: bt.received,
                spent: bt.spent,
                currency: bt.currency,
              }
            : null
        }
        rights={
          rs
            ? { overallStatus: rs.overallStatus, completeByDate: rs.completeByDate }
            : null
        }
        rightsOverdue={rightsOverdue}
        velocity={velocityWeeks.map((w) => ({ label: w.week, value: w.count }))}
        teamLoad={teamLoad}
        impediments={impediments}
        forecast={{ risk: forecast.risk, projectedDate: forecast.projectedDate }}
        projectSlug={project.slug}
      />
    );
  }

  const attentionRows = projectBlockers.map((blocker) => ({
    ...blocker,
    ...blockerDestination(blocker, project.slug, project.kind),
    downstreamCount:
      blocker.sourceType === "task"
        ? downstreamWaitingCount(blocker.sourceId, depEdges)
        : 0,
  }));
  const visibleAttention = attentionRows.slice(0, ATTENTION_PREVIEW_LIMIT);
  const criticalCount = attentionRows.filter(
    (blocker) => blocker.severity === "critical"
  ).length;
  const warningCount = attentionRows.length - criticalCount;
  const destinationMap = new Map<
    string,
    { href: string; label: string; count: number }
  >();
  for (const blocker of attentionRows) {
    const current = destinationMap.get(blocker.href);
    if (current) current.count += 1;
    else {
      destinationMap.set(blocker.href, {
        href: blocker.href,
        label: blocker.label,
        count: 1,
      });
    }
  }
  const attentionDestinations = [...destinationMap.values()];

  return (
    <div className="space-y-8">
      {isManager ? (
        <ProjectSettingsDialog
          key={settingsOpen ? "settings-open" : "settings-closed"}
          projectId={project.id}
          projectSlug={project.slug}
          projectTitle={project.title}
          status={project.status}
          defaultOpen={settingsOpen}
          focusName={focus === "name"}
          kind={project.kind}
          printFundingStatus={project.printFundingStatus}
          videoProductionMode={project.videoProductionMode}
          sourceLanguage={project.sourceLanguage}
          targetLanguage={project.targetLanguage}
          targetLanguageTitle={project.targetLanguageTitle}
          startDate={project.startDate}
          estimatedDurationMonths={project.estimatedDurationMonths}
          defaultDurationMonths={defaultDurationMonths}
          dueDate={project.dueDate}
          completeByDate={projectCompleteByDate}
          taskCount={tasks.length}
          phaseCount={phases.length}
          memberCount={members.length}
          fileCount={projectFiles.length}
        />
      ) : null}

      <div className="space-y-3">
        <OverdueReasonCard
          dueDate={project.dueDate}
          status={project.status}
          totalTasks={total}
          doneTasks={done}
          overdueTasks={overdueTasks}
          blockerCount={projectBlockers.length}
        />

      {projectBlockers.length > 0 ? (
        <div
          className={cn(
            "overflow-hidden rounded-xl border",
            criticalCount > 0
              ? "border-destructive/40 bg-destructive/5"
              : "border-warning/40 bg-warning/5"
          )}
        >
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-lg border bg-background/80",
                criticalCount > 0
                  ? "border-destructive/30 text-destructive"
                  : "border-warning/30 text-warning-text"
              )}
            >
              <AlertTriangle className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">Attention needed</h2>
                {criticalCount > 0 ? (
                  <Badge variant="destructive">
                    {criticalCount} critical
                  </Badge>
                ) : null}
                {warningCount > 0 ? (
                  <Badge
                    variant="outline"
                    className="border-warning/40 bg-warning/10 text-warning-text"
                  >
                    {warningCount} warning{warningCount === 1 ? "" : "s"}
                  </Badge>
                ) : null}
                <HelpTip title="What needs attention?" side="bottom" align="start">
                  Root issues that need action, such as missing rights, budget
                  shortfalls, overdue work, or stalled tasks. A later production
                  stage waiting for an earlier stage is normal pipeline flow and
                  does not count as a blocker.
                </HelpTip>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Root issues only — normal production sequencing is shown as
                waiting in the pipeline.
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-2 font-normal sm:ml-auto">
              {project.healthComputedAt ? (
                <span className="text-xs text-muted-foreground">
                  Checked {timeAgo(project.healthComputedAt)}
                </span>
              ) : null}
              {isManager ? <RefreshHealthButton projectId={project.id} /> : null}
            </span>
          </div>
          <ul className="divide-y border-y bg-background/60">
            {visibleAttention.map((blocker) => (
              <li key={blocker.id}>
                <Link
                  href={blocker.href}
                  className="group flex min-h-12 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      blocker.severity === "critical"
                        ? "bg-destructive"
                        : "bg-warning"
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug">
                      {blocker.title}
                    </span>
                    {blocker.downstreamCount > 0 ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {blocker.downstreamCount} later stage
                        {blocker.downstreamCount === 1 ? " is" : "s are"} waiting
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                    <span className="hidden sm:inline">{blocker.label}</span>
                    <ArrowRight className="size-3.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {attentionRows.length > ATTENTION_PREVIEW_LIMIT ? (
            <div className="flex flex-col gap-2 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
              <span className="text-muted-foreground">
                +{attentionRows.length - ATTENTION_PREVIEW_LIMIT} more root issue
                {attentionRows.length - ATTENTION_PREVIEW_LIMIT === 1 ? "" : "s"}
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {attentionDestinations.map((destination) => (
                  <Link
                    key={destination.href}
                    href={destination.href}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {destination.label} ({destination.count})
                  </Link>
                ))}
              </span>
            </div>
          ) : null}
        </div>
      ) : isManager && !projectClosed ? (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          {project.healthComputedAt ? (
            <span>Health checked {timeAgo(project.healthComputedAt)}</span>
          ) : (
            <span>Health not computed yet</span>
          )}
          <RefreshHealthButton projectId={project.id} />
        </div>
      ) : null}

      {compliance.total > 0 ? (
        <Link
          href={`/projects/${slug}/rights#obligations`}
          className="flex items-center gap-2 rounded-lg border border-info/30 bg-info/5 px-4 py-2.5 text-sm transition-colors hover:bg-info/10"
        >
          <ShieldCheck className="size-4 text-info" />
          <span className="font-medium">
            {compliance.total} license obligation
            {compliance.total === 1 ? "" : "s"}
          </span>
          {compliance.openTaskCount > 0 ? (
            <span className="text-muted-foreground">
              · {compliance.openTaskCount} open task
              {compliance.openTaskCount === 1 ? "" : "s"}
            </span>
          ) : null}
          <span className="ml-auto text-xs text-muted-foreground">
            View on Rights →
          </span>
        </Link>
      ) : null}

        {externalFollowUps.length > 0 ? (
          <section className="space-y-3" aria-labelledby="external-follow-ups-heading">
            <div>
              <h2 id="external-follow-ups-heading" className="text-sm font-semibold">
                External follow-up
              </h2>
              <p className="text-xs text-muted-foreground">
                Project-linked email currently waiting on someone outside the team.
              </p>
            </div>
            {externalFollowUps.map((followUp) => (
              <ExternalFollowUpCard
                key={followUp.id}
                followUp={followUp}
                allowProjectUpdate
              />
            ))}
          </section>
        ) : null}
      </div>

      {band}

      <div
        className={cn(
          "grid min-w-0 items-start gap-6",
          canViewCorrespondence
            ? "xl:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)]"
            : ""
        )}
      >
        <ProjectStatusUpdate
          projectId={project.id}
          slug={project.slug}
          status={status}
          isManager={isManager && !projectClosed}
          currentUserId={session?.user.id ?? ""}
          members={mentionTargets}
        />

        {canViewCorrespondence ? (
          <div className="min-w-0">
            <ProjectCorrespondencePreview
              threads={recentThreads}
              projectSlug={project.slug}
            />
          </div>
        ) : null}
      </div>

      {project.description ? (
        <section
          className="border-l-2 border-primary/30 pl-4"
          aria-labelledby="project-brief-heading"
        >
          <h2
            id="project-brief-heading"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Project brief
          </h2>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-foreground/80">
            {project.description}
          </p>
        </section>
      ) : null}

      {phases.length > 0 || tasks.some((t) => t.dueDate) ? (
        <section className="min-w-0 space-y-3" aria-labelledby="timeline-heading">
          <div className="flex items-center justify-between gap-4">
            <h2 id="timeline-heading" className="text-base font-semibold">
              Timeline
            </h2>
            <Link
              href={`/projects/${project.slug}/tasks`}
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Open tasks
            </Link>
          </div>
          <Gantt
            today={todayYmd()}
            canEdit={isManager}
            tasksHref={`/projects/${project.slug}/tasks`}
            phases={phases.map((ph) => ({
              id: ph.id,
              name: ph.name,
              startDate: ph.startDate,
              dueDate: ph.dueDate,
              color: ph.color,
            }))}
            tasks={tasks
              .filter((t): t is typeof t & { dueDate: string } => !!t.dueDate)
              .map((t) => ({
                id: t.id,
                title: t.title,
                dueDate: t.dueDate,
                phaseId: t.phaseId,
                status: t.status,
                isMilestone: t.isMilestone,
              }))}
            deps={depEdges.map((e) => ({
              fromTaskId: e.dependsOnTaskId,
              toTaskId: e.taskId,
            }))}
          />
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="work-plan-heading">
        <h2 id="work-plan-heading" className="text-base font-semibold">
          Work plan
        </h2>
        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            <div>
              <h3 className="mb-3 text-sm font-semibold">Phases</h3>
              {phases.length === 0 ? (
                <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  No phases yet. Create the project from a plan template, or add
                  tasks directly in the Tasks tab.{" "}
                  <Link
                    href={`/projects/${project.slug}/tasks`}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Open tasks
                  </Link>
                </div>
              ) : (
                <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                  {phases.map((ph) => {
                    const c = byPhase.get(ph.id) ?? { total: 0, done: 0 };
                    const p = c.total ? Math.round((c.done / c.total) * 100) : 0;
                    return (
                      <li key={ph.id} className="flex min-h-14 items-center gap-4 px-4 py-3">
                        <span
                          className="size-3 shrink-0 rounded-full"
                          style={{
                            background: ph.color ?? "var(--muted-foreground)",
                          }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium">{ph.name}</span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              {c.done}/{c.total}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                            Due {formatDate(ph.dueDate)}
                          </p>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-success"
                              style={{ width: `${p}%` }}
                            />
                          </div>
                        </div>
                        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                          {formatDate(ph.dueDate)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {units.length > 0 && isEpisodicKind(project.kind) ? (
              (() => {
                const published = units.filter(
                  (u) => u.status === "published"
                ).length;
                const scheduled = units.filter(
                  (u) => u.status === "scheduled"
                ).length;
                const unitPct = Math.round((published / units.length) * 100);
                const unitsLabel = projectUnitTerms(project.kind).plural;
                return (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium capitalize text-muted-foreground">
                        {unitsLabel} ({units.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{published} published</span>
                        <span>{scheduled} scheduled</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-success"
                          style={{ width: `${unitPct}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })()
            ) : units.length > 0 ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {unitTerms.plural[0].toUpperCase() + unitTerms.plural.slice(1)} ({units.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  {units.map((u) => (
                    <Badge key={u.id} variant="secondary">
                      {u.name}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <Card size="sm">
            <CardHeader className="border-b">
              <CardTitle className="text-sm">Progress and team</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-3xl font-semibold tabular-nums">{pct}%</p>
                    <p className="text-sm text-muted-foreground">
                      {done} of {total} tasks done
                    </p>
                  </div>
                  <Link
                    href={`/projects/${project.slug}/tasks`}
                    className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    View tasks
                  </Link>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-success"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Start</dt>
                    <dd>{formatDate(project.startDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Due</dt>
                    <dd>{formatDate(project.dueDate)}</dd>
                  </div>
                </dl>
              </div>

              <div className="border-t pt-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">Members</h3>
                  <Link
                    href={`/projects/${project.slug}/members`}
                    className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Manage
                  </Link>
                </div>
                {members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No members assigned.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {members.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate text-sm">{m.userName}</span>
                        <Badge
                          variant="outline"
                          className="border-transparent"
                          style={{
                            background: `${m.roleColor ?? "#64748b"}1a`,
                            color: m.roleColor ?? undefined,
                          }}
                        >
                          {m.roleLabel}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="resources-heading">
        <h2 id="resources-heading" className="text-base font-semibold">
          Project resources
        </h2>
        <Card size="sm">
          <CardContent className="grid items-start gap-6 lg:grid-cols-[minmax(16rem,3fr)_minmax(0,5fr)]">
            <div className="min-w-0 space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Drive folder
              </h3>
              <ProjectDriveFolder
                projectId={project.id}
                folder={
                  project.driveFolderId &&
                  project.driveFolderName &&
                  project.driveFolderUrl
                    ? {
                        id: project.driveFolderId,
                        name: project.driveFolderName,
                        url: project.driveFolderUrl,
                      }
                    : null
                }
                isManager={isManager}
              />
            </div>

            <div className="min-w-0 space-y-2 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <h3 className="text-sm font-medium text-muted-foreground">
                Files
              </h3>
              <FileAttachments
                targetType="project"
                targetId={project.id}
                attachments={projectFiles}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      {activity.length > 0 || copyright.notice ? (
        <section className="space-y-3" aria-labelledby="record-heading">
          <h2 id="record-heading" className="text-base font-semibold">
            Project record
          </h2>
          <div
            className={cn(
              "grid items-start gap-6",
              activity.length > 0 && copyright.notice ? "lg:grid-cols-2" : ""
            )}
          >
            {activity.length > 0 ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Recent activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {activity.map((a) => (
                      <li key={a.id} className="py-2 first:pt-0 last:pb-0">
                        <span className="text-sm leading-snug text-foreground">
                          {a.summary}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {a.actorName ?? "Someone"} · {timeAgo(a.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            {copyright.notice ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Copyright notice
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">
                      View layout notice
                      {copyright.holderName
                        ? ` · held by ${copyright.holderName}`
                        : ""}
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap rounded-md bg-muted/60 p-3 font-sans text-sm">
                      {copyright.notice}
                    </pre>
                  </details>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
