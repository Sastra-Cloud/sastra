"use client";

import { useEffect, useLayoutEffect, useRef, type PointerEvent, type MouseEvent } from "react";
import { createMessageHold } from "@/lib/chat/message-hold";

const CONTROLS = "a,input,textarea,select,audio,video,[contenteditable=true],button:not([data-message-image])";

export function useMessageHold(enabled: boolean, onHold: () => void) {
  const callback = useRef(onHold);
  const detach = useRef(() => {});
  const touch = useRef(false);
  const hold = useRef<ReturnType<typeof createMessageHold> | null>(null);
  useEffect(() => { callback.current = onHold; }, [onHold]);
  useLayoutEffect(() => {
    hold.current = createMessageHold(() => { detach.current(); callback.current(); });
    return () => { hold.current?.reset(); detach.current(); };
  }, []);
  useEffect(() => {
    // Keep the generated-click guard until the held finger is released.
    if (!enabled) { hold.current?.cancel(); detach.current(); }
  }, [enabled]);

  return {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      hold.current!.reset();
      detach.current();
      touch.current = event.pointerType === "touch";
      if (!enabled || !touch.current || !event.isPrimary || (event.target as Element).closest(CONTROLS)) return;
      hold.current!.start({ pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY });
      const cancel = () => { hold.current!.cancel(); detach.current(); };
      const move = (next: globalThis.PointerEvent) => {
        hold.current!.move(next);
        if (!hold.current!.tracking) detach.current();
      };
      const another = (next: globalThis.PointerEvent) => {
        if (next.pointerId !== event.pointerId) cancel();
      };
      document.addEventListener("pointermove", move, { passive: true });
      document.addEventListener("pointerup", cancel);
      document.addEventListener("pointercancel", cancel);
      document.addEventListener("pointerdown", another, true);
      document.addEventListener("scroll", cancel, { capture: true, passive: true });
      document.addEventListener("visibilitychange", cancel);
      window.addEventListener("blur", cancel);
      detach.current = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", cancel);
        document.removeEventListener("pointercancel", cancel);
        document.removeEventListener("pointerdown", another, true);
        document.removeEventListener("scroll", cancel, true);
        document.removeEventListener("visibilitychange", cancel);
        window.removeEventListener("blur", cancel);
        detach.current = () => {};
      };
    },
    onClickCapture(event: MouseEvent<HTMLDivElement>) {
      if (hold.current!.consumeClick() && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); }
    },
    onContextMenu(event: MouseEvent<HTMLDivElement>) {
      // The browser may dispatch its callout after our menu has already opened.
      if (touch.current && !(event.target as Element).closest(CONTROLS)) event.preventDefault();
    },
  };
}
