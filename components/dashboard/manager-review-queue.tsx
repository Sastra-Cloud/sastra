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
import { SectionDisclosure } from "@/components/section-disclosure";

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

export function ManagerReviewQueue({ items, limit, id = "manager-attention", collapsed = false }: { items: ManagerReviewItem[]; limit?: number; id?: string; collapsed?: boolean }) {
  if (items.length === 0) return null;

  const description = "Reviews and planning decisions. Suggested changes require your approval.";
  const count = `${items.length} ${items.length === 1 ? "item" : "items"}`;
  const list = (
      <ul className={cn("@container/reviews divide-y", !collapsed && "rounded-xl border bg-card")}>
        {(collapsed ? items : items.slice(0, limit ?? items.length)).map((item) => {
          const source = SOURCE[item.source];
          const Icon = source.icon;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group grid min-h-16 grid-cols-1 items-start gap-x-6 gap-y-2 px-4 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset @[40rem]/reviews:grid-cols-[minmax(0,1fr)_auto]"
              >
                <span className="min-w-0 max-w-3xl">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><Icon className="size-3.5" aria-hidden />{source.label}</span>
                    {item.project ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate font-medium text-foreground">
                          {item.project}
                        </span>
                      </>
                    ) : null}
                    {item.priority === "high" ? (
                      <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive">
                        High priority
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
                <span className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground @[40rem]/reviews:col-start-2 @[40rem]/reviews:row-start-1 @[40rem]/reviews:flex-col @[40rem]/reviews:items-end @[40rem]/reviews:self-stretch">
                  {item.createdAt ? <span>{timeAgo(item.createdAt)}</span> : null}
                  <span className="inline-flex items-center gap-1 font-medium text-foreground @[40rem]/reviews:mt-auto">
                    {item.actionLabel}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
  );

  if (collapsed) return (
    <SectionDisclosure id={id} title="Manager attention" summary={count} description={description} contentClassName="p-0">
      {list}
    </SectionDisclosure>
  );

  return (
    <section id={id} className="scroll-mt-32 space-y-3" aria-labelledby={`${id}-heading`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`${id}-heading`} className="text-lg font-semibold">Manager attention</h2>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
      </div>
      <p className="text-xs text-muted-foreground text-pretty">{description}</p>
      {list}
      {limit && items.length > limit ? <Link href="/overview#manager-attention" className="inline-flex min-h-11 items-center gap-1 text-sm text-primary">View all {items.length} items <ArrowRight className="size-3.5" /></Link> : null}
    </section>
  );
}
