import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getLastVisitedChannelId: vi.fn(),
  redirect: vi.fn((href: string): never => {
    throw new Error(`Redirect: ${href}`);
  }),
}));

vi.mock("@/lib/auth/guards", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/chat/queries", () => ({
  getLastVisitedChannelId: mocks.getLastVisitedChannelId,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/chat/chat-workspace-shell", () => ({
  ChatIndexPanel: () => null,
}));

import ChatIndexPage from "@/app/(app)/chat/page";
import { ChatIndexPanel } from "@/components/chat/chat-workspace-shell";
import { CHAT_LIST_HREF } from "./navigation";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user: { id: "current-teammate" } });
  mocks.getLastVisitedChannelId.mockResolvedValue("last-channel");
});

describe("opening Chat", () => {
  it("resumes the signed-in teammate's last accessible conversation", async () => {
    await expect(
      ChatIndexPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("Redirect: /chat/last-channel");

    expect(mocks.getLastVisitedChannelId).toHaveBeenCalledWith("current-teammate");
    expect(mocks.redirect).toHaveBeenCalledWith("/chat/last-channel");
  });

  it("shows the conversation list when there is no accessible history", async () => {
    mocks.getLastVisitedChannelId.mockResolvedValue(null);

    const result = await ChatIndexPage({ searchParams: Promise.resolve({}) });

    expect(result.type).toBe(ChatIndexPanel);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("lets Back and All chats open the list without reopening the conversation", async () => {
    const view = new URL(CHAT_LIST_HREF, "https://example.test").searchParams.get("view")!;
    const result = await ChatIndexPage({ searchParams: Promise.resolve({ view }) });

    expect(result.type).toBe(ChatIndexPanel);
    expect(mocks.getLastVisitedChannelId).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("requires a session before loading conversation history", async () => {
    mocks.requireUser.mockRejectedValueOnce(new Error("Sign in"));

    await expect(
      ChatIndexPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("Sign in");
    expect(mocks.getLastVisitedChannelId).not.toHaveBeenCalled();
  });
});
