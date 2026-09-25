import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CalendarPlus,
  Download,
  FolderKanban,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";

import { requireRole } from "@/lib/auth/guards";
import {
  listProjectBlockerSummaries,
  listProjectBudgetTotals,
  listProjectRightsStatus,
  listProjects,
} from "@/lib/projects/queries";
import { listOpenBlockersByProject } from "@/lib/blockers/queries";
import {
  getTeamLoad,
  listProjectMilestones,
  weeklyTaskCompletions,
} from "@/lib/tasks/queries";
import { getStandupView, type ReportPerson } from "@/lib/standup/view-queries";
import { listRecentActivity } from "@/lib/activity/queries";
import { getCronRuns } from "@/lib/cron/runs";
import { getAgendaItems, agendaToday } from "@/lib/agenda/queries";
import { bucketAgenda } from "@/lib/agenda/bucket";
import { getProjectForecasts } from "@/lib/forecast/queries";
import { listManagerUpdateRecommendations } from "@/lib/projects/status-queries";
import { daysUntil, dueLabel, timeAgo } from "@/lib/format";

const CRON_LABEL: Record<string, string> = {
  "recompute-blockers": "Blockers & health",
  standup: "Standups",
  "gmail-poll": "Email capture",
  "weekly-digest": "Weekly digest",
  "assistant-reflection": "Assistant reflection",
  "project-update-review": "Project update review",
  "wiki-search-index": "Wiki search index",
  "agreement-index": "Agreement search index",
};
// The cron tick runs each job only when it has work, so the "stale" windows
// allow for the idle cadence: hourly index backstops, hourly mailbox polling
// outside work hours, and standups that only run on scheduled days.
const CRON_STALE_MS: Record<string, number> = {
  "recompute-blockers": 36 * 3_600_000,
  standup: 3 * 24 * 3_600_000,
  "gmail-poll": 2 * 3_600_000,
  "weekly-digest": 8 * 24 * 3_600_000,
  "assistant-reflection": 36 * 3_600_000,
  "project-update-review": 36 * 3_600_000,
  "wiki-search-index": 2 * 3_600_000,
  "agreement-index": 2 * 3_600_000,
};
import { HealthDot } from "@/components/badges";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/portfolio/stat-card";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion/reveal";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { AgendaRow } from "@/components/agenda/agenda-view";
import { RefreshAllHealthButton } from "@/components/blockers/refresh-health";
import { RagDonut } from "@/components/portfolio/charts/rag-donut";
import { TrendLine } from "@/components/portfolio/charts/trend-line";
import { CapacityHeatmap } from "@/components/portfolio/capacity-heatmap";
import {
  PortfolioTable,
  type PortfolioRow,
} from "@/components/portfolio/portfolio-table";
import { Timeline } from "@/components/timeline/timeline";
import { activeProjectCoordinationLimit } from "@/lib/flow";

const HEALTH_BAR: Record<string, string> = {
  red: "var(--destructive)",
  amber: "var(--warning)",
  green: "var(--success)",
};

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

