"use client";

import {
  Hash,
  Languages,
  LayoutTemplate,
  Megaphone,
  PenLine,
} from "lucide-react";

import type { ProjectChannelListItem } from "@/lib/chat/queries";
import { TabScroller } from "@/components/cockpit";
import { useChatNavigation } from "@/components/chat/chat-navigation-context";
import { MotionTabLink } from "@/components/motion/tab-link";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Hash> = {
  general: Hash,
  translation: Languages,
  editing: PenLine,
  layout: LayoutTemplate,
  marketing: Megaphone,
};

export function ProjectChannelTabs({
  slug,
  channels,
  activeId,
  mode = "project",
  onChannelNavigate,
}: {
  slug: string;
  channels: ProjectChannelListItem[];
  activeId: string;
  mode?: "project" | "chat";
  onChannelNavigate?: (channelId: string) => void;
}) {
  const { beginNavigation } = useChatNavigation();

  return (
    <TabScroller aria-label="Project chat channels">
      {channels.map((channel) => {
        const active = channel.id === activeId;
        const Icon = ICONS[channel.name.toLowerCase()] ?? Hash;
        return (
          <MotionTabLink
            key={channel.id}
            href={
              mode === "chat"
                ? `/chat/${channel.id}`
                : `/projects/${slug}/chat?channel=${channel.id}`
            }
            active={active}
            layoutId={`channel-tab-active-${mode}`}
            pendingIndicator
            onNavigate={() => {
              beginNavigation(channel.id);
              onChannelNavigate?.(channel.id);
            }}
          >
            <Icon className="size-4 shrink-0" />
            {channel.name}
            {channel.unread > 0 ? (
              <span
                className={cn(
                  "ml-1 rounded-full px-1.5 text-xs font-medium tabular-nums",
                  active
                    ? "bg-primary-foreground/18 text-primary-foreground"
                    : "bg-primary text-primary-foreground"
                )}
              >
                {channel.unread > 9 ? "9+" : channel.unread}
              </span>
            ) : null}
          </MotionTabLink>
        );
      })}
    </TabScroller>
  );
}
