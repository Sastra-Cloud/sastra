"use client";

import { usePathname } from "next/navigation";
import { useConversationViewport } from "@/hooks/use-conversation-viewport";
import { cn } from "@/lib/utils";

export function ProjectWorkspaceFrame({ children }: { children: React.ReactNode }) {
  const chat = usePathname().endsWith("/chat");
  const ref = useConversationViewport<HTMLDivElement>(chat);
  return (
    <div ref={ref} data-mobile-conversation={chat ? "" : undefined}
      className={cn("w-full min-w-0", chat
        ? "conversation-route project-chat-frame flex h-[var(--conversation-height,calc(100dvh-7.5rem))] min-h-0 flex-col gap-2 lg:min-h-[260px] lg:overflow-y-auto lg:overscroll-contain lg:[&>.project-content]:min-h-[22rem] [&>section]:shrink-0 [&>.project-extra]:hidden [&>.project-content]:flex [&>.project-content]:min-h-0 [&>.project-content]:flex-1"
        : "space-y-4")}
    >{children}</div>
  );
}
