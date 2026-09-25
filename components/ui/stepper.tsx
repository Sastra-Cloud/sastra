"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type StepperStep = {
  key: string;
  label: string;
  /** Optional one-line hint shown under the label on wider screens. */
  hint?: string;
};

/**
 * Presentational progress stepper. Shows numbered steps with done / current /
 * upcoming states. Completed steps are clickable for back-navigation; upcoming
 * steps are never clickable (the wizard owns forward progress). On narrow
 * screens it collapses to "Step X of N" plus a progress bar.
 */
export function Stepper({
  steps,
  current,
  onStepClick,
  className,
}: {
  steps: StepperStep[];
  current: number;
  onStepClick?: (index: number) => void;
  className?: string;
}) {
  const total = steps.length;
  const safeCurrent = Math.min(Math.max(current, 0), total - 1);
  const active = steps[safeCurrent];
  // Fill through the current step (step 1 of 4 → 25%, step 4 of 4 → 100%).
  const pct = total > 0 ? ((safeCurrent + 1) / total) * 100 : 100;

  return (
    <div className={cn("min-w-0", className)}>
      {/* Mobile: compact counter + bar */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-foreground">{active?.label}</p>
          <p className="shrink-0 text-xs text-muted-foreground">
            Step {safeCurrent + 1} of {total}
          </p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Desktop: numbered steps with connectors */}
      <ol className="hidden items-start gap-2 sm:flex">
        {steps.map((step, index) => {
          const done = index < safeCurrent;
          const isCurrent = index === safeCurrent;
          const reachable = index <= safeCurrent && !!onStepClick;
          return (
            <li key={step.key} className="flex min-w-0 flex-1 items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col items-center text-center">
                <button
                  type="button"
                  disabled={!reachable}
                  aria-current={isCurrent ? "step" : undefined}
                  onClick={reachable ? () => onStepClick?.(index) : undefined}
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                    done && "border-primary bg-primary text-primary-foreground",
                    isCurrent &&
                      "border-primary bg-primary/12 text-primary ring-2 ring-primary/20",
                    !done && !isCurrent && "border-border bg-background text-muted-foreground",
                    reachable && "cursor-pointer hover:opacity-90",
                    !reachable && "cursor-default"
                  )}
                >
                  {done ? <Check className="size-4" /> : index + 1}
                </button>
                <span
                  className={cn(
                    "mt-1.5 min-w-0 text-pretty text-xs font-medium leading-tight",
                    isCurrent ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
                {step.hint ? (
                  <span className="mt-0.5 hidden text-pretty text-[0.68rem] leading-tight text-muted-foreground md:block">
                    {step.hint}
                  </span>
                ) : null}
              </div>
              {index < total - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "mt-4 h-px flex-1 rounded-full",
                    index < safeCurrent ? "bg-primary" : "bg-border"
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
