import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireChannelAccess: vi.fn(),
  original: vi.fn(),
  insert: vi.fn(),
  handleStandupAnswer: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/chat/access", () => ({ requireChannelAccess: mocks.requireChannelAccess }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({
    from: () => ({
      where: () => ({ limit: mocks.original }),
      innerJoin: () => ({ where: () => ({ limit: async () => [] }) }),
    }),
  }),
  insert: () => ({ values: mocks.insert }),
} }));
vi.mock("@/lib/mentions/roster", () => ({}));
vi.mock("@/lib/mentions/notify", () => ({}));
vi.mock("@/lib/standup/engine", () => ({ handleStandupAnswer: mocks.handleStandupAnswer }));
vi.mock("@/lib/notifications", () => ({}));

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
