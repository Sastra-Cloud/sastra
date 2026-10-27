"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/** Keep both panels in view, leaving the selected message between them when possible. */
export function useMessageMenuLayout(open: boolean, reactionsOnly: boolean, surface: RefObject<HTMLDivElement | null>, popup: HTMLDivElement | null,
  reactions: RefObject<HTMLDivElement | null>, commands: RefObject<HTMLDivElement | null>, close: () => void) {
  const [layout, setLayout] = useState({ split: false, gap: 0, reactionHeight: 60, height: 0,
    boundary: undefined as { x: number; y: number; width: number; height: number } | undefined });
  useLayoutEffect(() => {
    if (!open || !popup || !surface.current || !reactions.current) return;
    const element = surface.current;
    const viewport = window.visualViewport;
    const scroller = element.closest('[data-slot="message-scroller-viewport"]');
    function update() {
      const bubble = element.getBoundingClientRect();
      const scrollBounds = scroller?.getBoundingClientRect();
      let top = Math.max(viewport?.offsetTop ?? 0, scrollBounds?.top ?? 0) + 12;
      let bottom = Math.min((viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight), scrollBounds?.bottom ?? window.innerHeight) - 12;
      // When the keyboard leaves almost no transcript, use the visible screen.
      if (bottom - top < 100) {
        top = (viewport?.offsetTop ?? 0) + 12;
        bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 12;
      }
      const reactionHeight = reactions.current?.offsetHeight ?? 60;
      const commandHeight = commands.current?.scrollHeight ?? 0;
      const split = !reactionsOnly && bubble.top - reactionHeight - 8 >= top && bubble.bottom + commandHeight + 8 <= bottom;
      const boundary = { x: viewport?.offsetLeft ?? 0, y: top - 12, width: viewport?.width ?? window.innerWidth, height: bottom - top + 24 };
      const next = { split, gap: split ? bubble.height + 16 : 0, reactionHeight, height: Math.max(100, bottom - top), boundary };
      setLayout(current => current.split === next.split && current.gap === next.gap && current.reactionHeight === next.reactionHeight && current.height === next.height &&
        current.boundary?.x === boundary.x && current.boundary.y === boundary.y && current.boundary.width === boundary.width ? current : next);
    }
    function onScroll(event: Event) {
      // Scroll gestures outside dismiss it. Focus/resize can scroll the anchor
      // automatically, so a raw scroll event must not cancel keyboard opening.
      if (event.target instanceof Node && popup?.contains(event.target)) return;
      close();
    }
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(reactions.current);
    if (commands.current) observer.observe(commands.current);
    if (scroller) observer.observe(scroller);
    window.addEventListener("resize", update);
    document.addEventListener("wheel", onScroll, { capture: true, passive: true });
    document.addEventListener("touchmove", onScroll, { capture: true, passive: true });
    viewport?.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      document.removeEventListener("wheel", onScroll, true);
      document.removeEventListener("touchmove", onScroll, true);
      viewport?.removeEventListener("resize", update);
    };
  }, [open, reactionsOnly, surface, popup, reactions, commands, close]);
  return layout;
}
