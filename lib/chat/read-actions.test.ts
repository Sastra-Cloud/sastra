import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), requireUser: vi.fn(), access: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const db = drizzle(mocks.execute);
  // The proxy executes real Drizzle queries but has no transaction transport.
  return { db: Object.assign(db, { transaction: async (run: (tx: typeof db) => Promise<void>) => run(db) }) };
});
vi.mock("@/lib/auth/guards", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/chat/access", () => ({ requireChannelAccess: mocks.access }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/mentions/roster", () => ({}));
vi.mock("@/lib/mentions/notify", () => ({}));
vi.mock("@/lib/standup/engine", () => ({}));
vi.mock("@/lib/notifications", () => ({}));

import { markChannelRead } from "./actions";

const channel = "01923f4e-7b2a-7c3d-8e4f-5a6b7c8d9e00";
const message = "01923f4e-7b2a-7c3d-8e4f-5a6b7c8d9e01";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user: { id: "reader" } });
  mocks.access.mockResolvedValue(undefined);
  mocks.execute.mockImplementation(async (query: string) => ({ rows: query.startsWith("select") ? [[message]] : [] }));
});

describe("chat read notification boundary", () => {
  it("saves the viewed cursor and scopes acknowledgement to this reader's viewed chat alerts", async () => {
    await markChannelRead(channel, message);
    expect(mocks.access).toHaveBeenCalledWith(channel, "reader");
    const update = mocks.execute.mock.calls.find(([query]) => query.startsWith('update "notifications"'))!;
    const [query, params] = update;
    // These structural checks protect a consequential acknowledgement boundary.
    // The proxy does not execute predicates or prove PostgreSQL behavior.
    expect(query).toContain('"notifications"."user_id" =');
    expect(query).toContain('"notifications"."read_at" is null');
    expect(query).toContain('"notifications"."type" in');
    expect(query).toContain("->> 'channelId'");
    expect(query).toContain("->> 'messageId'");
    expect(query).toContain('"chat_messages"."id" <=');
    expect(query).toContain('not exists');
    expect(params).toEqual(expect.arrayContaining(["reader", channel, message, "direct_message", "mention"]));
    expect(mocks.revalidate).toHaveBeenCalledWith("/notifications");
  });

  it("does not clear any notifications for an empty conversation", async () => {
    await markChannelRead(channel, null);
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.execute.mock.calls[0][0]).toContain('insert into "channel_reads"');
  });

  it("rejects a missing or foreign cursor before changing either read state", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    await expect(markChannelRead(channel, message)).rejects.toThrow("Message not found");
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.execute.mock.calls[0][1]).toEqual([message, channel, 1]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("keeps another person's private conversation untouched after access is revoked", async () => {
    mocks.access.mockRejectedValue(new Error("Conversation not found."));
    await expect(markChannelRead(channel, message)).rejects.toThrow("Conversation not found");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("requires a session before looking up or acknowledging messages", async () => {
    mocks.requireUser.mockRejectedValue(new Error("Sign in required"));
    await expect(markChannelRead(channel, message)).rejects.toThrow("Sign in required");
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
