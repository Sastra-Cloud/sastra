"use client";

import { createContext, useCallback, useContext, useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";

import { useUserActive } from "@/hooks/use-user-active";
import { usePropState } from "@/hooks/use-prop-state";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notifications/client-events";
import { EMPTY_NAVIGATION_BADGES, type NavigationBadgeCounts } from "@/lib/navigation/badges";

type Adjustment = { key: keyof NavigationBadgeCounts; delta: number };
type PendingAdjustment = Adjustment & { basis: NavigationBadgeCounts };
type BadgeContext = {
  counts: NavigationBadgeCounts;
  adjust: (id: string, adjustment: Adjustment | null) => void;
};
const NavigationBadgesContext = createContext<BadgeContext>({
  counts: EMPTY_NAVIGATION_BADGES,
  adjust: () => {},
});

/** One feed shared by the desktop rail, mobile menu and its trigger. */
export function NavigationBadgesProvider({ children, initialCounts }: {
  children: React.ReactNode;
  initialCounts: NavigationBadgeCounts;
}) {
  const [counts, setCounts] = usePropState(initialCounts);
  const [adjustments, setAdjustments] = useState<Record<string, PendingAdjustment>>({});
  const active = useUserActive();
  const pathname = usePathname();
  const adjust = useCallback((id: string, adjustment: Adjustment | null) => {
    setAdjustments((current) => {
      const next = { ...current };
      if (adjustment) next[id] = { ...adjustment, basis: initialCounts };
      else delete next[id];
      return next;
    });
  }, [initialCounts]);
  const pendingAdjustments = Object.values(adjustments).filter((item) => item.basis === initialCounts);
  const hasPendingAdjustment = pendingAdjustments.length > 0;

  useEffect(() => {
    // Hold the canonical snapshot while a local optimistic change is shown.
    // Otherwise a poll that already includes that write would apply it twice.
    if (!active || hasPendingAdjustment) return;
    let stopped = false;
    let controller: AbortController | null = null;
    const refresh = async () => {
      // A read receipt or navigation supersedes an older poll. Its response
      // must never restore a count that the newer request already cleared.
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch("/api/navigation/badges", {
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) return;
        const next = await response.json() as NavigationBadgeCounts;
        if (!stopped && !request.signal.aborted) setCounts(next);
      } catch {
        // Keep the last known counts through transient failures.
      }
    };
    const onRefresh = () => { void refresh(); };
    const first = window.setTimeout(onRefresh, 0);
    const interval = window.setInterval(onRefresh, 20_000);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onRefresh);
    window.addEventListener("focus", onRefresh);
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(first);
      clearInterval(interval);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onRefresh);
      window.removeEventListener("focus", onRefresh);
    };
  }, [active, pathname, initialCounts, setCounts, hasPendingAdjustment]);

  const visibleCounts = { ...counts };
  for (const { key, delta } of pendingAdjustments) visibleCounts[key] += delta;
  for (const key of Object.keys(visibleCounts) as Array<keyof NavigationBadgeCounts>) {
    visibleCounts[key] = Math.max(0, visibleCounts[key]);
  }
  return (
    <NavigationBadgesContext value={{ counts: visibleCounts, adjust }}>
      {children}
    </NavigationBadgesContext>
  );
}

export function useNavigationBadges() {
  return useContext(NavigationBadgesContext).counts;
}

/** Mirror the surface's existing optimistic state, including its exact rollback. */
export function useNavigationBadgeAdjustment(key: keyof NavigationBadgeCounts, delta: number) {
  const { adjust } = useContext(NavigationBadgesContext);
  const id = useId();
  useEffect(() => {
    if (delta !== 0) adjust(id, { key, delta });
    return () => adjust(id, null);
  }, [adjust, id, key, delta]);
}
