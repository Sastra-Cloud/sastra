import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mark: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/chat/actions", () => ({ markChannelRead: mocks.mark }));
vi.mock("@/lib/notifications/client-events", () => ({ requestNotificationRefresh: mocks.refresh }));
import { syncChannelRead } from "./read-client";

afterEach(() => vi.clearAllMocks());

it("keeps the unread badge until a read receipt saves, then reconciles immediately", async () => {
  let save!: () => void;
  mocks.mark.mockReturnValue(new Promise<void>((resolve) => { save = resolve; }));
  const pending = syncChannelRead("channel", "message");
  expect(mocks.mark).toHaveBeenCalledWith("channel", "message");
  expect(mocks.refresh).not.toHaveBeenCalled();
  save();
  await pending;
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("does not falsely clear unread messages when a read receipt fails", async () => {
  mocks.mark.mockRejectedValue(new Error("offline"));
  await expect(syncChannelRead("channel", "message")).resolves.toBeUndefined();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
