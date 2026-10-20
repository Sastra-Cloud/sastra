"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { isNearConversationEnd } from "@/lib/chat/conversation";

/** Follow new content only while the reader is at the end. Sending opts back in. */
export function useConversationScroll(revision: string | number, active = true) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const scrollRef = useCallback((node: HTMLDivElement | null) => setElement(node), []);
  const following = useRef(true);
  const [canJump, setCanJump] = useState(false);
  const scrollToLatest = useCallback(() => {
    following.current = true;
    setCanJump(false);
    element?.scrollTo({ top: element.scrollHeight });
  }, [element]);
  const onScroll = useCallback(() => {
    if (!element) return;
    following.current = isNearConversationEnd(element);
    setCanJump(!following.current);
  }, [element]);
  useLayoutEffect(() => {
    if (active && element) {
      following.current = true;
      element.scrollTo({ top: element.scrollHeight });
    }
  }, [active, element]);
  useLayoutEffect(() => {
    if (active && following.current) element?.scrollTo({ top: element.scrollHeight });
  }, [revision, active, element]);
  useLayoutEffect(() => {
    if (!active || !element) return;
    const observer = new ResizeObserver(() => {
      if (following.current) element.scrollTo({ top: element.scrollHeight });
    });
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [active, element]);
  return { scrollRef, onScroll, canJump, scrollToLatest };
}
