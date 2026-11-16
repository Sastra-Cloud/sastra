import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ArrowRight } from "lucide-react";

import { requireUser } from "@/lib/auth/guards";
import { getMyTasks } from "@/lib/tasks/queries";
import { listAssignableUsers, listProjects } from "@/lib/projects/queries";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HealthDot } from "@/components/badges";
import { MyTasksList } from "@/components/tasks/my-tasks-list";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { StreamedManagerReview, StreamedOnboarding } from "@/components/dashboard/streamed-sections";
import { getManagerAttention } from "@/lib/dashboard/attention";
import { PrintFundingBadge } from "@/components/projects/print-funding-badge";
import { PushNudge } from "@/components/pwa/push-nudge";
import { getOnboardingSignals } from "@/lib/onboarding/queries";

import { can, canManage } from "@/lib/auth/policy";
import { projectOptionLabel } from "@/lib/projects/visibility";
import { orderProjectsByDashboardActivity } from "@/lib/projects/dashboard-order";
import { isBookProjectKind } from "@/lib/projects/print-funding";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { PageShell } from "@/components/cockpit";

export const metadata = { title: "Home" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { user } = await requireUser();
  const canReviewCorrespondence = canManage(user);
  // Only fetch onboarding signals when guidance is on (the checklist is hidden
  // otherwise), so experienced users pay nothing for it.
  const guidanceEnabled =
    (user as { guidanceLevel?: string }).guidanceLevel !== "off";
  // Secondary work starts now, beside the reads that tasks need, but nothing
  // below waits for it. The no-op catch only stops an unhandled-rejection
  // warning on this copy; the original rejection still reaches the page, which
  // shows a recovery message for that section alone.
  const onboardingSignals = guidanceEnabled ? getOnboardingSignals(user.id) : null;
  onboardingSignals?.catch(() => undefined);
  const [myTasks, users, projects, workspace] = await Promise.all([
    getMyTasks(user.id), listAssignableUsers(),
    listProjects({ includeDashboardActivity: true }), getWorkspaceSettings(),
  ]);
  const reviewItems = canReviewCorrespondence
    ? getManagerAttention(projects, users.length) : null;
  reviewItems?.catch(() => undefined);

  const todayIso = formatInTimeZone(new Date(), workspace.timezone, "yyyy-MM-dd");

  const allActiveProjects = projects.filter(
    (p) => p.status === "active" || p.status === "planning"
  );
  const activeProjects = orderProjectsByDashboardActivity(allActiveProjects).slice(
    0,
    3
  );
  // The side rail exists when it has projects, or when a manager's review list
  // is still loading. A rail that ends up empty is hidden, and the grid then
  // gives its track back (see the `:has()` classes below).
  const hasProjects = activeProjects.length > 0;
  const hasSecondary = hasProjects || reviewItems !== null;
  const projectOptions = projects.map((project) => ({
    id: project.id,
    name: projectOptionLabel(project),
  }));

  return (
    <PageShell>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-pretty">
              Home
            </h1>
            <p className="mt-1 max-w-2xl text-pretty wrap-anywhere text-muted-foreground">
              Welcome, {user.name.split(" ")[0]}. Here&apos;s what&apos;s next.
            </p>
          </div>
        </div>
        <CreateTaskDialog
          canManage={can(user, "tasks.manage")}
          assignees={users.map((u) => ({ id: u.id, name: u.name }))}
          projects={projectOptions}
          defaultAssignee={user.id}
          triggerLabel="Create task"
        />
      </section>

      <div className="@container/home min-w-0">
        <div
          className={cn(
            "group/grid grid min-w-0 items-start gap-8 @[100rem]/home:gap-12",
            hasSecondary &&
              "@[76rem]/home:has-[>aside:not(:empty)]:grid-cols-[minmax(0,1fr)_26rem]"
          )}
        >
          <div
            className={cn(
              "min-w-0 space-y-5",
              "@[76rem]/home:max-w-5xl",
              hasSecondary && "@[76rem]/home:group-has-[>aside:not(:empty)]/grid:max-w-none"
            )}
          >
            <MyTasksList
              tasks={myTasks}
              homePreview
              todayIso={todayIso}
              timeZone={workspace.timezone}
              editor={{
                assignees: users.map((item) => ({ id: item.id, name: item.name })),
                projects: projectOptions,
                currentUserId: user.id,
                canManage: can(user, "tasks.manage"),
              }}
            />
          </div>

          {hasSecondary ? (
            <aside aria-label="Workspace updates" className="min-w-0 space-y-8 empty:hidden @[76rem]/home:border-l @[76rem]/home:pl-6">
              {hasProjects ? (
                <section className="space-y-2" aria-labelledby="active-projects-heading">
                  <div className="flex items-baseline justify-between">
                    <h2 id="active-projects-heading" className="text-lg font-semibold">Active projects</h2>
                    <Link
                      href="/projects"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      View all {allActiveProjects.length} <ArrowRight className="size-3" />
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
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title={`${p.doneTasks} of ${p.totalTasks} tasks complete`}>
                                  {pct}%
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
              {reviewItems ? <StreamedManagerReview items={reviewItems} limit={3} /> : null}
            </aside>
          ) : null}
        </div>
      </div>

      {/* Late guidance must not move the tasks or project links above it. */}
      {onboardingSignals ? (
        <StreamedOnboarding role={user.role as string} signals={onboardingSignals} />
      ) : null}

      {/* Self-hides unless this device can still install/enable push. */}
      <PushNudge />
    </PageShell>
  );
}
