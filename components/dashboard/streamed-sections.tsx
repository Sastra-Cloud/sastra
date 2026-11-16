"use client";

import { Component, Suspense, use, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ManagerReviewQueue } from "@/components/dashboard/manager-review-queue";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import type { ManagerReviewItem } from "@/lib/dashboard/attention";
import type { OnboardingSignals } from "@/lib/onboarding/queries";

function SectionFailure({ label }: { label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <p className="font-medium">Couldn&apos;t load {label}.</p>
      <p className="mt-1 text-muted-foreground">Your tasks are not affected. Try again.</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 min-h-11 sm:min-h-9"
        disabled={pending}
        onClick={() => {
          start(() => router.refresh());
        }}
      >
        {pending ? "Trying again…" : "Try again"}
      </Button>
    </div>
  );
}

/**
 * Keeps a failed secondary section from replacing the page. A new `source`
 * (a fresh request after "Try again") clears the failure.
 */
class SectionBoundary extends Component<
  { label: string; source: unknown; children: ReactNode },
  { failed: boolean; source: unknown }
> {
  state = { failed: false, source: this.props.source };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: { source: unknown },
    state: { failed: boolean; source: unknown }
  ) {
    return props.source === state.source ? null : { failed: false, source: props.source };
  }

  render() {
    if (this.state.failed) {
      return <SectionFailure label={this.props.label} />;
    }
    return this.props.children;
  }
}

function ManagerReview({ items, limit }: { items: Promise<ManagerReviewItem[]>; limit: number }) {
  return <ManagerReviewQueue items={use(items)} limit={limit} />;
}

function Onboarding({ signals, role }: { signals: Promise<OnboardingSignals>; role: string }) {
  return <OnboardingChecklist role={role} signals={use(signals)} />;
}

/** Holds room for the review list while it loads, so the rail below does not jump. */
function ReviewPlaceholder() {
  return (
    <div role="status" aria-label="Loading items to review" className="space-y-2">
      <div className="h-6 w-40 rounded bg-muted motion-safe:animate-pulse" />
      <div className="h-28 rounded-lg border bg-card motion-safe:animate-pulse" />
    </div>
  );
}

/** Items that need a manager's review. Streams in without delaying tasks. */
export function StreamedManagerReview({
  items,
  limit,
}: {
  items: Promise<ManagerReviewItem[]>;
  limit: number;
}) {
  return (
    <SectionBoundary label="items to review" source={items}>
      <Suspense fallback={<ReviewPlaceholder />}>
        <ManagerReview items={items} limit={limit} />
      </Suspense>
    </SectionBoundary>
  );
}

/** The getting-started checklist. Appears only when it has something to show. */
export function StreamedOnboarding({
  signals,
  role,
}: {
  signals: Promise<OnboardingSignals>;
  role: string;
}) {
  return (
    <SectionBoundary label="your setup steps" source={signals}>
      <Suspense fallback={null}>
        <Onboarding signals={signals} role={role} />
      </Suspense>
    </SectionBoundary>
  );
}
