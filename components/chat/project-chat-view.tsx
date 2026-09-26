"use client";

import { AssistantShortcut } from "@/components/assistant/assistant-shortcut";
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
  channels,
  activeChannel,
  currentUser,
  messages,
  members,
  pins,
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
      <div className="flex w-full min-h-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-sm font-semibold">
            Chat · {activeChannel.name}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <AssistantShortcut />
            <PinnedMessagesButton />
          </div>
        </div>
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
          fillAvailable
          contextLabel={`${activeChannel.name} discourse`}
          emptyDescription={`Keep ${activeChannel.name.toLowerCase()} decisions, files, and updates together for this project.`}
          placeholder={`Message #${activeChannel.name.toLowerCase()}...`}
          loading={loading}
        />
      </div>
    </MessagePinsProvider>
  );
}
