import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  CircleDollarSign,
  CircleHelp,
} from "lucide-react";

import type {
  BudgetAttentionItem,
  BudgetAttentionSummary as Summary,
} from "@/lib/budget/attention";
import { cn } from "@/lib/utils";

const severityStyles: Record<BudgetAttentionItem["severity"], string> = {
  critical: "bg-destructive/10 text-destructive",
  warning: "bg-warning/15 text-warning-foreground",
  info: "bg-info/10 text-info",
};

const severityIcons = {
  critical: AlertTriangle,
  warning: CircleHelp,
  info: CircleDollarSign,
};

export function BudgetAttentionSummary({ summary }: { summary: Summary }) {
  return (
    <section
      className="overflow-hidden rounded-xl border bg-card"
      aria-labelledby="budget-attention-title"
    >
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="budget-attention-title" className="font-semibold">
            Budget attention
          </h2>
          <p className="text-xs text-muted-foreground">
            Exceptions first, using the current quotation and recorded payments.
          </p>
        </div>
        {summary.nextAction ? (
          <Link
            href={summary.nextAction.href}
            className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Next: {summary.nextAction.label}
            <ArrowDown className="size-3.5" />
          </Link>
        ) : null}
      </div>
      {summary.items.length === 0 ? (
        <div className="flex items-start gap-3 px-4 py-3 text-sm">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
          <div>
            <p className="font-medium">No budget exceptions need attention</p>
            <p className="text-muted-foreground">
              Review the quotation when you are ready to make the next change.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y">
          {summary.items.map((item) => {
            const Icon = severityIcons[item.severity];
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex min-h-12 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      severityStyles[item.severity]
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {item.value}
                    </span>
                  </span>
                  <ArrowDown className="size-3.5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
