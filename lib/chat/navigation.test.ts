import fs from "node:fs";
import path from "node:path";
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

  it("keeps the conversation list outside the dynamic channel boundary", () => {
    const repositoryRoot = process.cwd();
    const layout = fs.readFileSync(
      path.join(repositoryRoot, "app/(app)/chat/layout.tsx"),
      "utf8"
    );
    const channelPage = fs.readFileSync(
      path.join(repositoryRoot, "app/(app)/chat/[channelId]/page.tsx"),
      "utf8"
    );

    expect(layout).toContain("ChatWorkspaceShell");
    expect(channelPage).not.toContain("ChannelList");
    expect(
      fs.existsSync(
        path.join(repositoryRoot, "app/(app)/chat/[channelId]/loading.tsx")
      )
    ).toBe(false);
  });
});
