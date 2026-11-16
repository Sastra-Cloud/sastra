"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ListChecks } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { DoneCheck } from "@/components/ui/done-check";
import { useGuidance } from "@/components/guidance/guidance-provider";
import type { GuideStep, GuideSteps } from "@/lib/guidance/steps";
import { cn } from "@/lib/utils";

/**
 * A live list of the steps in one process (budget, printing). The next step is
 * open with one fact and one button; the rest are single lines. Each person
 * can hide it, and it follows the "Show helpful guidance" profile setting.
 */
export function StepList({
  guidanceKey,
  title,
  doneMessage,
  guide,
  onAction,
  footer,
  className,
  collapsedClassName,
}: {
  /** Stable id; remembers that this person hid the list. */
  guidanceKey: string;
  title: string;
  /** Shown when every step is done. */
  doneMessage: string;
  guide: GuideSteps;
  /** Handles actions that have an `id` instead of a link. */
  onAction?: (actionId: string) => void;
  /** Quiet extras under the list (help link, "Walk me through this"). */
  footer?: React.ReactNode;
  className?: string;
  collapsedClassName?: string;
}) {
  const { enabled, hydrated, isDismissed, dismiss, restore } = useGuidance();
  const titleId = React.useId();
  if (!enabled || !hydrated) return null;

  if (isDismissed(guidanceKey)) {
    return (
      <div className={cn("flex justify-end", collapsedClassName ?? className)}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 text-muted-foreground"
          onClick={() => restore(guidanceKey)}
        >
          <ListChecks className="size-4" />
          Show steps
        </Button>
      </div>
    );
  }

  const pct = guide.total > 0 ? (guide.doneCount / guide.total) * 100 : 100;

  return (
    <section
      aria-labelledby={titleId}
      className={cn("overflow-hidden rounded-xl border bg-card", className)}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
        <h3 id={titleId} className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="size-4 text-primary" aria-hidden />
          {title}
        </h3>
        <p className="text-xs tabular-nums text-muted-foreground">
          {guide.allDone
            ? doneMessage
            : `${guide.doneCount} of ${guide.total} done`}
        </p>
        <div
          aria-hidden
          className="order-last h-1 w-full overflow-hidden rounded-full bg-muted sm:order-none sm:w-24"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto min-h-11 text-muted-foreground sm:min-h-8"
          onClick={() => dismiss(guidanceKey)}
        >
          Hide steps
        </Button>
      </div>
      {guide.allDone ? null : (
        <ol className="divide-y border-t">
          {guide.steps.map((step, index) => (
            <StepRow
              key={step.key}
              step={step}
              number={index + 1}
              onAction={onAction}
            />
          ))}
        </ol>
      )}
      {footer && !guide.allDone ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-sm">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

function StepRow({
  step,
  number,
  onAction,
}: {
  step: GuideStep;
  number: number;
  onAction?: (actionId: string) => void;
}) {
  const isNext = step.status === "next";
  const done = step.status === "done";
  // Draw the check only when the step is finished while the person watches,
  // not for steps that were already done when the page opened.
  const [seenDone, setSeenDone] = React.useState(done);
  const [justDone, setJustDone] = React.useState(false);
  if (seenDone !== done) {
    setSeenDone(done);
    setJustDone(done);
  }
  const stateLabel = done
    ? "Done"
    : isNext
      ? "Next"
      : step.optional
        ? "Optional"
        : "Later";
  return (
    <li
      aria-current={isNext ? "step" : undefined}
      className={cn(
        "flex gap-3 px-4",
        isNext ? "bg-primary/5 py-3" : "items-center py-2"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
          done && "border-primary bg-primary text-primary-foreground",
          isNext && "border-primary bg-background text-primary ring-2 ring-primary/20",
          !done && !isNext && "border-border text-muted-foreground"
        )}
      >
        {done ? <DoneCheck animate={justDone} className="size-3.5" /> : number}
      </span>
      <div
        className={cn(
          "min-w-0 flex-1",
          isNext
            ? "space-y-2"
            : "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 sm:flex sm:flex-wrap sm:items-baseline sm:gap-y-0.5"
        )}
      >
        <p
          className={cn(
            "text-sm",
            isNext ? "font-semibold" : done ? "font-medium" : "text-muted-foreground"
          )}
        >
          {step.label}
          <span className="sr-only">: {stateLabel}</span>
          {isNext ? (
            <span
              aria-hidden
              className="ml-2 rounded bg-primary/12 px-1.5 py-0.5 text-xs font-medium text-primary"
            >
              Next
            </span>
          ) : null}
          {!isNext && !done && step.optional ? (
            <span aria-hidden className="ml-2 text-xs text-muted-foreground">
              Optional
            </span>
          ) : null}
        </p>
        <p
          className={cn(
            "min-w-0 text-pretty",
            isNext
              ? "text-sm text-foreground/80"
              : "order-3 col-span-2 text-xs text-muted-foreground sm:order-none sm:flex-1"
          )}
        >
          {step.fact}
        </p>
        {step.action ? (
          <StepAction
            action={step.action}
            primary={isNext}
            stepLabel={step.label}
            onAction={onAction}
          />
        ) : null}
      </div>
    </li>
  );
}

function StepAction({
  action,
  primary,
  stepLabel,
  onAction,
}: {
  action: NonNullable<GuideStep["action"]>;
  primary: boolean;
  stepLabel: string;
  onAction?: (actionId: string) => void;
}) {
  const className = primary
    ? cn(buttonVariants({ size: "sm" }), "min-h-11 sm:min-h-8")
    : "inline-flex min-h-11 shrink-0 items-center text-xs font-medium text-primary hover:underline sm:min-h-0";
  const content = (
    <>
      {action.label}
      {primary ? <ArrowRight className="size-3.5" aria-hidden /> : null}
      {primary ? null : <span className="sr-only"> ({stepLabel})</span>}
    </>
  );
  if (action.href) {
    return action.href.startsWith("#") ? (
      <a href={action.href} className={className}>
        {content}
      </a>
    ) : (
      <Link href={action.href} className={className}>
        {content}
      </Link>
    );
  }
  if (!action.id || !onAction) return null;
  const id = action.id;
  return (
    <button type="button" className={className} onClick={() => onAction(id)}>
      {content}
    </button>
  );
}
