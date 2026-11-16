"use client";

import { NavigationLink } from "@/components/navigation-link";
import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A tab/segment link that navigates to another route. The active pill is
 * static: these tabs change the route, so a sliding indicator would animate on
 * the main thread while the next screen renders and drop frames on slower
 * devices.
 */
export function TabLink({
  href,
  active,
  className,
  pendingIndicator = false,
  onNavigate,
  children,
}: {
  href: string;
  active: boolean;
  className?: string;
  pendingIndicator?: boolean;
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  return (
    <NavigationLink
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
        <span
          aria-hidden
          className="absolute inset-0 rounded-lg bg-primary shadow-sm"
        />
      ) : null}
      <span className="relative z-10 inline-flex items-center gap-2">
        {children}
        {pendingIndicator ? <LinkPendingIndicator /> : null}
      </span>
    </NavigationLink>
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
