"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { flashResult, settle, type SettleTarget } from "@/lib/ui/settle";

/**
 * Finish a completed action well: `settle` applies a change that removes
 * something from the page and leaves the person looking at the result;
 * `flash` tints a result that changed in place. Both stop on unmount.
 */
export function useSettle() {
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);

  const run = useCallback((change: () => void, target: SettleTarget) => {
    cancel.current?.();
    cancel.current = settle(change, target);
  }, []);
  const flash = useCallback((target: SettleTarget, options?: { anchor?: SettleTarget }) => {
    cancel.current?.();
    cancel.current = flashResult(target, options);
  }, []);
  return { settle: run, flash };
}

/** How long a button shows its "done" state before the surface closes. */
const BEAT_MS = 650;

/**
 * A short confirmed state for the button the person just pressed ("Sent" with
 * a check) before its surface closes. The action has already finished; the
 * beat only keeps the confirmation where the person is looking.
 */
export function useSuccessBeat() {
  const [done, setDone] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const play = useCallback(
    () =>
      new Promise<void>((resolve) => {
        setDone(true);
        timer.current = window.setTimeout(() => {
          // Resolve first: the caller closes the surface while the button
          // still says "Sent". Resetting first would flash the old label.
          resolve();
          timer.current = window.setTimeout(() => setDone(false), 300);
        }, BEAT_MS);
      }),
    [],
  );
  return { done, play };
}
