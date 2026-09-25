"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { HealthDot, ProjectStatusBadge } from "@/components/badges";
import { dueLabel } from "@/lib/format";
import type { ForecastRisk } from "@/lib/forecast/velocity";
import { cn } from "@/lib/utils";

export type PortfolioRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  healthStatus: string | null;
  dueDate: string | null;
  totalTasks: number;
  doneTasks: number;
  progressPct: number;
  blockerCount: number;
  critical: number;
  toRaise: number;
  fundedPct: number | null;
  currency: string;
  rightsStatus: string;
  forecastRisk: ForecastRisk;
  projectedDate: string | null;
};

const HEALTH_RANK: Record<string, number> = { red: 0, amber: 1, green: 2 };
const FORECAST_RANK: Record<ForecastRisk, number> = {
  likely_late: 0,
  at_risk: 1,
  on_track: 2,
  unknown: 3,
};
const FORECAST: Record<ForecastRisk, { label: string; cls: string }> = {
  likely_late: { label: "Late", cls: "text-destructive font-medium" },
  at_risk: { label: "At risk", cls: "text-warning" },
  on_track: { label: "On track", cls: "text-success" },
  unknown: { label: "—", cls: "text-muted-foreground" },
};

const RIGHTS: Record<string, { label: string; cls: string }> = {
  none: { label: "Not started", cls: "bg-secondary text-secondary-foreground" },
  in_progress: { label: "In progress", cls: "bg-warning text-warning-foreground" },
  complete: { label: "Complete", cls: "bg-success text-success-foreground" },
};

const DUE_TONE: Record<string, string> = {
  overdue: "font-medium text-destructive",
  soon: "text-warning",
  normal: "text-muted-foreground",
  none: "text-muted-foreground",
};

type SortKey =
  | "health"
  | "title"
  | "progress"
  | "funded"
  | "blockers"
  | "due"
  | "forecast";

const SORT_LABEL: Record<SortKey, string> = {
  due: "Due date",
  health: "Health",
  title: "Project name",
  progress: "Progress",
  funded: "Funded",
  blockers: "Blockers",
  forecast: "Forecast",
};

function money(n: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

function value(row: PortfolioRow, key: SortKey): number | string {
  switch (key) {
    case "health":
      return HEALTH_RANK[row.healthStatus ?? ""] ?? 9;
    case "title":
      return row.title.toLowerCase();
    case "progress":
      return row.progressPct;
    case "funded":
      return row.fundedPct ?? -1;
    case "blockers":
      return row.critical * 1000 + row.blockerCount;
    case "due":
      // Sorted ascending by default so the next project due for completion is on
      // top. Finished work isn't "due" — sink completed/cancelled below active
      // projects, and undated active projects just above those.
      if (row.status === "completed" || row.status === "cancelled") {
        return "9999-99-99~done";
      }
      return row.dueDate ?? "9999-99-99";
    case "forecast":
      return FORECAST_RANK[row.forecastRisk] ?? 9;
  }
}

function SortHeader({
  label,
  sortKey,
  align = "left",
  sort,
  onToggle,
}: {
  label: string;
  sortKey?: SortKey;
  align?: "left" | "right";
  sort: { key: SortKey; dir: "asc" | "desc" };
  onToggle: (key: SortKey) => void;
}) {
  const active = sortKey && sort.key === sortKey;
  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
      }
      className={cn(
        "px-3 py-2 text-xs font-medium text-muted-foreground",
        align === "right" ? "text-right" : "text-left"
      )}
    >
      {sortKey ? (
        <button
          type="button"
          onClick={() => onToggle(sortKey)}
          className={cn(
            "inline-flex items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            align === "right" && "flex-row-reverse",
            active && "text-foreground"
          )}
        >
          {label}
          {active ? (
            sort.dir === "asc" ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDown className="size-3" />
            )
          ) : (
            <ChevronsUpDown className="size-3 opacity-50" />
          )}
        </button>
      ) : (
        label
      )}
    </th>
  );
}

function FundedCell({ row }: { row: PortfolioRow }) {
  if (row.fundedPct === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(row.toRaise > 0 ? "text-foreground" : "text-success")}
      title={
        row.toRaise > 0
          ? `${money(row.toRaise, row.currency)} to raise`
          : "Fully funded"
      }
    >
      {row.fundedPct}%
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-success"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
        {pct}%
      </span>
    </>
  );
}

