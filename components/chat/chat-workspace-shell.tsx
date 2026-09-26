"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MessageSquareText } from "lucide-react";

import type { ChatSidebarData } from "@/lib/chat/queries";
import { ChannelList } from "@/components/chat/channel-list";
import {
  ChatNavigationProvider,
  useChatNavigation,
} from "@/components/chat/chat-navigation-context";
import { channelIdFromPathname } from "@/lib/chat/navigation";
import { cn } from "@/lib/utils";

export function ChatWorkspaceShell({
  sidebar,
  canCreate,
  children,
}: {
  sidebar: ChatSidebarData;
  canCreate: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const activeChannelId = channelIdFromPathname(pathname);
  const activeProjectId =
    sidebar.projects.find((project) =>
      project.channels.some((channel) => channel.id === activeChannelId)
    )?.projectId ?? null;
  const hasConversations =
    sidebar.directMessages.length > 0 ||
    sidebar.channels.length > 0 ||
    sidebar.projects.length > 0;
  const workspaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeChannelId) return;

    const workspace = workspaceRef.current;
    const viewport = window.visualViewport;
    const updateViewportHeight = () => {
      workspace?.style.setProperty(
        "--chat-viewport-height",
        `${Math.round(viewport?.height ?? window.innerHeight)}px`
      );
    };

    updateViewportHeight();
    viewport?.addEventListener("resize", updateViewportHeight);
    window.addEventListener("resize", updateViewportHeight);

    return () => {
      viewport?.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("resize", updateViewportHeight);
      workspace?.style.removeProperty("--chat-viewport-height");
    };
  }, [activeChannelId]);

  return (
    <ChatNavigationProvider
      activeChannelId={activeChannelId}
      hasConversations={hasConversations}
    >
      <div
        ref={workspaceRef}
        data-chat-conversation={activeChannelId ? "" : undefined}
        className={cn(
          "grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]",
          activeChannelId &&
            "h-[calc(var(--chat-viewport-height,100dvh)-6.5rem-1px)] min-h-0 overflow-hidden md:h-[calc(var(--chat-viewport-height,100dvh)-7.5rem-1px)]"
        )}
      >
        <aside
          className={cn(
            activeChannelId &&
              "hidden h-full min-h-0 overflow-y-auto overscroll-contain pr-1 lg:block"
          )}
        >
          {!activeChannelId ? <div className="mb-4 lg:hidden"><h1 className="font-heading text-2xl font-semibold">Chat</h1><p className="text-sm text-muted-foreground">Choose a teammate, team channel, or project conversation.</p></div> : null}
          <ChannelList
            channels={sidebar.channels}
            directMessages={sidebar.directMessages}
            directCandidates={sidebar.directCandidates}
            projects={sidebar.projects}
            activeId={activeChannelId ?? undefined}
            activeProjectId={activeProjectId}
            canCreate={canCreate}
          />
        </aside>
        <div
          className={cn(
            "min-w-0",
            activeChannelId && "h-full min-h-0 overflow-hidden"
          )}
        >
          {children}
        </div>
      </div>
    </ChatNavigationProvider>
  );
}

export function ChatIndexPanel() {
  const { hasConversations } = useChatNavigation();

  return (
    <section className="surface-shadow hidden min-h-[32rem] items-center justify-center rounded-xl border bg-card p-8 text-card-foreground lg:flex">
      <div className="max-w-sm text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <MessageSquareText className="size-6" />
        </span>
        <h1 className="mt-4 font-heading text-2xl font-semibold tracking-tight">
          {hasConversations ? "Choose a conversation" : "No conversations yet"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {hasConversations
            ? "Direct messages, team channels, and project conversations stay organized here."
            : "Start a direct message. Ask a manager if you need a team channel."}
        </p>
      </div>
    </section>
  );
}
