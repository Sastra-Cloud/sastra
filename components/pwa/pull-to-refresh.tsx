"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  "form",
  "[contenteditable=true]",
  "[role=menu]",
  "[role=listbox]",
  "[role=dialog]",
  "[data-slot=sheet-content]",
  "[data-slot=dialog-content]",
  "[data-pull-refresh-ignore]",
].join(",");

/** Mobile page reloads and draft-preserving conversation refresh. */
export function PullToRefresh() {
  const router = useRouter();
  const [distance, setDistance] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [pending, startTransition] = useTransition();
  const refreshing = reloading || pending;
  const distanceRef = useRef(0);

  useEffect(() => {
    const mobileTouch = window.matchMedia(
      "(max-width: 767px) and (pointer: coarse)"
    );
    if (!mobileTouch.matches) return;

    let tracking = false;
    let startX = 0;
    let startY = 0;
    let refreshConversation = false;

    const updateDistance = (next: number) => {
      distanceRef.current = next;
      setDistance(next);
    };

    const cancel = () => {
      tracking = false;
      updateDistance(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      cancel();
      if (
        refreshing || !mobileTouch.matches || event.defaultPrevented ||
        event.touches.length !== 1 || window.scrollY > 0
      ) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest(IGNORED_TARGETS)) return;
      // A chat pull must start on its fixed header or at the transcript's true
      // top. Reaching the top during a history-scrolling gesture never arms it.
      const transcript = target.closest('[data-slot="message-scroller-viewport"]');
      refreshConversation = !!target.closest("[data-conversation-refresh]") ||
        !!transcript && transcript.scrollTop <= 0;
      if (target.closest("[data-mobile-conversation]") && !refreshConversation) return;
      // Other inner scroll panels keep their own gestures, including when
      // they are at the top or too short to overflow.
      for (
        let element: Element | null = target;
        element && element !== document.body && element !== document.documentElement;
        element = element.parentElement
      ) {
        if (refreshConversation && element === transcript) continue;
        const { overflowY } = window.getComputedStyle(element);
        if (overflowY === "auto" || overflowY === "scroll") return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      tracking = true;
      updateDistance(0);
      startX = touch.clientX;
      startY = touch.clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking) return;
      if (event.touches.length !== 1 || event.defaultPrevented) {
        cancel();
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (deltaY <= 0 || Math.abs(deltaX) > deltaY || window.scrollY > 0) {
        cancel();
        return;
      }
      updateDistance(resistedPullDistance(deltaY));
    };

    const finish = (event: TouchEvent) => {
      if (!tracking) return;
      if (event.touches.length !== 0) {
        cancel();
        return;
      }
      tracking = false;
      if (shouldRefreshAfterPull(distanceRef.current)) {
        updateDistance(0);
        if (refreshConversation) {
          // Merge fresh server data without throwing away the composer draft.
          startTransition(() => router.refresh());
        } else {
          setReloading(true);
          window.setTimeout(() => window.location.reload(), 180);
        }
      } else {
        updateDistance(0);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    // Root overscroll CSS prevents the browser's duplicate refresh. Merely
    // observe movement: Safari can deliver non-cancelable moves, and nested
    // scrolling must never depend on a dynamically installed blocking listener.
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", finish, { passive: true });
    window.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", finish);
      window.removeEventListener("touchcancel", cancel);
    };
  }, [refreshing, router, startTransition]);

  const visibleDistance = refreshing ? 56 : distance;
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
        opacity: Math.min(1, visibleDistance / 32),
        transform: `translate3d(0, ${visibleDistance - 48}px, 0)`,
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
