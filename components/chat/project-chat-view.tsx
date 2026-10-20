"use client";

import { AssistantShortcut } from "@/components/assistant/assistant-shortcut";
import { ConversationHeader } from "@/components/chat/conversation-header";
import { useState } from "react";

import type {
  ChatMessageView,
  ProjectChannelListItem,
} from "@/lib/chat/queries";
import type { ChatPinnedMessage } from "@/lib/chat/pin-state";
import type { MentionTarget } from "@/lib/mentions/roster";
import { ChatThread } from "@/components/chat/chat-thread";
import {
  MessagePinsProvider,
  PinnedMessagesButton,
} from "@/components/chat/message-pins";
import { ProjectChannelTabs } from "@/components/chat/project-channel-tabs";

export function ProjectChatView({
  slug,
  projectTitle,
  channels,
  activeChannel,
  currentUser,
  messages,
  members,
  pins,
}: {
  slug: string;
  projectTitle: string;
  channels: ProjectChannelListItem[];
  activeChannel: Pick<ProjectChannelListItem, "id" | "name">;
  currentUser: {
    id: string;
    name: string;
    image: string | null;
    timezone: string;
  };
  messages: ChatMessageView[];
  members: MentionTarget[];
  pins: ChatPinnedMessage[];
}) {
  const [pendingChannelId, setPendingChannelId] = useState<string | null>(null);
  const loading =
    pendingChannelId !== null && pendingChannelId !== activeChannel.id;

  return (
    <MessagePinsProvider
      key={activeChannel.id}
      currentUserId={currentUser.id}
      currentUserName={currentUser.name}
      initialPins={pins}
    >
      <div className="flex w-full min-h-0 flex-1 flex-col lg:gap-2">
        <ConversationHeader title={projectTitle} subtitle={`#${activeChannel.name}`} backHref={`/projects/${slug}`} actions={<><AssistantShortcut /><PinnedMessagesButton /></>} />
        <ProjectChannelTabs
          slug={slug}
          channels={channels}
          activeId={activeChannel.id}
          onChannelNavigate={setPendingChannelId}
        />
        <ChatThread
          key={activeChannel.id}
          channelId={activeChannel.id}
          currentUserId={currentUser.id}
          currentUserName={currentUser.name}
          currentUserImage={currentUser.image}
          initialMessages={messages}
          members={members}
          variant="project"
          fillAvailable
          timeZone={currentUser.timezone}
          contextLabel={`${activeChannel.name} discourse`}
          emptyDescription={`Keep ${activeChannel.name.toLowerCase()} decisions, files, and updates together for this project.`}
          placeholder={`Message #${activeChannel.name.toLowerCase()}...`}
          loading={loading}
        />
      </div>
    </MessagePinsProvider>
  );
}
