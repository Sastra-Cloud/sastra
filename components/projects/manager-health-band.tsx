import Link from "next/link";
import { ArrowRight, Gauge } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { TrendLine } from "@/components/portfolio/charts/trend-line";
import { formatDate } from "@/lib/format";
import type { ForecastRisk } from "@/lib/forecast/velocity";
import { cn } from "@/lib/utils";

const FORECAST_LABEL: Record<ForecastRisk, { label: string; cls: string }> = {
  likely_late: { label: "likely late", cls: "font-medium text-destructive" },
  at_risk: { label: "at risk", cls: "text-warning" },
  on_track: { label: "on track", cls: "text-success" },
  unknown: { label: "", cls: "text-muted-foreground" },
};

const RIGHTS: Record<string, { label: string; cls: string }> = {
  none: { label: "Not started", cls: "bg-secondary text-secondary-foreground" },
  in_progress: { label: "In progress", cls: "bg-warning text-warning-foreground" },
  complete: { label: "Complete", cls: "bg-success text-success-foreground" },
};

export type ManagerHealthProps = {
  budget: {
    needed: number;
    committed: number;
    received: number;
    spent: number;
    currency: string;
  } | null;
  rights: { overallStatus: string; completeByDate: string | null } | null;
  rightsOverdue: boolean;
  velocity: { label: string; value: number }[];
  teamLoad: { name: string; open: number; overdue: number }[];
  impediments: { userName: string; stuckRisk: string; top: string | null }[];
  forecast?: { risk: ForecastRisk; projectedDate: string | null } | null;
  projectSlug: string;
};

export function ManagerHealthBand({
  budget,
  rights,
  rightsOverdue,
  velocity,
  teamLoad,
  impediments,
  forecast,
  projectSlug,
}: ManagerHealthProps) {
  const money = (n: number, currency: string) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  const promisedPct =
    budget && budget.needed > 0
      ? Math.round((budget.committed / budget.needed) * 100)
      : null;
  const receivedPct =
    budget && budget.needed > 0
      ? Math.round((budget.received / budget.needed) * 100)
      : null;
  const rightsInfo = rights ? RIGHTS[rights.overallStatus] ?? RIGHTS.none : RIGHTS.none;
  const hasVelocity =
    velocity.length >= 2 && velocity.some((point) => point.value > 0);

  return (
    <Card size="sm">
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Gauge className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Project health</h2>
            <p className="text-xs text-muted-foreground">
              Funding, rights, delivery, and workload for managers.
            </p>
          </div>
        </div>

        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Budget */}
          <div className="space-y-1.5">
            <Link
              href={`/projects/${projectSlug}/budget`}
              className="group inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Funding
              <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
            {budget && budget.needed > 0 ? (
              <>
                <p className="text-lg font-semibold tabular-nums">
                  {money(budget.committed, budget.currency)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    / {money(budget.needed, budget.currency)}
                  </span>
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-success"
                    style={{ width: `${Math.min(100, promisedPct ?? 0)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {promisedPct}% promised · {receivedPct}% received · {money(budget.spent, budget.currency)} spent
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No budget set</p>
            )}
          </div>

          {/* Rights */}
          <div className="space-y-1.5">
            <Link
              href={`/projects/${projectSlug}/rights`}
              className="group inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Rights
              <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                rightsInfo.cls
              )}
            >
              {rightsInfo.label}
            </span>
            {rights?.completeByDate ? (
              <p
                className={cn(
                  "text-xs tabular-nums",
                  rightsOverdue ? "font-medium text-destructive" : "text-muted-foreground"
                )}
              >
                {rightsOverdue ? "Overdue — due " : "Due "}
                {formatDate(rights.completeByDate)}
              </p>
            ) : null}
          </div>

          {/* Velocity */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Delivery</p>
            {hasVelocity ? (
              <TrendLine data={velocity} color="var(--success)" height={32} unit="done" />
            ) : (
              <p className="text-sm text-muted-foreground">Not enough history yet</p>
            )}
            {forecast && forecast.risk !== "unknown" ? (
              <p
                className={cn(
                  "text-xs tabular-nums",
                  FORECAST_LABEL[forecast.risk].cls
                )}
              >
                {forecast.projectedDate
                  ? `Projected finish ${formatDate(forecast.projectedDate)} (${FORECAST_LABEL[forecast.risk].label})`
                  : forecast.risk === "likely_late"
                    ? "Due date at risk"
                    : FORECAST_LABEL[forecast.risk].label}
              </p>
            ) : null}
          </div>

          {/* Team load */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Workload</p>
            {teamLoad.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No assigned open tasks
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {teamLoad.slice(0, 4).map((m) => (
                  <li key={m.name} className="flex items-center justify-between gap-2">
                    <span className="truncate">{m.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {m.open}
                      {m.overdue > 0 ? (
                        <span className="text-destructive"> ·{m.overdue} late</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {impediments.length > 0 ? (
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              Recent impediments (from standups)
            </p>
            <ul className="space-y-1 text-sm">
              {impediments.map((p) => (
                <li key={p.userName}>
                  <span className="font-medium">{p.userName}</span>
                  <span
                    className={cn(
                      "ml-1.5 text-xs font-medium",
                      p.stuckRisk === "high" ? "text-destructive" : "text-warning"
                    )}
                  >
                    {p.stuckRisk}
                  </span>
                  {p.top ? (
                    <span className="text-muted-foreground"> — {p.top}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
