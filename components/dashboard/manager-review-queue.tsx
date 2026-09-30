import Link from "next/link";
import {
  ArrowRight,
  Building2,
  FileCheck2,
  FolderPlus,
  Sparkles,
  CalendarPlus, WalletCards, Users,
} from "lucide-react";

import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { ManagerReviewItem } from "@/lib/dashboard/attention";

const SOURCE = {
  dates: { label: "Scheduling", icon: CalendarPlus },
  funding: { label: "Print funding", icon: WalletCards },
  coordination: { label: "Coordination", icon: Users },
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

export function ManagerReviewQueue({ items, limit, id = "manager-attention" }: { items: ManagerReviewItem[]; limit?: number; id?: string }) {
  if (items.length === 0) return null;

  return (
    <section id={id} className="scroll-mt-32 space-y-2" aria-labelledby={`${id}-heading`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={`${id}-heading`} className="text-lg font-semibold">
            Manager attention
          </h2>
          <p className="text-sm text-muted-foreground text-pretty">
            Reviews and planning decisions. Suggested changes require your approval.
          </p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {items.slice(0, limit ?? items.length).map((item) => {
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
                            : "bg-warning/15 text-warning-text"
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
                  <span>{item.createdAt ? timeAgo(item.createdAt) : "Needs attention"}</span>
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
      {limit && items.length > limit ? <Link href="/overview#manager-attention" className="inline-flex min-h-11 items-center gap-1 text-sm text-primary">View all {items.length} items <ArrowRight className="size-3.5" /></Link> : null}
    </section>
  );
}
