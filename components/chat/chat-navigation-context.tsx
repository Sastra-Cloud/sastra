"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

const NAVIGATION_TIMEOUT_MS = 15_000;

type PendingNavigation = {
  channelId: string;
  sourcePathname: string;
};

type ChatNavigationValue = {
  pendingChannelId: string | null;
  beginNavigation: (channelId: string) => void;
  hasConversations: boolean;
};

const ChatNavigationContext = createContext<ChatNavigationValue | null>(null);
const FALLBACK_NAVIGATION: ChatNavigationValue = {
  pendingChannelId: null,
  beginNavigation: () => undefined,
  hasConversations: false,
};

export function ChatNavigationProvider({
  activeChannelId,
  hasConversations,
  children,
}: {
  activeChannelId: string | null;
  hasConversations: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const pendingChannelId =
    pending?.sourcePathname === pathname ? pending.channelId : null;

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    []
  );

  const beginNavigation = useCallback(
    (channelId: string) => {
      if (channelId === activeChannelId) return;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      const nextPending = { channelId, sourcePathname: pathname };
      setPending(nextPending);
      timeoutRef.current = window.setTimeout(() => {
        setPending((current) => (current === nextPending ? null : current));
        timeoutRef.current = null;
      }, NAVIGATION_TIMEOUT_MS);
    },
    [activeChannelId, pathname]
  );

  const value = useMemo(
    () => ({ pendingChannelId, beginNavigation, hasConversations }),
    [beginNavigation, hasConversations, pendingChannelId]
  );

  return (
    <ChatNavigationContext.Provider value={value}>
      {children}
    </ChatNavigationContext.Provider>
  );
}

export function useChatNavigation() {
  return useContext(ChatNavigationContext) ?? FALLBACK_NAVIGATION;
}
