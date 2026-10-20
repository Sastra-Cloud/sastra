import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMessageHold } from "./message-hold";

const point = { pointerId: 1, clientX: 50, clientY: 50 };
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("message hold", () => {
  it("opens after 500ms, once, without selecting a reaction", () => {
    const open = vi.fn(), hold = createMessageHold(open);
    hold.start(point);
    vi.advanceTimersByTime(499);
    expect(open).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(open).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(open).toHaveBeenCalledTimes(1);
    expect(hold.consumeClick()).toBe(true);
    expect(hold.consumeClick()).toBe(false);
  });
  it.each(["release", "scroll", "pointercancel", "unmount"])("cancels on %s", () => {
    const open = vi.fn(), hold = createMessageHold(open);
    hold.start(point); vi.advanceTimersByTime(300); hold.cancel(); vi.advanceTimersByTime(500);
    expect(open).not.toHaveBeenCalled();
    expect(hold.consumeClick()).toBe(false);
  });
  it("allows small finger jitter but cancels intentional movement", () => {
    const open = vi.fn(), hold = createMessageHold(open);
    hold.start(point); hold.move({ ...point, clientX: 54, clientY: 54 }); vi.advanceTimersByTime(500);
    expect(open).toHaveBeenCalledOnce();
    hold.start(point); hold.move({ ...point, clientY: 59 }); vi.advanceTimersByTime(500);
    expect(open).toHaveBeenCalledOnce();
  });
  it("cancels for another contact and resets click suppression on the next touch", () => {
    const open = vi.fn(), hold = createMessageHold(open);
    hold.start(point); hold.move({ ...point, pointerId: 2 }); vi.advanceTimersByTime(500);
    expect(open).not.toHaveBeenCalled();
    hold.start(point); vi.advanceTimersByTime(500); hold.reset();
    expect(hold.consumeClick()).toBe(false);
  });
});
