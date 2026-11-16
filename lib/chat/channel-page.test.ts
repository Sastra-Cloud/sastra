import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRecentMessages: vi.fn(async () => []),
  listProjectMentionTargets: vi.fn(async () => []),
  listProjectChannels: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireUser: async () => ({ user: { id: "viewer", name: "Viewer" } }) }));
vi.mock("@/lib/auth/policy", () => ({ can: () => false }));
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings: async () => ({ timezone: "UTC" }) }));
vi.mock("@/lib/chat/queries", () => ({
  getChannelById: async () => ({ id: "channel", projectId: "project", projectSlug: "book", projectTitle: "Book", name: "General", kind: "project" }),
  getRecentMessages: mocks.getRecentMessages,
  listProjectChannels: mocks.listProjectChannels,
  listDirectMessageCandidates: vi.fn(),
}));
vi.mock("@/lib/chat/pins", () => ({ listChannelPins: async () => [] }));
vi.mock("@/lib/mentions/roster", () => ({
  listProjectMentionTargets: mocks.listProjectMentionTargets,
  listAllMentionTargets: vi.fn(),
  listMentionTargetsByIds: vi.fn(),
}));
vi.mock("@/components/assistant/assistant-shortcut", () => ({ AssistantShortcut: () => null }));
vi.mock("@/components/chat/channel-members-sheet", () => ({ ChannelMembersSheet: () => null }));
vi.mock("@/components/chat/conversation-header", () => ({ ConversationHeader: () => null }));
vi.mock("@/components/chat/chat-thread", () => ({ ChatThread: () => null }));
vi.mock("@/components/chat/message-pins", () => ({ MessagePinsProvider: () => null, PinnedMessagesButton: () => null }));
vi.mock("@/components/chat/project-channel-tabs", () => ({ ProjectChannelTabs: () => null }));
vi.mock("@/components/page-skeleton", () => ({ ConversationLoadingSkeleton: () => null }));

import ChatChannelPage from "@/app/(app)/chat/[channelId]/page";

// A slow sidebar/header query used to delay starting the message request,
// adding a full extra query chain to every conversation navigation.
it("starts messages and mention targets while the channel tabs are still loading", async () => {
  let finishTabs!: (value: []) => void;
  mocks.listProjectChannels.mockReturnValue(new Promise<[]>(resolve => { finishTabs = resolve; }));
  const page = ChatChannelPage({ params: Promise.resolve({ channelId: "channel" }) });
  await vi.waitFor(() => expect(mocks.listProjectChannels).toHaveBeenCalled());
  expect(mocks.getRecentMessages).toHaveBeenCalledWith("channel", "viewer");
  expect(mocks.listProjectMentionTargets).toHaveBeenCalledWith("project");
  finishTabs([]);
  await expect(page).resolves.toBeDefined();
});
