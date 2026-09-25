import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("ProjectChannelTabs component boundary", () => {
  it("remains a client component because it creates navigation handlers", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "components/chat/project-channel-tabs.tsx"),
      "utf8"
    );

    expect(source.trimStart().startsWith('"use client";')).toBe(true);
  });
});
