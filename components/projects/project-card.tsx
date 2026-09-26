import Link from "next/link";
import { ViewTransition } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HealthDot, PriorityBadge, ProjectStatusBadge } from "@/components/badges";
import { AnimatedBar } from "@/components/motion/animated-bar";
import { dueLabel } from "@/lib/format";
import { portfolioDeadline } from "@/lib/projects/deadline";
import type { ProjectListItem } from "@/lib/projects/queries";
import { cn } from "@/lib/utils";
import {
  PROJECT_KIND_LABELS,
  VIDEO_PRODUCTION_MODE_LABELS,
  type ProjectKind,
  type VideoProductionMode,
} from "@/lib/projects/kinds";
import { PrintFundingBadge } from "@/components/projects/print-funding-badge";
import { BookFormatBadge } from "@/components/projects/book-format-badge";
import { isBookProjectKind } from "@/lib/projects/print-funding";

export function ProjectCard({ p }: { p: ProjectListItem }) {
  const totalTasks = p.activeReprintStatus
    ? p.activeReprintTotalTasks
    : p.totalTasks;
  const doneTasks = p.activeReprintStatus
    ? p.activeReprintDoneTasks
    : p.doneTasks;
  const pct = totalTasks
    ? Math.round((doneTasks / totalTasks) * 100)
    : 0;
  const due = dueLabel(portfolioDeadline(p));

  return (
    <Link
      href={`/projects/${p.slug}`}
      transitionTypes={["project-detail"]}
      prefetch
      className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <Card className="h-full transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/10">
        <CardHeader>
          <div className="flex items-start gap-3">
            <ViewTransition
              name={`project-mark-${p.slug}`}
              share={{
                "project-detail": "project-mark-morph",
                "project-list": "project-mark-morph",
                default: "none",
              }}
              default="none"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 font-heading text-base font-semibold text-primary">
                {p.title.slice(0, 1).toUpperCase()}
              </span>
            </ViewTransition>
            <div className="min-w-0 flex-1">
              <h3 className="font-heading text-lg leading-tight font-semibold text-pretty group-hover:text-primary">
                <ViewTransition
                  name={`project-title-${p.slug}`}
                  share={{
                    "project-detail": "project-title-morph",
                    "project-list": "project-title-morph",
                    default: "none",
                  }}
                  default="none"
                >
                  <span>{p.title}</span>
                </ViewTransition>
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {p.healthStatus ? <HealthDot status={p.healthStatus} /> : null}
                {p.kind ? (
                  <span className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {PROJECT_KIND_LABELS[p.kind as ProjectKind]}
                  </span>
                ) : null}
                {p.kind === "video_series" ? (
                  <span className="inline-flex items-center rounded-full border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {VIDEO_PRODUCTION_MODE_LABELS[
                      (p.videoProductionMode ?? "original") as VideoProductionMode
                    ]}
                  </span>
                ) : null}
                {isBookProjectKind(p.kind) && p.bookFormat ? (
                  <BookFormatBadge
                    evidence={p.bookFormat}
                    printFundingStatus={p.printFundingStatus}
                    compact
                  />
                ) : null}
                {isBookProjectKind(p.kind) ? (
                  <PrintFundingBadge
                    status={p.printFundingStatus}
                    summary={p.fundingSummary}
                    compact
                  />
                ) : null}
                <ProjectStatusBadge status={p.status} />
                {p.activeReprintStatus ? (
                  <span className="inline-flex items-center rounded-full border border-info/30 bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
                    {p.activeReprintNumber
                      ? `Reprint ${p.activeReprintNumber}`
                      : "Active reprint"}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {p.blockerCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  {p.blockerCount}
                </span>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <PriorityBadge priority={p.priority} />
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs font-medium",
                due.tone === "overdue" &&
                  "border-destructive/30 bg-destructive/10 text-destructive",
                due.tone === "soon" &&
                  "border-warning/30 bg-warning/10 text-warning-text",
                due.tone === "normal" &&
                  "border-border bg-background text-muted-foreground",
                due.tone === "none" &&
                  "border-border bg-background text-muted-foreground"
              )}
            >
              {due.text}
            </span>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>{p.activeReprintStatus ? "Reprint progress" : "Progress"}</span>
              <span className="tabular-nums">
                {doneTasks}/{totalTasks}
              </span>
            </div>
            <AnimatedBar value={pct} />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {p.memberCount} member{p.memberCount === 1 ? "" : "s"}
            </p>
            {p.blockerCount > 0 ? (
              <span className="text-xs font-medium text-destructive">
                {p.blockerCount} blocker{p.blockerCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
