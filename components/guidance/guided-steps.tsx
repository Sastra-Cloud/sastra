"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { cn } from "@/lib/utils";

export type GuidedStep = StepperStep & {
  /** Content for this step. */
  content: React.ReactNode;
  /** Label for the button that advances from this step. */
  nextLabel?: string;
  /** Block advancing until true (e.g. required fields filled). */
  canContinue?: boolean;
};

/**
 * Wizard controller: one topic per step, visible progress, back-navigation
 * without data loss, an always-visible escape hatch, and a context-specific
 * final button label. Generalizes the hand-rolled two-step flows in the app.
 * Keep flows under ~10 steps.
 */
export function GuidedSteps({
  steps,
  onFinish,
  finishing = false,
  onSkip,
  skipLabel = "Skip guided setup",
  current: controlledCurrent,
  onCurrentChange,
  keepMounted = false,
  className,
}: {
  steps: GuidedStep[];
  onFinish: () => void;
  finishing?: boolean;
  onSkip?: () => void;
  skipLabel?: string;
  current?: number;
  onCurrentChange?: (index: number) => void;
  /**
   * Render every step's content at once (hiding all but the current one) so
   * inputs stay mounted. Required when the steps are fields of one real form.
   */
  keepMounted?: boolean;
  className?: string;
}) {
  const [internal, setInternal] = React.useState(0);
  const current = controlledCurrent ?? internal;
  const setCurrent = React.useCallback(
    (index: number) => {
      const clamped = Math.min(Math.max(index, 0), steps.length - 1);
      onCurrentChange?.(clamped);
      if (controlledCurrent === undefined) setInternal(clamped);
    },
    [controlledCurrent, onCurrentChange, steps.length]
  );

  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production" && steps.length > 9) {
      console.warn(
        `GuidedSteps has ${steps.length} steps; keep guided flows under 10.`
      );
    }
  }, [steps.length]);

  const step = steps[current];
  const isLast = current === steps.length - 1;
  const canContinue = step?.canContinue !== false && !finishing;

  const goNext = () => {
    if (!canContinue) return;
    if (isLast) onFinish();
    else setCurrent(current + 1);
  };

  return (
    <div className={cn("space-y-6", className)}>
      <Stepper steps={steps} current={current} onStepClick={setCurrent} />

      {keepMounted ? (
        steps.map((s, i) => (
          <div key={s.key} hidden={i !== current} className="min-w-0">
            {s.content}
          </div>
        ))
      ) : (
        <div className="min-w-0">{step?.content}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex items-center gap-2">
          {current > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCurrent(current - 1)}
              disabled={finishing}
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
          ) : null}
          {onSkip ? (
            <Button
              type="button"
              variant="link"
              className="px-1 text-muted-foreground"
              onClick={onSkip}
              disabled={finishing}
            >
              {skipLabel}
            </Button>
          ) : null}
        </div>
        <Button type="button" onClick={goNext} disabled={!canContinue}>
          {finishing && isLast ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Working…
            </>
          ) : (
            <>
              {step?.nextLabel ?? (isLast ? "Finish" : "Continue")}
              {!isLast ? <ArrowRight className="size-4" /> : null}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
