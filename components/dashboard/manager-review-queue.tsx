import Link from "next/link";
import {
  ArrowRight,
  Building2,
  FileCheck2,
  FolderPlus,
  Sparkles,
} from "lucide-react";

import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ManagerReviewItem = {
  id: string;
  source: "project_follow_up" | "project_update" | "new_project" | "counterparty";
  title: string;
  detail: string | null;
  project: string | null;
  priority: "low" | "medium" | "high";
  href: string;
  actionLabel: string;
  createdAt: Date;
};

const SOURCE = {
  project_follow_up: {
    label: "Project follow-up",
    icon: Sparkles,
  },
  project_update: {
    label: "Email update",
    icon: FileCheck2,
  },
  new_project: {
    label: "New project",
    icon: FolderPlus,
  },
  counterparty: {
    label: "Contact or partner",
    icon: Building2,
  },
} as const;

export function ManagerReviewQueue({ items }: { items: ManagerReviewItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-2" aria-labelledby="manager-review-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="manager-review-heading" className="text-lg font-semibold">
            Needs your review
          </h2>
          <p className="text-sm text-muted-foreground text-pretty">
            Suggested follow-ups from email and project updates. Nothing changes
            until you review it.
          </p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {items.map((item) => {
          const source = SOURCE[item.source];
          const Icon = source.icon;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group grid min-h-16 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{source.label}</span>
                    {item.project ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate font-medium text-foreground">
                          {item.project}
                        </span>
                      </>
                    ) : null}
                    {item.priority !== "low" ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 font-medium",
                          item.priority === "high"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-warning/15 text-warning-foreground"
                        )}
                      >
                        {item.priority} priority
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-sm font-medium text-pretty">
                    {item.title}
                  </span>
                  {item.detail ? (
                    <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground text-pretty">
                      {item.detail}
                    </span>
                  ) : null}
                </span>
                <span className="col-start-2 flex min-w-0 items-center justify-between gap-3 pr-10 text-xs text-muted-foreground sm:col-start-3 sm:row-start-1 sm:flex-col sm:items-end sm:self-stretch sm:pr-0">
                  <span>{timeAgo(item.createdAt)}</span>
                  <span className="inline-flex items-center gap-1 font-medium text-primary sm:mt-auto">
                    {item.actionLabel}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
