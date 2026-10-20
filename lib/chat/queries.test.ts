import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(mocks.execute) };
});

import { getLastVisitedChannelId } from "./queries";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue({ rows: [] });
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
    expect(query).toContain('(\"chat_channels\".\"kind\" in ($5, $6) and \"chat_channel_members\".\"user_id\" = $7)');
    expect(params).toEqual([
      "teammate", "teammate", "general", "project", "direct", "custom", "teammate", 1,
    ]);
    expect(query).toContain('order by "channel_reads"."updated_at" desc, "chat_channels"."id" asc limit $8');
  });
});
