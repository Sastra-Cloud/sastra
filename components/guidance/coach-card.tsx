"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Lightbulb, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useGuidedElement } from "@/components/guidance/guidance-provider";
import { cn } from "@/lib/utils";

/**
 * Inline, dismissible coaching block — never an overlay tour (overlays are
 * hostile to low-confidence users). Renders nothing when guidance is off or the
 * user has dismissed this key before. Keep the copy short and plain.
 */
export function CoachCard({
  guidanceKey,
  title,
  children,
  icon,
  helpSlug,
  helpLabel = "Learn more",
  action,
  dismissLabel = "Got it",
  className,
}: {
  /** Stable id; remembers this card's dismissal for the signed-in user. */
  guidanceKey: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  /** Slug of a help doc to link into (`/help#<slug>`). */
  helpSlug?: string;
  helpLabel?: string;
  /** Optional call-to-action (e.g. a jump button). */
  action?: React.ReactNode;
  dismissLabel?: string;
  className?: string;
}) {
  const { show, dismiss } = useGuidedElement(guidanceKey);
  if (!show) return null;

  return (
    <aside
      className={cn(
        "surface-shadow relative flex gap-3 rounded-xl border border-primary/20 bg-primary/[0.06] p-4 text-sm",
        className
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/15">
        {icon ?? <Lightbulb className="size-4" />}
      </span>
      <div className="min-w-0 flex-1 space-y-2 pr-6">
        <p className="font-heading font-semibold text-foreground text-pretty">
          {title}
        </p>
        {children ? (
          <div className="text-pretty leading-relaxed text-muted-foreground">
            {children}
          </div>
        ) : null}
        {action || helpSlug ? (
          <div className="flex flex-wrap items-center gap-3 pt-0.5">
            {action}
            {helpSlug ? (
              <Link
                href={`/help#${helpSlug}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {helpLabel}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Dismiss: ${typeof title === "string" ? title : "guidance"}`}
        title={dismissLabel}
        className="absolute right-2 top-2 text-muted-foreground"
        onClick={dismiss}
      >
        <X className="size-4" />
      </Button>
    </aside>
  );
}
