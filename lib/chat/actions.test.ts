import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireChannelAccess: vi.fn(),
  original: vi.fn(),
  insert: vi.fn(),
  handleStandupAnswer: vi.fn(),
  listAll: vi.fn(), listByIds: vi.fn(), listProject: vi.fn(), notifyMany: vi.fn(),
  memberRows: vi.fn(), recipient: vi.fn(), notify: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/chat/access", () => ({ requireChannelAccess: mocks.requireChannelAccess }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({
    from: () => ({
      where: () => ({ limit: mocks.original, then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(mocks.memberRows()).then(resolve) }),
      innerJoin: () => ({ where: () => ({ limit: mocks.recipient }) }),
    }),
  }),
  insert: () => ({ values: mocks.insert }),
} }));
vi.mock("@/lib/mentions/roster", () => ({
  listAllMentionTargets: mocks.listAll, listMentionTargetsByIds: mocks.listByIds,
  listProjectMentionTargets: mocks.listProject,
}));
vi.mock("@/lib/standup/engine", () => ({ handleStandupAnswer: mocks.handleStandupAnswer }));
vi.mock("@/lib/notifications", () => ({ notifyMany: mocks.notifyMany, notify: mocks.notify }));

import { postMessage } from "./actions";

const CHANNEL = "01923f4e-7b2a-7c3d-8e4f-5a6b7c8d9e00";
const ORIGINAL = "01923f4e-7b2a-7c3d-8e4f-5a6b7c8d9e01";
const draft = { channelId: CHANNEL, content: "Agreed", replyToId: ORIGINAL };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user: { id: "session-user", name: "Teammate" } });
  mocks.requireChannelAccess.mockResolvedValue(undefined);
  mocks.original.mockResolvedValue([{ channelId: CHANNEL, deletedAt: null }]);
  mocks.insert.mockResolvedValue(undefined);
  mocks.notifyMany.mockResolvedValue(undefined);
  mocks.notify.mockResolvedValue(undefined);
  mocks.recipient.mockResolvedValue([]);
  mocks.memberRows.mockResolvedValue([{ userId: "teammate" }, { userId: "session-user" }]);
  const roster = [{ id: "session-user", name: "Teammate" }, { id: "teammate", name: "Alex" }];
  mocks.listAll.mockResolvedValue(roster);
  mocks.listByIds.mockResolvedValue(roster);
  mocks.listProject.mockResolvedValue(roster);
});

it("links a direct-message alert to the exact persisted message for read acknowledgement", async () => {
  mocks.recipient.mockResolvedValue([{ userId: "recipient" }]);
  const sent = await postMessage({ channelId: CHANNEL, content: "Please review" });
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    userId: "recipient", type: "direct_message",
    data: { channelId: CHANNEL, messageId: sent.id, sentBy: "session-user" },
  }));
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ id: sent.id }));
});

describe("channel-wide alerts", () => {
  it.each([
    { kind: "custom", projectId: null, scope: "private" },
    { kind: "project", projectId: "project", scope: "project" },
    { kind: "general", projectId: null, scope: "workspace" },
  ])("uses the server's $scope roster and notifies each teammate once", async ({ kind, projectId, scope }) => {
    mocks.original.mockResolvedValue([{ kind, projectId, name: "Updates" }]);
    await postMessage({ channelId: CHANNEL, content: "@channel @Alex @channel review today" });
    if (scope === "private") expect(mocks.listByIds).toHaveBeenCalledWith(["teammate", "session-user"]);
    if (scope === "project") expect(mocks.listProject).toHaveBeenCalledWith("project");
    if (scope !== "workspace") expect(mocks.listAll).not.toHaveBeenCalled();
    else expect(mocks.listAll).toHaveBeenCalledOnce();
    expect(mocks.notifyMany).toHaveBeenCalledExactlyOnceWith(["teammate"], expect.objectContaining({
      type: "mention", link: `/chat/${CHANNEL}`,
      data: { channelId: CHANNEL, messageId: expect.any(String), mentionedBy: "session-user", channelMention: true },
    }));
    expect(mocks.insert).toHaveBeenCalledOnce();
  });

  it.each(["direct", "standup"])("does not broadcast in a %s conversation", async kind => {
    mocks.original.mockResolvedValue([{ kind, projectId: null, name: "Private" }]);
    await postMessage({ channelId: CHANNEL, content: "@channel" });
    expect(mocks.notifyMany).not.toHaveBeenCalled();
    expect(mocks.listAll).not.toHaveBeenCalled();
  });

  it("keeps a sent message when notification delivery fails", async () => {
    mocks.original.mockResolvedValue([{ kind: "general", projectId: null, name: "General" }]);
    mocks.notifyMany.mockRejectedValue(new Error("Delivery unavailable"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(postMessage({ channelId: CHANNEL, content: "@channel Important update" })).resolves.toEqual({ id: expect.any(String) });
      expect(mocks.insert).toHaveBeenCalledOnce();
    } finally { errorLog.mockRestore(); }
  });
});

describe("reply delivery", () => {
  // These protect the independently callable send boundary from forged private
  // references, and keep legitimate replies from losing their persisted link.
  it("persists the selected original using the authenticated sender", async () => {
    await postMessage(draft);
    expect(mocks.requireChannelAccess).toHaveBeenCalledWith(CHANNEL, "session-user");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      channelId: CHANNEL, userId: "session-user", replyToId: ORIGINAL, content: "Agreed",
    }));
  });

  it.each([
    { original: [] },
    { original: [{ channelId: "another-conversation", deletedAt: null }] },
    { original: [{ channelId: CHANNEL, deletedAt: new Date() }] },
  ])("rejects missing, cross-conversation, and deleted originals before writing (%j)", async ({ original }) => {
    mocks.original.mockResolvedValue(original);
    await expect(postMessage(draft)).rejects.toThrow("no longer available");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not read an original or send when conversation access has been revoked", async () => {
    mocks.requireChannelAccess.mockRejectedValue(new Error("Conversation not found."));
    await expect(postMessage(draft)).rejects.toThrow("Conversation not found.");
    expect(mocks.original).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("stops before reads and writes without an authenticated session", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(postMessage(draft)).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.requireChannelAccess).not.toHaveBeenCalled();
    expect(mocks.original).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