export function PortfolioTable({ rows }: { rows: PortfolioRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "due",
    dir: "asc",
  });

  const sorted = [...rows].sort((a, b) => {
    const av = value(a, sort.key);
    const bv = value(b, sort.key);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === "asc" ? cmp : -cmp;
  });

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "title" ? "asc" : "desc" }
    );

  return (
    <div className="rounded-lg border bg-card">
      {/* Mobile: the sortable column headers are hidden, so expose sort here. */}
      <div className="flex items-center gap-2 border-b px-3 py-2.5 md:hidden">
        <label
          htmlFor="portfolio-sort"
          className="text-xs font-medium text-muted-foreground"
        >
          Sort by
        </label>
        <select
          id="portfolio-sort"
          value={sort.key}
          onChange={(e) =>
            setSort({
              key: e.target.value as SortKey,
              dir: e.target.value === "title" ? "asc" : e.target.value === "due" ? "asc" : "desc",
            })
          }
          className="min-h-8 flex-1 rounded-md border bg-background px-2 py-1 text-sm"
        >
          {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              {SORT_LABEL[key]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() =>
            setSort((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))
          }
          className="inline-flex min-h-8 items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Sort ${sort.dir === "asc" ? "descending" : "ascending"}`}
        >
          {sort.dir === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )}
          {sort.dir === "asc" ? "Asc" : "Desc"}
        </button>
      </div>

      {/* Mobile: stacked cards. Nine columns can't breathe on a phone. */}
      <ul className="divide-y md:hidden">
        {sorted.map((r) => {
          const due = dueLabel(r.dueDate);
          const rights = RIGHTS[r.rightsStatus] ?? RIGHTS.none;
          return (
            <li key={r.id} className="space-y-2.5 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-start gap-2">
                  <span className="mt-0.5 shrink-0">
                    <HealthDot status={r.healthStatus} />
                  </span>
                  <Link
                    href={`/projects/${r.slug}`}
                    className="min-w-0 font-medium leading-snug text-pretty hover:underline"
                  >
                    {r.title}
                  </Link>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums",
                    DUE_TONE[due.tone]
                  )}
                >
                  {due.text}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <ProgressBar pct={r.progressPct} />
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                <ProjectStatusBadge status={r.status} />
                <span className="tabular-nums">
                  Funded <FundedCell row={r} />
                </span>
                {r.blockerCount > 0 ? (
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      r.critical > 0 ? "text-destructive" : "text-warning"
                    )}
                  >
                    {r.blockerCount} blocker{r.blockerCount === 1 ? "" : "s"}
                  </span>
                ) : null}
                <span className={FORECAST[r.forecastRisk].cls}>
                  {FORECAST[r.forecastRisk].label}
                </span>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 font-medium",
                    rights.cls
                  )}
                >
                  {rights.label}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop: full table, horizontally scrollable on medium widths. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">All projects, sortable</caption>
          <thead>
            <tr className="border-b">
              <SortHeader label="Health" sortKey="health" sort={sort} onToggle={toggle} />
              <SortHeader label="Project" sortKey="title" sort={sort} onToggle={toggle} />
              <SortHeader label="Status" sort={sort} onToggle={toggle} />
              <SortHeader label="Progress" sortKey="progress" align="right" sort={sort} onToggle={toggle} />
              <SortHeader label="Funded" sortKey="funded" align="right" sort={sort} onToggle={toggle} />
              <SortHeader label="Blockers" sortKey="blockers" align="right" sort={sort} onToggle={toggle} />
              <SortHeader label="Due" sortKey="due" align="right" sort={sort} onToggle={toggle} />
              <SortHeader label="Forecast" sortKey="forecast" align="right" sort={sort} onToggle={toggle} />
              <SortHeader label="Rights" sort={sort} onToggle={toggle} />
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((r) => {
              const due = dueLabel(r.dueDate);
              const rights = RIGHTS[r.rightsStatus] ?? RIGHTS.none;
              return (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5">
                    <HealthDot status={r.healthStatus} />
                  </td>
                  <th scope="row" className="px-3 py-2.5 text-left font-medium">
                    <Link href={`/projects/${r.slug}`} className="hover:underline">
                      {r.title}
                    </Link>
                  </th>
                  <td className="px-3 py-2.5">
                    <ProjectStatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <ProgressBar pct={r.progressPct} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <FundedCell row={r} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.blockerCount === 0 ? (
                      <span className="text-muted-foreground">0</span>
                    ) : (
                      <span
                        className={cn(
                          "font-medium",
                          r.critical > 0 ? "text-destructive" : "text-warning"
                        )}
                      >
                        {r.blockerCount}
                      </span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right text-xs tabular-nums",
                      DUE_TONE[due.tone]
                    )}
                  >
                    {due.text}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right text-xs",
                      FORECAST[r.forecastRisk].cls
                    )}
                    title={
                      r.projectedDate
                        ? `Projected finish ${r.projectedDate}`
                        : "Not enough history to forecast"
                    }
                  >
                    {FORECAST[r.forecastRisk].label}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                        rights.cls
                      )}
                    >
                      {rights.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
