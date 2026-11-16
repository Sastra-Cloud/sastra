import { flushSync } from "react-dom";

export type SettleTarget = string | (() => Element | null | undefined);

/** How long the result stays tinted. Matches `settle-flash` in globals.css. */
const FLASH_MS = 1400;
/** How long to wait for a result that arrives with a later render. */
const WAIT_MS = 3000;
/** Space kept clear above the bottom edge when placing a result. */
const EDGE_PX = 24;
/** Sticky top bar height, used when the result sets no scroll margin. */
const DEFAULT_TOP_PX = 88;

function resolve(target: SettleTarget): HTMLElement | null {
  const found = typeof target === "string" ? document.querySelector(target) : target();
  return found instanceof HTMLElement ? found : null;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Top of the area not covered by sticky bars, read from the element's scroll margin. */
function clearTop(element: HTMLElement): number {
  return parseFloat(getComputedStyle(element).scrollMarginTop) || DEFAULT_TOP_PX;
}

/** Whether the element sits fully inside the visible, uncovered part of the page. */
function isInView(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.top >= clearTop(element) && rect.bottom <= window.innerHeight - EDGE_PX;
}

/**
 * Put the result in view without animation. A result that fits is centred, so
 * the person also sees what is around it; a tall one starts under the sticky bars.
 */
function place(element: HTMLElement) {
  if (isInView(element)) return;
  const rect = element.getBoundingClientRect();
  const top = clearTop(element);
  const room = window.innerHeight - top - EDGE_PX;
  const offset = rect.height < room ? top + (room - rect.height) / 2 : top;
  window.scrollBy({ top: rect.top - offset, behavior: "instant" });
}

/**
 * Tint a result for a moment so the eye finds it, waiting briefly if it arrives
 * with a later render. Use this alone when a result changes in place and
 * nothing is removed from the page. Returns a function that cancels it.
 *
 * `anchor` names where the view should start when the result is a long region
 * (a new budget, a new print run): its heading, not the middle of its content.
 */
export function flashResult(
  target: SettleTarget,
  options: { anchor?: SettleTarget } = {},
): () => void {
  const timers: number[] = [];
  let cancelled = false;
  let flashed: HTMLElement | null = null;
  const started = Date.now();

  function attempt() {
    if (cancelled) return;
    const element = resolve(target);
    if (!element) {
      if (Date.now() - started < WAIT_MS) timers.push(window.setTimeout(attempt, 100));
      return;
    }
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    const anchor = options.anchor ? resolve(options.anchor) : null;
    if (anchor) anchor.scrollIntoView({ block: "start", behavior });
    else if (!isInView(element)) element.scrollIntoView({ block: "nearest", behavior });
    flashed = element;
    element.setAttribute("data-settled", "");
    timers.push(window.setTimeout(() => element.removeAttribute("data-settled"), FLASH_MS));
  }
  attempt();

  return () => {
    cancelled = true;
    for (const timer of timers) window.clearTimeout(timer);
    flashed?.removeAttribute("data-settled");
  };
}

/**
 * Finish an action that removes something tall from the page (a sent email's
 * composer, a completed guide). `change` applies the state updates. Without
 * this the browser keeps its scroll position, so the person is left looking at
 * whatever slid into the viewport, often the empty end of the page.
 *
 * The change and the new scroll position are applied together, crossfaded where
 * the browser supports it, and the result is then tinted. Returns a function
 * that cancels the pending tint.
 */
export function settle(change: () => void, target: SettleTarget): () => void {
  const root = document.documentElement;
  let cancelFlash: (() => void) | null = null;
  let cancelled = false;

  function apply() {
    flushSync(change);
    const element = resolve(target);
    if (element) place(element);
  }
  function highlight() {
    if (!cancelled) cancelFlash = flashResult(target);
  }

  if (!prefersReducedMotion() && typeof document.startViewTransition === "function") {
    // Opt in to the root crossfade, which is otherwise switched off app-wide.
    root.setAttribute("data-settle-transition", "");
    const transition = document.startViewTransition(apply);
    transition.updateCallbackDone.then(highlight, highlight);
    transition.finished.finally(() => root.removeAttribute("data-settle-transition")).catch(() => {});
  } else {
    apply();
    highlight();
  }

  return () => {
    cancelled = true;
    cancelFlash?.();
  };
}
