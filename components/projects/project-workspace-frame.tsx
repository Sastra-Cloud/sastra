"use client";

import { usePathname } from "next/navigation";
import { useConversationViewport } from "@/hooks/use-conversation-viewport";
import { cn } from "@/lib/utils";

export function ProjectWorkspaceFrame({ children }: { children: React.ReactNode }) {
  const chat = usePathname().endsWith("/chat");
  const ref = useConversationViewport<HTMLDivElement>(chat);
  // Keep a usable transcript/composer on very short desktops; only the project
  // panel scrolls when its header and that minimum no longer fit together.
  return (
    <div ref={ref} data-mobile-conversation={chat ? "" : undefined}
      className={cn("w-full min-w-0", chat
        ? "conversation-route project-chat-frame flex h-[var(--conversation-height,calc(100dvh-7.5rem))] min-h-0 flex-col gap-2 lg:overflow-y-auto lg:overscroll-contain lg:[&_[data-chat-thread]]:min-h-40 [&>section]:shrink-0 [&>.project-extra]:hidden [&>.project-content]:flex [&>.project-content]:min-h-0 [&>.project-content]:flex-1"
        : "space-y-4")}
    >{children}</div>
  );
}
