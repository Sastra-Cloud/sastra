import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createActivityTracker, USER_IDLE_MS } from "./tracker";

describe("activity tracker", () => {
  let hidden = false;
  const make = () =>
    createActivityTracker({
      now: () => Date.now(),
      isHidden: () => hidden,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    });

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
  });
  afterEach(() => vi.useRealTimers());

  it("goes idle after ten minutes without input and wakes on the next input", () => {
    const t = make();
    const changes: boolean[] = [];
    t.subscribe(() => changes.push(t.isActive()));
    expect(t.isActive()).toBe(true);
    vi.advanceTimersByTime(USER_IDLE_MS - 1);
    expect(t.isActive()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(t.isActive()).toBe(false);
    t.input();
    expect(t.isActive()).toBe(true);
    expect(changes).toEqual([false, true]);
    t.dispose();
  });

  it("input keeps pushing the idle deadline back", () => {
    const t = make();
    vi.advanceTimersByTime(USER_IDLE_MS - 1000);
    t.input();
    vi.advanceTimersByTime(USER_IDLE_MS - 1000);
    expect(t.isActive()).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(t.isActive()).toBe(false);
    t.dispose();
  });

  it("is inactive while the tab is hidden and active again when it returns", () => {
    const t = make();
    hidden = true;
    t.visibilityChanged();
    expect(t.isActive()).toBe(false);
    t.input(); // input events from a hidden tab do not count
    expect(t.isActive()).toBe(false);
    hidden = false;
    t.visibilityChanged();
    expect(t.isActive()).toBe(true);
    t.dispose();
  });

  it("starts inactive in a tab that opens hidden", () => {
    hidden = true;
    const t = make();
    expect(t.isActive()).toBe(false);
    t.dispose();
  });
});
