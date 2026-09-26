"use client";

import Link from "next/link";
import { ArrowRight, Check, Rocket, X } from "lucide-react";

import { useGuidance } from "@/components/guidance/guidance-provider";
import { Button } from "@/components/ui/button";
import type { OnboardingSignals } from "@/lib/onboarding/queries";
import { cn } from "@/lib/utils";
import { onboardingSteps, onboardingStepComplete } from "@/lib/onboarding/steps";

const DISMISS_KEY = "onboarding:dismissed";
const itemKey = (key: string) => `onboarding:item:${key}`;

/**
 * A short, role-based list of first steps for new teammates. Completion is
 * derived from real data where cheap (a finished task, an answered standup);
 * the rest are saved to the user's account when they open them. It hides
 * itself when guidance is off, when everything is done, or when dismissed.
 */
export function OnboardingChecklist({
  role,
  signals,
}: {
  role: string;
  signals: OnboardingSignals;
}) {
  const { enabled, hydrated, isDismissed, dismiss } = useGuidance();
  if (!enabled || !hydrated || isDismissed(DISMISS_KEY)) return null;

  const items = onboardingSteps(role, signals).map((item) => ({
    ...item,
    done: onboardingStepComplete(item, isDismissed),
  }));
  const doneCount = items.filter((item) => item.done).length;
  // Once every step is done, onboarding is over — stop showing it.
  if (doneCount === items.length) return null;
  const next = items.find(item => !item.done)!;
  const pct = Math.round((doneCount / items.length) * 100);

  return (
    <section className="surface-shadow relative rounded-xl border border-primary/20 bg-primary/[0.06] p-4">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Hide the getting-started checklist"
        title="Hide this"
        className="absolute right-2 top-2 text-muted-foreground"
        onClick={() => dismiss(DISMISS_KEY)}
      >
        <X className="size-4" />
      </Button>
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/15">
          <Rocket className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading font-semibold text-foreground">
            Get started with Sastra
          </p>
          <p className="text-sm text-muted-foreground">
            A few first steps. {doneCount} of {items.length} done.
          </p>
          <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>

          <Link href={next.href} onClick={() => { if (next.type === "visit") dismiss(itemKey(next.key)); }} className="mt-3 inline-flex min-h-11 items-center gap-2 font-medium text-primary">
            {next.label}<ArrowRight className="size-4" />
          </Link>
          {role === "member" && signals.assignedTaskCount === 0 && signals.completedTaskCount === 0 ? <p className="text-sm text-muted-foreground">Your assigned tasks will appear in My Work. Ask a manager to assign your first task.</p> : null}
          <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium">Show all steps</summary>
          <ul className="mt-3 space-y-1">
            {items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  onClick={() => {
                    if (item.type === "visit") dismiss(itemKey(item.key));
                  }}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-primary/10",
                    item.done && "text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border",
                      item.done
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40"
                    )}
                  >
                    {item.done ? <Check className="size-3" /> : null}
                  </span>
                  <span className={cn("min-w-0 flex-1", item.done && "line-through")}>
                    {item.label}
                  </span>
                  {!item.done ? (
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
          </details>
        </div>
      </div>
    </section>
  );
}
