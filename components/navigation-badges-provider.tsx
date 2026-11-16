"use client";

import { Suspense, createContext, use, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { useUserActive } from "@/hooks/use-user-active";
import { usePropState } from "@/hooks/use-prop-state";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notifications/client-events";
import { EMPTY_NAVIGATION_BADGES, type NavigationBadgeCounts } from "@/lib/navigation/badges";

type Adjustment = { key: keyof NavigationBadgeCounts; delta: number };
type PendingAdjustment = Adjustment & { basis: NavigationBadgeCounts | null };
type BadgeContext = {
  counts: NavigationBadgeCounts;
  adjust: (id: string, adjustment: Adjustment | null) => void;
};
const NavigationBadgesContext = createContext<BadgeContext>({
  counts: EMPTY_NAVIGATION_BADGES,
  adjust: () => {},
});
const REFRESH_MS = 20_000;

/** Applies a streamed server value once it arrives, suspending only itself. */
function SnapshotReceiver({ promise, onSettled }: {
  promise: Promise<NavigationBadgeCounts | null>;
  onSettled: (value: NavigationBadgeCounts | null) => void;
}) {
  const value = use(promise);
  useEffect(() => { onSettled(value); }, [value, onSettled]);
  return null;
}

type ServerSnapshot = { counts: NavigationBadgeCounts | null; failed: boolean };

/**
 * One feed shared by the desktop rail, mobile menu and its trigger.
 *
 * `snapshot` streams in after the first paint. Until it arrives, no badge is
 * shown (an unknown count is never drawn as zero work) and the poll waits. If the server could not
 * produce it, the poll starts at once instead of after the usual delay.
 */
export function NavigationBadgesProvider({ children, snapshot }: {
  children: React.ReactNode;
  snapshot: Promise<NavigationBadgeCounts | null>;
}) {
  const freshness = useRef({ source: null as NavigationBadgeCounts | null, updatedAt: 0, invalidated: false });
  const [server, setServer] = useState<ServerSnapshot>({ counts: null, failed: false });
  const receive = useCallback((next: NavigationBadgeCounts | null) => {
    // A read receipt or mutation may finish before the streamed snapshot.
    // Fetch fresh counts rather than restoring the older unread state.
    setServer((current) => next && !freshness.current.invalidated
      ? { counts: next, failed: false }
      : { ...current, failed: true });
  }, []);
  const initialCounts = server.counts;
  const waiting = initialCounts === null && !server.failed;
  const [counts, setCounts] = usePropState(initialCounts ?? EMPTY_NAVIGATION_BADGES);
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
    const feed = freshness.current;
    if (feed.source !== initialCounts) {
      feed.source = initialCounts;
      feed.updatedAt = Date.now();
    }
    // Nothing to reconcile with yet; the streamed snapshot (or its failure) starts the feed.
    if (waiting) {
      if (hasPendingAdjustment) feed.invalidated = true;
      const invalidate = () => { feed.invalidated = true; };
      window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, invalidate);
      window.addEventListener("focus", invalidate);
      return () => {
        window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, invalidate);
        window.removeEventListener("focus", invalidate);
      };
    }
    if (hasPendingAdjustment) { feed.invalidated = true; return; }
    if (!active) { feed.invalidated = true; return; }
    let stopped = false;
    let controller: AbortController | null = null;
    const refresh = async (force = false) => {
      if (!force && (controller || !feed.invalidated && Date.now() - feed.updatedAt < REFRESH_MS)) return;
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
        if (!stopped && !request.signal.aborted) {
          setCounts(next);
          feed.updatedAt = Date.now();
          feed.invalidated = false;
        }
      } catch {
        // Keep the last known counts through transient failures.
      } finally {
        if (controller === request) controller = null;
      }
    };
    const onRefresh = () => { void refresh(); };
    const onInvalidated = () => { feed.invalidated = true; void refresh(true); };
    const first = window.setTimeout(onRefresh, feed.invalidated ? 0 : Math.max(0, REFRESH_MS - (Date.now() - feed.updatedAt)));
    const interval = window.setInterval(onRefresh, REFRESH_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onInvalidated);
    window.addEventListener("focus", onInvalidated);
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(first);
      clearInterval(interval);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onInvalidated);
      window.removeEventListener("focus", onInvalidated);
    };
  }, [active, pathname, initialCounts, setCounts, hasPendingAdjustment, waiting]);

  const visibleCounts = { ...counts };
  for (const { key, delta } of pendingAdjustments) visibleCounts[key] += delta;
  for (const key of Object.keys(visibleCounts) as Array<keyof NavigationBadgeCounts>) {
    visibleCounts[key] = Math.max(0, visibleCounts[key]);
  }
  return (
    <NavigationBadgesContext value={{ counts: visibleCounts, adjust }}>
      <Suspense fallback={null}>
        <SnapshotReceiver promise={snapshot} onSettled={receive} />
      </Suspense>
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
