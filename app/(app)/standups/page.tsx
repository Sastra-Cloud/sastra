import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MessageSquare,
  Settings2,
  Sunrise,
} from "lucide-react";

import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { getMyOpenStandup, getStandupView } from "@/lib/standup/view-queries";
import { EmptyState, PageHero, PageShell } from "@/components/cockpit";
import { StatCard } from "@/components/portfolio/stat-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Standups" };
export const dynamic = "force-dynamic";

const RUN_BADGE: Record<string, string> = {
  completed: "bg-success text-success-foreground",
  in_progress: "bg-info text-info-foreground",
  missed: "bg-destructive text-destructive-foreground",
  pending: "bg-secondary text-secondary-foreground",
};
const RISK_BADGE: Record<string, string> = {
  high: "bg-destructive text-destructive-foreground",
  medium: "bg-warning text-warning-foreground",
  low: "bg-secondary text-secondary-foreground",
};

export default async function StandupsPage() {
  const { user } = await requireUser();
  const canManage = can(user, "standups.manage");
  const [mine, view] = await Promise.all([
    getMyOpenStandup(user.id),
    getStandupView(),
  ]);
  const runsToday = view.reduce((sum, s) => sum + s.runs.length, 0);
  const completedRuns = view.reduce(
    (sum, s) => sum + s.runs.filter((r) => r.status === "completed").length,
    0
  );
  const highRisk = view.reduce(
    (sum, s) =>
      sum + (s.report?.people.filter((p) => p.stuckRisk === "high").length ?? 0),
    0
  );

  return (
    <PageShell>
      <PageHero
        icon={<Sunrise className="size-6" />}
        eyebrow="Daily ritual"
        title="Standups"
        description="Track who has checked in, surface stuck work, and route the next conversation before momentum stalls."
        actions={
          canManage ? (
            <Link
              href="/settings/standups"
              className={buttonVariants({ variant: "outline" })}
            >
              <Settings2 className="size-4" />
              Configure
            </Link>
          ) : null
        }
      />

      {mine?.channelId ? (
        <Card className="surface-shadow bg-info/5 ring-info/30">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-heading text-lg font-semibold">
                Your standup is waiting
              </p>
              <p className="text-sm text-muted-foreground">
                {mine.name} is open. Answer the bot to complete today&apos;s check-in.
              </p>
            </div>
            <Link
              href={`/chat/${mine.channelId}`}
              className={buttonVariants({ size: "sm", className: "w-full sm:w-auto" })}
            >
              <MessageSquare className="size-4" />
              Answer now
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Sunrise}
          label="Configured rituals"
          value={view.length}
          hint="active schedules"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed today"
          value={`${completedRuns}/${runsToday}`}
          hint={runsToday === 0 ? "not started" : "responses captured"}
          tone={runsToday > 0 && completedRuns === runsToday ? "success" : undefined}
        />
        <StatCard
          icon={AlertTriangle}
          label="High risk"
          value={highRisk}
          hint="people flagged in digest"
          tone={highRisk > 0 ? "destructive" : undefined}
        />
      </div>

      {view.length === 0 ? (
        <EmptyState
          icon={<Clock3 className="size-5" />}
          title="No standups configured yet"
          description="Create a daily or weekly ritual so the team can report progress and blockers without a meeting."
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              {canManage ? (
                <Link
                  href="/settings/standups"
                  className={buttonVariants({ variant: "outline" })}
                >
                  Set one up
                </Link>
              ) : null}
              <Link
                href="/help#standups"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Learn about standups
              </Link>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4">
          {view.map((s) => (
          <Card key={s.id} className="surface-shadow">
            <CardHeader>
              <CardTitle className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span>{s.name}</span>
                <span className="text-xs font-normal tabular-nums text-muted-foreground">
                  {s.localDate}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {s.runs.length === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    Not started today.
                  </span>
                ) : (
                  s.runs.map((r, i) => (
                    <Badge
                      key={i}
                      className={cn(RUN_BADGE[r.status] ?? RUN_BADGE.pending)}
                    >
                      {r.userName}: {r.status.replace("_", " ")}
                    </Badge>
                  ))
                )}
              </div>

              {canManage && s.report ? (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Latest digest · {s.report.runDate}
                  </p>
                  {s.report.people.map((p, i) => (
                    <div key={i} className="rounded-md border bg-card px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{p.userName}</span>
                        <Badge className={cn(RISK_BADGE[p.stuckRisk] ?? RISK_BADGE.low)}>
                          {p.stuckRisk} risk
                        </Badge>
                      </div>
                      {p.impediments.length > 0 ? (
                        <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                          {p.impediments.map((im, j) => (
                            <li key={j}>{im}</li>
                          ))}
                        </ul>
                      ) : null}
                      {p.reasoning ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {p.reasoning}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
