"use client";

import { useState } from "react";

import type {
  ChatMessageView,
  ProjectChannelListItem,
} from "@/lib/chat/queries";
import type { MentionTarget } from "@/lib/mentions/roster";
import { ChatThread } from "@/components/chat/chat-thread";
import { ProjectChannelTabs } from "@/components/chat/project-channel-tabs";

export function ProjectChatView({
  slug,
  channels,
  activeChannel,
  currentUser,
  messages,
  members,
}: {
  slug: string;
  channels: ProjectChannelListItem[];
  activeChannel: Pick<ProjectChannelListItem, "id" | "name">;
  currentUser: {
    id: string;
    name: string;
    image: string | null;
  };
  messages: ChatMessageView[];
  members: MentionTarget[];
}) {
  const [pendingChannelId, setPendingChannelId] = useState<string | null>(null);
  const loading =
    pendingChannelId !== null && pendingChannelId !== activeChannel.id;

  return (
    <div className="space-y-3">
      <ProjectChannelTabs
        slug={slug}
        channels={channels}
        activeId={activeChannel.id}
        onChannelNavigate={setPendingChannelId}
      />
      <ChatThread
        channelId={activeChannel.id}
        currentUserId={currentUser.id}
        currentUserName={currentUser.name}
        currentUserImage={currentUser.image}
        initialMessages={messages}
        members={members}
        variant="project"
        contextLabel={`${activeChannel.name} discourse`}
        emptyDescription={`Keep ${activeChannel.name.toLowerCase()} decisions, files, and updates together for this project.`}
        placeholder={`Message #${activeChannel.name.toLowerCase()}...`}
        loading={loading}
      />
    </div>
  );
}
