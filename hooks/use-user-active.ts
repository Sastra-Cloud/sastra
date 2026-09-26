"use client";

import { useSyncExternalStore } from "react";

import { createActivityTracker, type ActivityTracker } from "@/lib/activity/tracker";

const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

let tracker: ActivityTracker | null = null;
let subscribers = 0;
let teardown: (() => void) | null = null;

function ensureTracker(): ActivityTracker {
  if (tracker) return tracker;
  const t = createActivityTracker({
    now: () => Date.now(),
    isHidden: () => document.hidden,
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (handle) => window.clearTimeout(handle as number),
  });
  const onInput = () => t.input();
  const onVisibility = () => t.visibilityChanged();
  for (const name of INPUT_EVENTS) window.addEventListener(name, onInput, { passive: true, capture: true });
  window.addEventListener("focus", onInput);
  document.addEventListener("visibilitychange", onVisibility);
  teardown = () => {
    for (const name of INPUT_EVENTS) window.removeEventListener(name, onInput, { capture: true });
    window.removeEventListener("focus", onInput);
    document.removeEventListener("visibilitychange", onVisibility);
    t.dispose();
  };
  tracker = t;
  return t;
}

function subscribe(listener: () => void): () => void {
  const t = ensureTracker();
  subscribers += 1;
  const unsubscribe = t.subscribe(listener);
  return () => {
    unsubscribe();
    subscribers -= 1;
    if (subscribers === 0) {
      teardown?.();
      teardown = null;
      tracker = null;
    }
  };
}

/**
 * True while this tab is visible and the user has typed, clicked, touched, or
 * scrolled in the last ten minutes. Use it to pause background refreshes for
 * unattended tabs; it never blocks anything the user does.
 */
export function useUserActive(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (tracker ? tracker.isActive() : !document.hidden),
    () => true
  );
}
