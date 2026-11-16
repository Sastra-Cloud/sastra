import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), requireChannelAccess: vi.fn(), attachments: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(mocks.execute) };
});
vi.mock("@/lib/chat/access", () => ({ requireChannelAccess: mocks.requireChannelAccess }));
vi.mock("@/lib/files/queries", () => ({ listAttachmentsByTargets: mocks.attachments }));

import { getLastVisitedChannelId, getRecentMessages } from "./queries";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue({ rows: [] });
  mocks.requireChannelAccess.mockResolvedValue(undefined);
  mocks.attachments.mockResolvedValue(new Map());
});

describe("reply context in recent messages", () => {
  it("hydrates an older attachment-only original and redacts unavailable originals", async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [
        ["newest", "me", "Teammate", null, "Thanks", "unavailable", "sent", "2026-10-27 12:00:00", null],
        ["reply", "me", "Teammate", null, "Got the file", "older-original", "sent", "2026-10-27 11:00:00", null],
      ] })
      .mockResolvedValueOnce({ rows: [["older-original", "Alex", null]] });
    mocks.attachments.mockResolvedValue(new Map([["older-original", [{
      attachmentId: "attachment", fileId: "file", originalName: "cover.png",
      mimeType: "image/png", label: null, notes: null, sizeBytes: 120,
    }]]]));

    const messages = await getRecentMessages("channel", "me");
    expect(messages[0].replyTo).toEqual({
      messageId: "older-original", authorName: "Alex", preview: "cover.png", unavailable: false,
    });
    expect(messages[1].replyTo).toEqual({
      messageId: "unavailable", authorName: null, preview: "Original message unavailable", unavailable: true,
    });
    // The proxy does not enforce SQL predicates. This narrow structural check
    // guards the privacy boundary on old/forged reply ids; it is not a DB test.
    const [parentSql, parentParams] = mocks.execute.mock.calls[1];
    expect(parentSql).toContain('"chat_messages"."channel_id" =');
    expect(parentSql).toContain('"chat_messages"."deleted_at" is null');
    expect(parentParams).toContain("channel");
    expect(mocks.attachments).toHaveBeenCalledWith("message", ["reply", "newest", "older-original"]);
  });

  it("returns no quoted data after conversation access is revoked", async () => {
    mocks.requireChannelAccess.mockRejectedValue(new Error("Conversation not found."));
    await expect(getRecentMessages("private-channel", "removed-user")).rejects.toThrow("Conversation not found.");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.attachments).not.toHaveBeenCalled();
  });
});

describe("last visited conversation", () => {
  it("returns the last saved conversation or null for no history", async () => {
    expect(await getLastVisitedChannelId("teammate")).toBeNull();

    mocks.execute.mockResolvedValueOnce({ rows: [["last-channel"]] });
    expect(await getLastVisitedChannelId("teammate")).toBe("last-channel");
  });

  it("checks current membership before selecting the latest visit", async () => {
    await getLastVisitedChannelId("teammate");

    const [query, params] = mocks.execute.mock.calls[0];
    // Inner joining channels drops deleted conversations. Both the visit and
    // private membership must belong to this teammate; standups are separate.
    expect(query).toContain('inner join "chat_channels"');
    expect(query).toContain('"channel_reads"."user_id" = $2');
    expect(query).toContain('from "project_people"');
    expect(query).toContain('"project_people"."project_id" = "chat_channels"."project_id"');
    expect(query).toContain('"chat_channel_members"."user_id" =');
    expect(params).toEqual(expect.arrayContaining(["teammate", "general", "project", "direct", "custom", "standup"]));
    expect(query).toMatch(/order by "channel_reads"\."updated_at" desc, "chat_channels"\."id" asc limit/);
  });
});

// A false acknowledgement can make a sender assume a teammate has seen work.
it("adds confirmed readers only through their saved cursor, with current membership enforced", async () => {
  const first = "019a84a1-0000-7000-8000-000000000001";
  const second = "019a84a1-0000-7000-8000-000000000002";
  const third = "019a84a1-0000-7000-8000-000000000003";
  mocks.execute.mockImplementation(async (query: string) => {
    if (query.includes('from "channel_reads"')) return { rows: [
      ["alex", "Alex", first], ["sam", "Sam", third],
    ] };
    if (query.includes('from "chat_messages"')) return { rows: [
      [third, "me", "Sender", null, "New reply", null, "sent", "2026-11-11 12:02:00", null],
      [second, "alex", "Alex", null, "Incoming", null, "sent", "2026-11-11 12:01:00", null],
      [first, "me", "Sender", null, "First reply", null, "sent", "2026-11-11 12:00:00", null],
    ] };
    return { rows: [] };
  });
  const messages = await getRecentMessages("private-channel", "me");
  expect(messages.map(message => message.seenBy)).toEqual([
    [{ id: "alex", name: "Alex" }, { id: "sam", name: "Sam" }],
    [],
    [{ id: "sam", name: "Sam" }],
  ]);
  expect(mocks.requireChannelAccess).toHaveBeenCalledWith("private-channel", "me");
  const [query, params] = mocks.execute.mock.calls.find(([query]) => query.includes('from "channel_reads"'))!;
  // pg-proxy cannot enforce joins: this guards the privacy predicate only.
  expect(query).toContain('"channel_reads"."channel_id" =');
  expect(query).toContain('"channel_reads"."user_id" <>');
  expect(query).toContain('"user"."is_active" =');
  expect(query).toContain('from "project_people"');
  expect(query).toContain('project_chat_person.id = "channel_reads"."user_id"');
  expect(query).toContain('"chat_channel_members"."user_id" = "channel_reads"."user_id"');
  expect(params).toEqual(expect.arrayContaining(["private-channel", "me", true, first, "project", "direct", "custom", "standup"]));
});
