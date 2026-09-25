"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import {
  resistedPullDistance,
  shouldRefreshAfterPull,
} from "@/lib/pwa/pull-to-refresh";
import { cn } from "@/lib/utils";

const IGNORED_TARGETS = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "[contenteditable=true]",
  "[data-slot=sheet-content]",
  "[data-slot=dialog-content]",
  "[data-pull-refresh-ignore]",
].join(",");

/** Mobile-only, native-feeling full-page refresh for the installed PWA/Safari. */
export function PullToRefresh() {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const distanceRef = useRef(0);

  useEffect(() => {
    const mobileTouch = window.matchMedia(
      "(max-width: 767px) and (pointer: coarse)"
    );
    if (!mobileTouch.matches) return;

    let tracking = false;
    let startX = 0;
    let startY = 0;

    const updateDistance = (next: number) => {
      distanceRef.current = next;
      setDistance(next);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshing || event.touches.length !== 1 || window.scrollY > 0) return;
      const target = event.target;
      if (target instanceof Element && target.closest(IGNORED_TARGETS)) return;
      const touch = event.touches[0];
      if (!touch) return;
      tracking = true;
      updateDistance(0);
      startX = touch.clientX;
      startY = touch.clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch) return;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (deltaY <= 0 || Math.abs(deltaX) > deltaY || window.scrollY > 0) {
        tracking = false;
        updateDistance(0);
        return;
      }
      event.preventDefault();
      updateDistance(resistedPullDistance(deltaY));
    };

    const finish = () => {
      if (!tracking) return;
      tracking = false;
      if (shouldRefreshAfterPull(distanceRef.current)) {
        setRefreshing(true);
        updateDistance(56);
        window.setTimeout(() => window.location.reload(), 180);
      } else {
        updateDistance(0);
      }
    };

    const cancel = () => {
      tracking = false;
      updateDistance(0);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", finish, { passive: true });
    window.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", finish);
      window.removeEventListener("touchcancel", cancel);
    };
  }, [refreshing]);

  const armed = shouldRefreshAfterPull(distance);
  const visible = distance > 4 || refreshing;

  return (
    <div
      aria-hidden={!refreshing}
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex justify-center md:hidden",
        !visible && "invisible"
      )}
      style={{
        opacity: Math.min(1, distance / 32),
        transform: `translate3d(0, ${distance - 48}px, 0)`,
        transition: refreshing || distance === 0 ? "transform 180ms ease-out, opacity 150ms ease-out" : "none",
      }}
    >
      <div className="flex min-h-11 items-center gap-2 rounded-full border bg-popover px-3.5 text-sm font-medium text-popover-foreground shadow-lg">
        <RefreshCw
          className={cn(
            "size-4 text-primary transition-transform duration-150",
            armed && !refreshing && "rotate-180",
            refreshing && "animate-spin"
          )}
        />
        <span>{refreshing ? "Refreshing…" : armed ? "Release to refresh" : "Pull to refresh"}</span>
      </div>
    </div>
  );
}
