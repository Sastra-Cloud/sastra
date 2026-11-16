import { describe, expect, it } from "vitest";

import { channelIdFromPathname } from "@/lib/chat/navigation";

describe("chat navigation", () => {
  it("derives the active conversation from a chat pathname", () => {
    expect(channelIdFromPathname("/chat")).toBeNull();
    expect(channelIdFromPathname("/chat/channel-123")).toBe("channel-123");
    expect(channelIdFromPathname("/chat/channel%20123")).toBe("channel 123");
    expect(channelIdFromPathname("/chat/channel-123/members")).toBeNull();
    expect(channelIdFromPathname("/projects/project/chat")).toBeNull();
    expect(channelIdFromPathname("/chat/%E0%A4%A")).toBeNull();
  });
});
