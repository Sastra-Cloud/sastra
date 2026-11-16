import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PullToRefresh } from "./pull-to-refresh";

const state = vi.hoisted(() => ({ distance: vi.fn(), refreshing: vi.fn(), refreshRoute: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const router = { refresh: state.refreshRoute };
// Run the installed browser handlers without rendering the decorative indicator.
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useEffect: vi.fn(),
  useRef: (current: unknown) => ({ current }),
  useTransition: () => [false, (run: () => void) => run()],
  useState: (initial: unknown) => [initial, typeof initial === "boolean" ? state.refreshing : state.distance],
}));

class Target {
  parentElement: Target | null = null;
  scrollTop = 0;
  closest = vi.fn<(selector: string) => Target | null>(() => null);
}

let browser: EventTarget & {
  scrollY: number;
  location: { reload: ReturnType<typeof vi.fn> };
};
let target: Target;
let conversation: boolean;
let overflowY: string;
let cleanup: (() => void) | undefined;

function touch(type: string, y: number, fingers = type === "touchend" ? 0 : 1, cancelable = true) {
  const event = new Event(type, { cancelable });
  Object.defineProperties(event, {
    target: { value: target },
    touches: { value: Array.from({ length: fingers }, () => ({ clientX: 100, clientY: y })) },
  });
  browser.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  conversation = false;
  overflowY = "visible";
  target = new Target();
  target.closest.mockImplementation(selector => selector === "[data-mobile-conversation]" && conversation ? target : null);
  browser = Object.assign(new EventTarget(), {
    scrollY: 0,
    matchMedia: () => ({ matches: true }),
    getComputedStyle: () => ({ overflowY }),
    location: { reload: vi.fn() },
    setTimeout,
  });
  vi.stubGlobal("Element", Target);
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", {
    querySelector: () => conversation ? target : null,
    body: new Target(), documentElement: new Target(),
  });
  PullToRefresh();
  cleanup = vi.mocked(useEffect).mock.calls[0][0]() as () => void;
});

afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("mobile refresh event ownership", () => {
  it("never steals chat scrolling or reloads a conversation when the document stays at zero", () => {
    conversation = true;
    touch("touchstart", 100);
    expect(touch("touchmove", 400).defaultPrevented).toBe(false);
    touch("touchend", 400);
    vi.runAllTimers();
    expect(state.distance).toHaveBeenCalledExactlyOnceWith(0);
    expect(state.refreshing).not.toHaveBeenCalled();
    expect(browser.location.reload).not.toHaveBeenCalled();
  });

  it("leaves an inner scroll panel alone even at its top edge", () => {
    overflowY = "auto";
    touch("touchstart", 100);
    expect(touch("touchmove", 400).defaultPrevented).toBe(false);
    touch("touchend", 400);
    vi.runAllTimers();
    expect(state.refreshing).not.toHaveBeenCalled();
    expect(browser.location.reload).not.toHaveBeenCalled();
  });

  it("refreshes server data from the chat header without reloading away an unsent draft", () => {
    conversation = true;
    target.closest.mockImplementation(selector => selector === "[data-conversation-refresh]" ? target : null);
    touch("touchstart", 100);
    touch("touchmove", 300, 1, false);
    touch("touchend", 300);
    vi.runAllTimers();
    expect(state.refreshRoute).toHaveBeenCalledOnce();
    expect(browser.location.reload).not.toHaveBeenCalled();
  });

  it("requires a new chat pull to start at the transcript top, not midway through reading history", () => {
    conversation = true;
    overflowY = "auto";
    target.closest.mockImplementation(selector => selector === '[data-slot="message-scroller-viewport"]' ? target : null);
    target.scrollTop = 180;
    touch("touchstart", 100);
    target.scrollTop = 0;
    touch("touchmove", 300);
    touch("touchend", 300);
    expect(state.refreshRoute).not.toHaveBeenCalled();

    touch("touchstart", 100);
    touch("touchmove", 300);
    touch("touchend", 300);
    vi.runAllTimers();
    expect(state.refreshRoute).toHaveBeenCalledOnce();
    expect(browser.location.reload).not.toHaveBeenCalled();
  });

  it("keeps ordinary page refresh deliberate, with pull feedback before a single reload", () => {
    touch("touchstart", 100);
    expect(touch("touchmove", 200).defaultPrevented).toBe(false);
    expect(state.distance).toHaveBeenLastCalledWith(42);
    touch("touchend", 200);
    vi.runAllTimers();
    expect(browser.location.reload).not.toHaveBeenCalled();

    touch("touchstart", 100);
    touch("touchmove", 300);
    expect(state.distance).toHaveBeenLastCalledWith(84);
    touch("touchend", 300);
    expect(state.refreshing).toHaveBeenCalledWith(true);
    expect(browser.location.reload).not.toHaveBeenCalled();
    touch("touchend", 300);
    vi.runAllTimers();
    expect(browser.location.reload).toHaveBeenCalledOnce();
  });

  it("cancels an armed pull when another finger interrupts instead of refreshing on release", () => {
    touch("touchstart", 100);
    touch("touchmove", 300);
    touch("touchstart", 300, 2);
    touch("touchend", 300);
    vi.runAllTimers();
    expect(state.distance).toHaveBeenLastCalledWith(0);
    expect(browser.location.reload).not.toHaveBeenCalled();
  });

  it("refreshes on Safari's non-cancelable touch moves without blocking native scrolling", () => {
    touch("touchstart", 100);
    const move = touch("touchmove", 300, 1, false);
    expect(move.defaultPrevented).toBe(false);
    expect(state.distance).toHaveBeenLastCalledWith(84);
    touch("touchend", 300);
    vi.runAllTimers();
    expect(browser.location.reload).toHaveBeenCalledOnce();
  });
});
