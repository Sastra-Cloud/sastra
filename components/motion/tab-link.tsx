"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * A tab/segment link whose active "pill" is a shared layout element. When the
 * active tab changes (and the surrounding nav stays mounted, e.g. inside a
 * persistent layout), Motion slides the pill from the old tab to the new one
 * instead of cutting. Reduced-motion users get an instant move.
 */
export function MotionTabLink({
  href,
  active,
  layoutId,
  className,
  pendingIndicator = false,
  onNavigate,
  children,
}: {
  href: string;
  active: boolean;
  /** Shared id tying every tab in one group to the same sliding pill. */
  layoutId: string;
  className?: string;
  pendingIndicator?: boolean;
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        if (
          active ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.altKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.currentTarget.target === "_blank"
        ) {
          return;
        }
        onNavigate?.();
      }}
      className={cn(
        "relative inline-flex min-h-10 snap-start items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.96]",
        active
          ? "text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {active ? (
        <motion.span
          aria-hidden
          layoutId={layoutId}
          className="absolute inset-0 rounded-lg bg-primary shadow-sm"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      ) : null}
      <span className="relative z-10 inline-flex items-center gap-2">
        {children}
        {pendingIndicator ? <LinkPendingIndicator /> : null}
      </span>
    </Link>
  );
}

function LinkPendingIndicator() {
  const { pending } = useLinkStatus();
  return (
    <span className="-mr-1 flex size-4 shrink-0 items-center justify-center">
      <Loader2
        aria-hidden
        className={cn(
          "size-3.5 transition-opacity duration-150",
          pending
            ? "animate-spin opacity-100 [animation-delay:100ms]"
            : "opacity-0"
        )}
      />
      {pending ? <span className="sr-only">Loading conversation</span> : null}
    </span>
  );
}