const RISK_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const session = await requireRole("manager");
  const nowMs = Number(new Date());

  const [
    projects,
    budgetTotals,
    rightsStatus,
    blockerSummaries,
    openBlockers,
    teamLoad,
    velocityWeeks,
    standupView,
    recentActivity,
    cronRuns,
    agendaItems,
    milestones,
    updateRecommendations,
  ] = await Promise.all([
    listProjects(),
    listProjectBudgetTotals(),
    listProjectRightsStatus(),
    listProjectBlockerSummaries(),
    listOpenBlockersByProject(),
    getTeamLoad(),
    weeklyTaskCompletions(),
    getStandupView(),
    listRecentActivity(8),
    getCronRuns(),
    getAgendaItems({
      userId: session.user.id,
      role: session.user.role as string,
      horizonDays: 21,
    }),
    listProjectMilestones(),
    listManagerUpdateRecommendations(8),
  ]);

  const milestonesByProject = new Map<string, { date: string; label: string }[]>();
  for (const m of milestones) {
    const arr = milestonesByProject.get(m.projectId) ?? [];
    arr.push({ date: m.dueDate, label: m.title });
    milestonesByProject.set(m.projectId, arr);
  }

  // Money + rights deadlines coming due (overdue + next 3 weeks), soonest first.
  const agendaBuckets = bucketAgenda(agendaItems, agendaToday());
  const comingDue = [
    ...agendaBuckets.overdue,
    ...agendaBuckets.thisWeek,
    ...agendaBuckets.next2Weeks,
  ].slice(0, 8);

  const budgetMap = new Map(budgetTotals.map((b) => [b.projectId, b]));
  const rightsMap = new Map(rightsStatus.map((r) => [r.projectId, r]));
  const blockerMap = new Map(blockerSummaries.map((b) => [b.projectId, b]));

  const forecastMap = await getProjectForecasts(
    projects.map((p) => ({
      id: p.id,
      dueDate: p.dueDate,
      totalTasks: p.totalTasks,
      doneTasks: p.doneTasks,
    }))
  );

  const rows: PortfolioRow[] = projects.map((p) => {
    const b = budgetMap.get(p.id);
    const needed = b?.needed ?? 0;
    const secured = b?.secured ?? 0;
    const summary = blockerMap.get(p.id);
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status,
      healthStatus: p.healthStatus,
      dueDate: p.dueDate,
      totalTasks: p.totalTasks,
      doneTasks: p.doneTasks,
      progressPct: p.totalTasks
        ? Math.round((p.doneTasks / p.totalTasks) * 100)
        : 0,
      blockerCount: summary?.total ?? p.blockerCount,
      critical: summary?.critical ?? 0,
      toRaise: Math.max(0, needed - secured),
      fundedPct: needed > 0 ? Math.round((secured / needed) * 100) : null,
      currency: b?.currency ?? "USD",
      rightsStatus: rightsMap.get(p.id)?.overallStatus ?? "none",
      forecastRisk: forecastMap.get(p.id)?.risk ?? "unknown",
      projectedDate: forecastMap.get(p.id)?.projectedDate ?? null,
    };
  });

  const rag = { red: 0, amber: 0, green: 0 };
  for (const p of projects) {
    if (p.healthStatus && p.healthStatus in rag) {
      rag[p.healthStatus as keyof typeof rag] += 1;
    }
  }
  const active = projects.filter(
    (p) => p.status === "active" || p.status === "planning"
  ).length;
  const overdue = projects.filter((p) => {
    const d = daysUntil(p.dueDate);
    return (
      d !== null &&
      d < 0 &&
      p.status !== "proposal" &&
      p.status !== "completed" &&
      p.status !== "cancelled"
    );
  }).length;
  const missingDueDateCount = projects.filter(
    (p) =>
      !p.dueDate &&
      (p.status === "planning" || p.status === "active" || p.status === "on_hold")
  ).length;
  const totalToRaise = rows.reduce((s, r) => s + r.toRaise, 0);
  const criticalBlockers = rows.reduce((s, r) => s + r.critical, 0);
  const currency = rows.find((r) => r.toRaise > 0)?.currency ?? "USD";

  // Attention — critical blockers, overdue projects, at-risk people.
  const projMeta = new Map(projects.map((p) => [p.id, { title: p.title, slug: p.slug }]));
  const criticalList = openBlockers.flatMap((g) =>
    g.blockers
      .filter((b) => b.severity === "critical")
      .map((b) => ({
        key: b.id,
        project: projMeta.get(g.projectId)?.title ?? "—",
        slug: projMeta.get(g.projectId)?.slug ?? "",
        title: b.title,
      }))
  );
  const overdueList = rows.filter((r) => {
    const d = daysUntil(r.dueDate);
    return (
      d !== null && d < 0 && r.status !== "completed" && r.status !== "cancelled"
    );
  });
  const riskByPerson = new Map<string, ReportPerson>();
  for (const s of standupView) {
    if (!s.report) continue;
    for (const p of s.report.people) {
      if ((RISK_RANK[p.stuckRisk] ?? 0) < 1) continue;
      const cur = riskByPerson.get(p.userName);
      if (!cur || (RISK_RANK[p.stuckRisk] ?? 0) > (RISK_RANK[cur.stuckRisk] ?? 0)) {
        riskByPerson.set(p.userName, p);
      }
    }
  }
  const atRisk = [...riskByPerson.values()].sort(
    (a, b) => (RISK_RANK[b.stuckRisk] ?? 0) - (RISK_RANK[a.stuckRisk] ?? 0)
  );
  const hasAttention =
    criticalList.length > 0 || overdueList.length > 0 || atRisk.length > 0;

  // Team load table: people with open tasks, heaviest first (0-load users hidden
  // here; they still appear as reassignment targets on the Workload page).
  const capacity = teamLoad
    .filter((p) => p.open > 0)
    .sort((a, b) => b.open - a.open);

  const activeProjectLimit = activeProjectCoordinationLimit(teamLoad.length);
  const velocity = velocityWeeks.map((w) => ({ label: w.week, value: w.count }));

  return (
    <div className="w-full space-y-6">
      <Reveal className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance">
            Overview
          </h1>
          <p className="text-pretty text-muted-foreground">
            See every project in one place — health, funding, blockers, and deadlines.
          </p>
        </div>
        <a
          href="/api/reports/portfolio"
          className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted/40"
          download
        >
          <Download className="size-4" />
          Export report
        </a>
      </Reveal>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No projects yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Reveal>
              <Card>
                <CardContent className="flex items-center gap-4 py-4">
                  <RagDonut red={rag.red} amber={rag.amber} green={rag.green} />
                  <ul className="space-y-1.5 text-sm">
                    <HealthRow label="On track" status="green" n={rag.green} />
                    <HealthRow label="Needs attention" status="amber" n={rag.amber} />
                    <HealthRow label="At risk" status="red" n={rag.red} />
                  </ul>
                </CardContent>
              </Card>
            </Reveal>
            <StaggerGroup
              className="grid gap-4 sm:grid-cols-2 lg:col-span-2"
              delayChildren={0.08}
            >
              <StaggerItem>
                <StatCard
                  icon={FolderKanban}
                  label="Active projects"
                  value={<AnimatedNumber value={active} />}
                  hint={
                    active > activeProjectLimit
                      ? "check assignments"
                      : "active or planning"
                  }
                  tone={active > activeProjectLimit ? "warning" : undefined}
                />
              </StaggerItem>
              <StaggerItem>
                <StatCard
                  icon={AlertTriangle}
                  label="Overdue"
                  value={<AnimatedNumber value={overdue} />}
                  hint="past due date"
                  tone={overdue > 0 ? "destructive" : undefined}
                />
              </StaggerItem>
              <StaggerItem>
                <StatCard
                  icon={Banknote}
                  label="To raise"
                  value={
                    <AnimatedNumber
                      value={totalToRaise}
                      format="currency"
                      currency={currency}
                    />
                  }
                  hint="across all budgets"
                  tone={totalToRaise > 0 ? "warning" : undefined}
                />
              </StaggerItem>
              <StaggerItem>
                <StatCard
                  icon={ShieldAlert}
                  label="Critical blockers"
                  value={<AnimatedNumber value={criticalBlockers} />}
                  hint="need action now"
                  tone={criticalBlockers > 0 ? "destructive" : undefined}
                />
              </StaggerItem>
            </StaggerGroup>
          </div>

          {hasAttention ? (
            <section className="space-y-3">
              <h2 className="font-heading text-lg font-semibold">Attention needed</h2>
              <StaggerGroup className="grid gap-4 md:grid-cols-3" inView>
                <StaggerItem className="h-full">
                <AttentionCard
                  icon={ShieldAlert}
                  title="Critical blockers"
                  count={criticalList.length}
                  empty="None"
                >
                  {criticalList.slice(0, 6).map((b) => (
                    <li key={b.key} className="text-sm">
                      <Link href={`/projects/${b.slug}`} className="hover:underline">
                        <span className="font-medium">{b.project}</span>
                      </Link>{" "}
                      <span className="text-muted-foreground">— {b.title}</span>
                    </li>
                  ))}
                </AttentionCard>
                </StaggerItem>

                <StaggerItem className="h-full">
                <AttentionCard
                  icon={CalendarClock}
                  title="Overdue projects"
                  count={overdueList.length}
                  empty="None"
                >
                  {overdueList.slice(0, 6).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/projects/${p.slug}`} className="truncate font-medium hover:underline">
                        {p.title}
                      </Link>
                      <span className="shrink-0 text-xs font-medium text-destructive">
                        {dueLabel(p.dueDate).text}
                      </span>
                    </li>
                  ))}
                </AttentionCard>
                </StaggerItem>

                <StaggerItem className="h-full">
                <AttentionCard
                  icon={UserRound}
                  title="People at risk"
                  count={atRisk.length}
                  empty="Everyone's clear"
                >
                  {atRisk.slice(0, 6).map((p) => (
                    <li key={p.userName} className="text-sm">
                      <span className="font-medium">{p.userName}</span>
                      <span
                        className={
                          p.stuckRisk === "high"
                            ? "ml-1.5 text-xs font-medium text-destructive"
                            : "ml-1.5 text-xs font-medium text-warning"
                        }
                      >
                        {p.stuckRisk}
                      </span>
                      {p.impediments[0] ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.impediments[0]}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </AttentionCard>
                </StaggerItem>
              </StaggerGroup>
            </section>
          ) : null}

          {updateRecommendations.length > 0 ? (
            <Reveal inView className="block">
              <section className="space-y-3" aria-labelledby="update-recommendations-heading">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2
                      id="update-recommendations-heading"
                      className="font-heading text-lg font-semibold"
                    >
                      Follow up from project updates
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      AI found work, decisions, or ownership that may not be reflected
                      in the project plan yet.
                    </p>
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {updateRecommendations.length} awaiting review
                  </span>
                </div>
                <Card>
                  <CardContent className="p-0">
                    <ul className="divide-y">
                      {updateRecommendations.map((item) => (
                        <li
                          key={item.updateId}
                          className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Sparkles className="size-4 text-info" />
                              <Link
                                href={`/projects/${item.projectSlug}`}
                                className="font-medium hover:underline"
                              >
                                {item.projectTitle}
                              </Link>
                              <span
                                className={
                                  item.analysis.priority === "high"
                                    ? "text-xs font-medium text-destructive"
                                    : item.analysis.priority === "medium"
                                      ? "text-xs font-medium text-warning"
                                      : "text-xs text-muted-foreground"
                                }
                              >
                                {item.analysis.priority} priority
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-pretty">
                              {item.analysis.recommendations[0]?.title ??
                                item.analysis.summary}
                            </p>
                            {item.analysis.recommendations[0]?.reason ? (
                              <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                                {item.analysis.recommendations[0].reason}
                              </p>
                            ) : null}
                            {item.analysis.recommendations.length > 1 ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                +{item.analysis.recommendations.length - 1} more on the
                                project
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-3 sm:justify-end">
                            <span className="text-xs text-muted-foreground">
                              {timeAgo(item.createdAt)}
                            </span>
                            <Link
                              href={`/projects/${item.projectSlug}`}
                              className="text-sm font-medium text-primary hover:underline"
                            >
                              Review project
                            </Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </section>
            </Reveal>
          ) : null}

          {missingDueDateCount > 0 ? (
            <Reveal inView className="block">
              <Link
                href="/overview/due-dates"
                className="group flex items-center gap-3 rounded-lg border border-dashed bg-card px-4 py-2.5 text-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <CalendarPlus className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 text-pretty">
                  <span className="font-medium tabular-nums">
                    {missingDueDateCount}
                  </span>{" "}
                  active {missingDueDateCount === 1 ? "project has" : "projects have"}{" "}
                  no due date — they&apos;re missing from the timeline and
                  forecast.
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 font-medium text-primary">
                  Add dates
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </Reveal>
          ) : null}

          <Reveal inView>
            <PortfolioTable rows={rows} />
          </Reveal>

          {comingDue.length > 0 ? (
            <Reveal inView className="block">
              <Card>
                <CardContent className="space-y-1 py-4">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <CalendarClock className="size-4 text-muted-foreground" />
                      Coming due
                    </p>
                    <Link
                      href="/tasks?view=agenda"
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Open agenda
                    </Link>
                  </div>
                  <ul className="-mx-2 divide-y">
                    {comingDue.map((item) => (
                      <li key={item.id}>
                        <AgendaRow item={item} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </Reveal>
          ) : null}

          {rows.some((r) => r.dueDate || projects.find((p) => p.id === r.id)?.startDate) ? (
            <Reveal inView className="block">
            <Card>
              <CardContent className="space-y-2 py-4">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <CalendarClock className="size-4 text-muted-foreground" />
                  Timeline
                </p>
                <Timeline
                  today={todayYmd()}
                  rows={projects
                    .filter((p) => p.status === "active" || p.status === "planning")
                    .map((p) => ({
                      id: p.id,
                      label: p.title,
                      start: p.startDate,
                      end: p.dueDate,
                      href: `/projects/${p.slug}`,
                      color: p.healthStatus
                        ? HEALTH_BAR[p.healthStatus]
                        : undefined,
                      markers: milestonesByProject.get(p.id),
                    }))}
                />
              </CardContent>
            </Card>
            </Reveal>
          ) : null}

          <Reveal inView className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="space-y-2 py-4">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <TrendingUp className="size-4 text-muted-foreground" />
                  Velocity
                  <span className="text-xs font-normal text-muted-foreground">
                    tasks completed / week
                  </span>
                </p>
                <TrendLine data={velocity} color="var(--success)" unit="done" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2 py-4">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Users className="size-4 text-muted-foreground" />
                  Team load
                </p>
                <CapacityHeatmap people={capacity} />
              </CardContent>
            </Card>
          </Reveal>

          {recentActivity.length > 0 ? (
            <Reveal inView className="block">
            <Card>
              <CardContent className="space-y-2 py-4">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Activity className="size-4 text-muted-foreground" />
                  Recent activity
                </p>
                <ul className="space-y-1.5 text-sm">
                  {recentActivity.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-baseline gap-x-2"
                    >
                      <span>{a.summary}</span>
                      {a.projectSlug ? (
                        <Link
                          href={`/projects/${a.projectSlug}`}
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {a.projectTitle}
                        </Link>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        · {a.actorName ?? "Someone"} · {timeAgo(a.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            </Reveal>
          ) : null}

          {cronRuns.length > 0 ? (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium">Automations:</span>
              {cronRuns
                // Manual recomputes are throttle bookkeeping, not an automation.
                .filter((c) => c.name !== "manual-recompute")
                .map((c) => {
                  const stale =
                    nowMs - c.lastRunAt.getTime() >
                    (CRON_STALE_MS[c.name] ?? 36 * 3_600_000);
                  const tone = !c.ok
                    ? "bg-destructive"
                    : stale
                      ? "bg-warning"
                      : "bg-success";
                  return (
                    <span key={c.name} className="inline-flex items-center gap-1.5">
                      <span className={`size-1.5 rounded-full ${tone}`} aria-hidden />
                      {CRON_LABEL[c.name] ?? c.name} {timeAgo(c.lastRunAt)}
                      {stale ? " (stale)" : ""}
                    </span>
                  );
                })}
              <RefreshAllHealthButton />
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function HealthRow({
  label,
  status,
  n,
}: {
  label: string;
  status: string;
  n: number;
}) {
  return (
    <li className="flex items-center gap-2">
      <HealthDot status={status} />
      <span className="flex-1">{label}</span>
      <span className="tabular-nums text-muted-foreground">{n}</span>
    </li>
  );
}

function AttentionCard({
  icon: Icon,
  title,
  count,
  empty,
  children,
}: {
  icon: typeof ShieldAlert;
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardContent className="space-y-2 py-4">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Icon className="size-4 text-muted-foreground" />
          {title}
          <span className="ml-auto tabular-nums text-muted-foreground">{count}</span>
        </p>
        {count === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-1.5">{children}</ul>
        )}
      </CardContent>
    </Card>
  );
}
