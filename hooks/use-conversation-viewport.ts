"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import { conversationViewport } from "@/lib/chat/conversation";

/** CSS owns layout; the visual viewport supplies the space above mobile keyboards. */
export function useConversationViewport<T extends HTMLElement>(
  active = true,
  mode: "route" | "overlay" = "route"
) {
  // Overlay portals may mount after their owner's layout effect.
  const [element, setElement] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => setElement(node), []);
  useLayoutEffect(() => {
    if (!active || !element) return;
    const viewport = window.visualViewport;
    const mobile = window.matchMedia("(max-width: 1023px)");
    let frame = 0;
    const update = () => {
      // Keep pinch zoom native instead of resizing the interface around it.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      const bounds = conversationViewport(
        { height: viewport?.height ?? window.innerHeight, offsetTop: viewport?.offsetTop ?? 0 },
        element.getBoundingClientRect().top,
        mobile.matches || mode === "overlay",
        mode === "route" && !mobile.matches ? 28 : 0
      );
      element.style.setProperty("--conversation-height", `${Math.round(bounds.height)}px`);
      element.style.setProperty("--conversation-top", `${Math.round(bounds.top)}px`);
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };
    update();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    mobile.addEventListener("change", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      mobile.removeEventListener("change", schedule);
      element.style.removeProperty("--conversation-height");
      element.style.removeProperty("--conversation-top");
    };
  }, [active, mode, element]);
  return ref;
}
