import { describe, expect, it } from "vitest";
import { reconcileReactionMessages } from "./reaction-state";
import type { ChatMessageView } from "./queries";
import data from "@emoji-mart/data";
import type { EmojiMartData } from "@emoji-mart/data";
const message = (id: string, count: number, content = "Message") => ({ id, content, reactions: [{ emoji: "👍", count, mine: count === 2 }] }) as ChatMessageView;
describe("reaction reconciliation", () => {
  it("preserves every picker skin tone and joined sequence within the server's length limit", () => {
    const longest = Math.max(...Object.values((data as unknown as EmojiMartData).emojis).flatMap(emoji => emoji.skins.map(skin => skin.native.length)));
    expect(longest).toBeLessThanOrEqual(16);
  });
  it("keeps pending reactions while accepting fresh content and canonical counts elsewhere", () => {
    const result = reconcileReactionMessages([message("pending", 2), message("settled", 1)],
      [message("pending", 1, "Updated content"), message("settled", 3)], new Set(["pending"]));
    expect(result[0].content).toBe("Updated content");
    expect(result[0].reactions[0].count).toBe(2);
    expect(result[1].reactions[0].count).toBe(3);
  });
  it("accepts settled counts and never resurrects a deleted message", () => {
    const result = reconcileReactionMessages([message("gone", 2), message("saved", 2)], [message("saved", 4)], new Set(["gone"]));
    expect(result.map(row => row.id)).toEqual(["saved"]);
    expect(result[0].reactions[0].count).toBe(4);
  });
});
