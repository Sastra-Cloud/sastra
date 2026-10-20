"use client";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { navigationBadgeFor, type NavigationBadgeCounts } from "@/lib/navigation/badges";

export function MyWorkAttentionSummary({ counts, onShowDueTasks }: {
  counts: NavigationBadgeCounts;
  onShowDueTasks: () => void;
}) {
  const total = navigationBadgeFor("/tasks", counts)?.count ?? 0;
  if (total === 0) return null;
  return (
    <section aria-label="My Work badge breakdown" className="space-y-1 border-b pb-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="text-sm font-semibold tabular-nums">{total} {total === 1 ? "action" : "actions"} for you</p>
        <div className="flex flex-wrap gap-1">
        {counts.dueTasks > 0 ? <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-9" onClick={onShowDueTasks}>
          {counts.dueTasks} {counts.dueTasks === 1 ? "task" : "tasks"} due
        </Button> : null}
        {counts.followUps > 0 ? <Link href="#external-follow-ups" className={buttonVariants({ variant: "outline", size: "sm", className: "min-h-11 sm:min-h-9" })}>
          {counts.followUps} email {counts.followUps === 1 ? "follow-up" : "follow-ups"}
        </Link> : null}
        {counts.taskSuggestions > 0 ? <Link href="#suggestions" className={buttonVariants({ variant: "outline", size: "sm", className: "min-h-11 sm:min-h-9" })}>
          {counts.taskSuggestions} {counts.taskSuggestions === 1 ? "suggestion" : "suggestions"} to review
        </Link> : null}
        </div>
      </div>
      <p className="max-w-3xl text-xs text-muted-foreground">Your menu badge counts these items. Due tasks include printer-payment follow-ups.</p>
    </section>
  );
}
