/**
 * Tracks whether the person at this browser is actively using Sastra: the tab
 * is visible and there was keyboard, pointer, or touch input recently. Pure
 * (no `window`) so it is unit-testable; `hooks/use-user-active.ts` wires it up.
 *
 * Background refreshes (notification bell, presence, chat) pause while the
 * user is idle so an unattended tab does not keep the server and database
 * awake all night. They resume on the next input.
 */

/** How long without input before background refreshes pause. */
export const USER_IDLE_MS = 10 * 60_000;

/** Pointer moves fire constantly; count at most one input per interval. */
const INPUT_THROTTLE_MS = 1_000;

export type ActivityTrackerDeps = {
  idleMs?: number;
  now: () => number;
  isHidden: () => boolean;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
};

export type ActivityTracker = {
  isActive: () => boolean;
  /** Keyboard, pointer, touch, wheel, scroll, or focus. */
  input: () => void;
  /** The tab became visible or hidden. */
  visibilityChanged: () => void;
  subscribe: (listener: () => void) => () => void;
  /** Stop timers (for tests and teardown). */
  dispose: () => void;
};

export function createActivityTracker(deps: ActivityTrackerDeps): ActivityTracker {
  const idleMs = deps.idleMs ?? USER_IDLE_MS;
  const listeners = new Set<() => void>();
  let active = !deps.isHidden();
  let lastInput = deps.now();
  let timer: unknown = null;

  const set = (next: boolean) => {
    if (active === next) return;
    active = next;
    for (const listener of listeners) listener();
  };
  const arm = () => {
    if (timer !== null) deps.clearTimer(timer);
    timer = deps.setTimer(() => {
      timer = null;
      set(false);
    }, idleMs);
  };

  arm();

  return {
    isActive: () => active,
    input() {
      if (deps.isHidden()) return;
      const now = deps.now();
      if (active && now - lastInput < INPUT_THROTTLE_MS) return;
      lastInput = now;
      set(true);
      arm();
    },
    visibilityChanged() {
      if (deps.isHidden()) {
        set(false);
        return;
      }
      // Coming back to the tab counts as activity.
      lastInput = deps.now();
      set(true);
      arm();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (timer !== null) deps.clearTimer(timer);
      timer = null;
      listeners.clear();
    },
  };
}
