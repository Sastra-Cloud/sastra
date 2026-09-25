import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ListChecks,
  WalletCards,
} from "lucide-react";

import { requireUser } from "@/lib/auth/guards";
import { getMyTasks } from "@/lib/tasks/queries";
import { listAssignableUsers, listProjects } from "@/lib/projects/queries";
import { daysUntil, timeAgo } from "@/lib/format";
import { HealthDot } from "@/components/badges";
import { StatCard } from "@/components/portfolio/stat-card";
import { MyTasksList } from "@/components/tasks/my-tasks-list";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import {
  ManagerReviewQueue,
  type ManagerReviewItem,
} from "@/components/dashboard/manager-review-queue";
import { PrintFundingBadge } from "@/components/projects/print-funding-badge";
import { PushNudge } from "@/components/pwa/push-nudge";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import {
  getOnboardingSignals,
  type OnboardingSignals,
} from "@/lib/onboarding/queries";
import { activeProjectCoordinationLimit } from "@/lib/flow";
import { splitTasksByAttention } from "@/lib/tasks/attention";
import {
  listUnreadNotificationsByType,
  notificationProject,
} from "@/lib/notifications/queries";
import { can, canManage } from "@/lib/auth/policy";
import { projectOptionLabel } from "@/lib/projects/visibility";
import { orderProjectsByDashboardActivity } from "@/lib/projects/dashboard-order";
import {
  isBookProjectKind,
  needsPrintFundingReview,
} from "@/lib/projects/print-funding";
import { listManagerUpdateRecommendations } from "@/lib/projects/status-queries";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { user } = await requireUser();
  const canReviewCorrespondence = canManage(user);
  // Only fetch onboarding signals when guidance is on (the checklist is hidden
  // otherwise), so experienced users pay nothing for it.
  const guidanceEnabled =
    (user as { guidanceLevel?: string }).guidanceLevel !== "off";
  const onboardingSignals: OnboardingSignals | null = guidanceEnabled
    ? await getOnboardingSignals(user.id)
    : null;
  const [
    myTasks,
    users,
    projects,
    possibleNewProjects,
    possibleCounterparties,
    possibleProjectUpdates,
    projectUpdateRecommendations,
  ] = await Promise.all([
    getMyTasks(user.id),
    listAssignableUsers(),
    listProjects({ includeDashboardActivity: true }),
    canReviewCorrespondence
      ? listUnreadNotificationsByType(user.id, "possible_new_project", 4)
      : Promise.resolve([]),
    canReviewCorrespondence
      ? listUnreadNotificationsByType(user.id, "possible_counterparty", 4)
      : Promise.resolve([]),
    canReviewCorrespondence
      ? listUnreadNotificationsByType(user.id, "possible_project_update", 4)
      : Promise.resolve([]),
    canReviewCorrespondence
      ? listManagerUpdateRecommendations(8)
      : Promise.resolve([]),
  ]);
  const notificationSuggestions = [
    ...possibleNewProjects,
    ...possibleCounterparties,
    ...possibleProjectUpdates,
  ];
  const reviewPriority = { high: 0, medium: 1, low: 2 } as const;
  const reviewItems: ManagerReviewItem[] = [
    ...projectUpdateRecommendations.map((item) => ({
      id: `project-update:${item.updateId}`,
      source: "project_follow_up" as const,
      title: item.analysis.recommendations[0]?.title ?? item.analysis.summary,
      detail: item.analysis.recommendations[0]?.reason ?? item.analysis.summary,
      project: item.projectTitle,
      priority: item.analysis.priority,
      href: `/projects/${item.projectSlug}#status-update`,
      actionLabel: "Review project",
      createdAt: item.createdAt,
    })),
    ...notificationSuggestions.map((item) => ({
      id: `notification:${item.id}`,
      source:
        item.type === "possible_project_update"
          ? ("project_update" as const)
          : item.type === "possible_new_project"
            ? ("new_project" as const)
            : ("counterparty" as const),
      title: item.title,
      detail: item.body,
      project: notificationProject(item.data),
      priority: "medium" as const,
      href: item.link ?? "/correspondence",
      actionLabel: "Review email",
      createdAt: item.createdAt,
    })),
  ]
    .sort(
      (a, b) =>
        reviewPriority[a.priority] - reviewPriority[b.priority] ||
        b.createdAt.getTime() - a.createdAt.getTime()
    )
    .slice(0, 5);

  const overdue = myTasks
    .filter((t) => {
      const d = daysUntil(t.dueDate);
      return d !== null && d < 0;
    })
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const nonOverdue = myTasks.filter((t) => !overdue.includes(t));
  const { attention: upNext, later } = splitTasksByAttention(
    nonOverdue,
    new Date().toISOString().slice(0, 10)
  );
  const dueThisWeek = myTasks.filter((t) => {
    const d = daysUntil(t.dueDate);
    return d !== null && d >= 0 && d <= 7;
  }).length;

  const allActiveProjects = projects.filter(
    (p) => p.status === "active" || p.status === "planning"
  );
  // Managers/admins get a nudge to schedule live projects that lack a target
  // completion date — undated work is invisible to the timeline and forecasts.
  const missingDueDate = can(user, "project.edit")
    ? projects.filter(
        (p) =>
          !p.dueDate &&
          (p.status === "planning" ||
            p.status === "active" ||
            p.status === "on_hold")
      )
    : [];
  const printFundingNeeds = can(user, "project.edit")
    ? projects.filter(
        (project) =>
          isBookProjectKind(project.kind) &&
          (project.status === "planning" ||
            project.status === "active" ||
            project.status === "on_hold") &&
          needsPrintFundingReview(project.printFundingStatus)
      )
    : [];
  const teamSize = users.length;
  const projectCoordinationLimit = activeProjectCoordinationLimit(teamSize);
  const activeProjects = orderProjectsByDashboardActivity(allActiveProjects).slice(
    0,
    6
  );
  const focusTasks = [...overdue, ...upNext].slice(0, 3);
  const remainingAttention = Math.max(
    0,
    overdue.length + upNext.length - focusTasks.length
  );
  const visibleStats = [
    { key: "assigned", value: myTasks.length },
    { key: "overdue", value: overdue.length },
    { key: "week", value: dueThisWeek },
  ].filter((stat) => stat.value > 0);
  const projectOptions = projects.map((project) => ({
    id: project.id,
    name: projectOptionLabel(project),
  }));

  return (
    <div className="w-full space-y-6">
      <section className="surface-shadow flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <ListChecks className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-pretty">
              Welcome, {user.name.split(" ")[0]}
            </h1>
            <p className="text-muted-foreground">
              Here&apos;s what to do next, in order.
            </p>
          </div>
        </div>
        <CreateTaskDialog
          assignees={users.map((u) => ({ id: u.id, name: u.name }))}
          projects={projectOptions}
          defaultAssignee={user.id}
          triggerLabel="Create task"
        />
      </section>

      {onboardingSignals ? (
        <OnboardingChecklist
          role={user.role as string}
          signals={onboardingSignals}
        />
      ) : null}

      <section className="space-y-2" aria-labelledby="dashboard-order-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="dashboard-order-heading" className="text-lg font-semibold">
            Do in this order
          </h2>
          <span className="text-xs text-muted-foreground">
            Your three most important next steps
          </span>
        </div>
        {focusTasks.length > 0 ? (
          <>
            <MyTasksList
              tasks={focusTasks}
              editor={{
                assignees: users.map((item) => ({ id: item.id, name: item.name })),
                projects: projectOptions,
                currentUserId: user.id,
                canManage: can(user, "tasks.manage"),
              }}
            />
            <Link
              href="/tasks"
              className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              {remainingAttention > 0
                ? `${remainingAttention} more needing attention — view all work`
                : later.length > 0
                  ? `${later.length} planned for later — view all work`
                  : "Open My Work"}
              <ArrowRight className="size-3.5" />
            </Link>
          </>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
            <div>
              <p className="font-medium">You&apos;re caught up</p>
              <p className="text-muted-foreground">
                {later.length > 0
                  ? "Future work is planned and will appear here as it approaches."
                  : "New work assigned to you will appear here."}
              </p>
            </div>
          </div>
        )}
      </section>

      <ManagerReviewQueue items={reviewItems} />

      {activeProjects.length > 0 ? (
        <section className="space-y-2" aria-labelledby="active-projects-heading">
          <div className="flex items-baseline justify-between">
            <h2 id="active-projects-heading" className="text-lg font-semibold">Active projects</h2>
            <Link
              href="/projects"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          <ul className="divide-y rounded-lg border bg-card">
            {activeProjects.map((p) => {
              const pct = p.totalTasks
                ? Math.round((p.doneTasks / p.totalTasks) * 100)
                : 0;
              return (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.slug}`}
                    className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <span className="mt-1.5 shrink-0">
                      <HealthDot status={p.healthStatus} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {p.title}
                        </span>
                        {p.blockerCount > 0 ? (
                          <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium tabular-nums text-destructive">
                            {p.blockerCount} blocker{p.blockerCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {p.doneTasks}/{p.totalTasks} · {pct}%
                        </span>
                      </span>
                      {p.latestStatusUpdateBody && p.latestStatusUpdateCreatedAt ? (
                        <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                          {isBookProjectKind(p.kind) ? (
                            <PrintFundingBadge
                              status={p.printFundingStatus}
                              summary={p.fundingSummary}
                              compact
                            />
                          ) : null}
                          <span className="flex min-w-0 flex-1 items-baseline gap-1">
                            <span className="sr-only shrink-0 sm:not-sr-only sm:inline">
                              Latest update
                            </span>
                            <span className="hidden sm:inline" aria-hidden="true">
                              ·
                            </span>
                            {p.latestStatusUpdateAuthorName ? (
                              <span className="sr-only min-w-0 items-baseline gap-1 sm:not-sr-only sm:flex">
                                <span className="max-w-24 truncate">
                                  {p.latestStatusUpdateAuthorName}
                                </span>
                                <span aria-hidden="true">·</span>
                              </span>
                            ) : null}
                            <span className="shrink-0">
                              {timeAgo(p.latestStatusUpdateCreatedAt)}
                            </span>
                            <span aria-hidden="true">—</span>
                            <span
                              className="min-w-0 truncate"
                              title={p.latestStatusUpdateBody}
                            >
                              {p.latestStatusUpdateBody}
                            </span>
                          </span>
                        </span>
                      ) : (
                        <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                          {isBookProjectKind(p.kind) ? (
                            <PrintFundingBadge
                              status={p.printFundingStatus}
                              summary={p.fundingSummary}
                              compact
                            />
                          ) : null}
                          <span className="truncate">No status update yet</span>
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {missingDueDate.length > 0 ? (
        <Link
          href="/overview/due-dates"
          className="group flex items-center gap-4 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <CalendarPlus className="size-5.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              <span className="tabular-nums">{missingDueDate.length}</span>{" "}
              {missingDueDate.length === 1 ? "project needs" : "projects need"} a
              due date
            </p>
            <p className="text-sm text-muted-foreground text-pretty">
              Set target completion dates so they show on the timeline and
              forecast.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
            Add dates
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      ) : null}

      {printFundingNeeds.length > 0 ? (
        <Link
          href="/projects?printFunding=needs_review"
          className="group flex items-center gap-4 rounded-xl border border-warning/35 bg-warning/5 px-4 py-3.5 transition-colors hover:border-warning/55 hover:bg-warning/10"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-foreground">
            <WalletCards className="size-5.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">
              <span className="tabular-nums">{printFundingNeeds.length}</span>{" "}
              {printFundingNeeds.length === 1 ? "book needs" : "books need"}{" "}
              print funding review
            </p>
            <p className="text-sm text-muted-foreground text-pretty">
              Set or update the funding flag in each book&apos;s Project settings.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
            Review funding
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      ) : null}

      {allActiveProjects.length > projectCoordinationLimit ? (
        <section className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">
              Portfolio needs a coordination pass
            </p>
            <p className="text-muted-foreground text-pretty">
              {allActiveProjects.length} projects are active or planning across{" "}
              {teamSize} team {teamSize === 1 ? "member" : "members"}. Open a
              project&apos;s Tasks to assign its next step, then use Overview to
              review blockers and team capacity before starting more work.
            </p>
          </div>
          <Link
            href="/projects"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-md px-3 font-medium text-primary transition-colors hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Review projects
            <ArrowRight className="size-3.5" />
          </Link>
        </section>
      ) : null}

      <section className="space-y-2" aria-labelledby="dashboard-status-heading">
        <h2 id="dashboard-status-heading" className="text-lg font-semibold">
          Work status
        </h2>
        {visibleStats.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" />
            No assigned, overdue, or upcoming tasks need attention.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {myTasks.length > 0 ? (
              <StatCard
                icon={ListChecks}
                label="Assigned to me"
                value={myTasks.length}
                hint="open tasks"
              />
            ) : null}
            {overdue.length > 0 ? (
              <StatCard
                icon={AlertTriangle}
                label="Overdue"
                value={overdue.length}
                hint="need attention"
                tone="destructive"
              />
            ) : null}
            {dueThisWeek > 0 ? (
              <Link href="/tasks?view=agenda" className="block">
                <StatCard
                  icon={CalendarClock}
                  label="Due this week"
                  value={dueThisWeek}
                  hint="next 7 days · view agenda"
                />
              </Link>
            ) : null}
          </div>
        )}
      </section>

      {/* Self-hides unless this device can still install/enable push. */}
      <PushNudge />
    </div>
  );
}
