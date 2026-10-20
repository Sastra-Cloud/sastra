import { describe, expect, it } from "vitest";
import { DEFAULT_REACTIONS, reactionSuggestions } from "./reaction-suggestions";

describe("personal reaction suggestions", () => {
  it("starts with a useful default list, including praying hands in quick reactions", () => {
    expect(reactionSuggestions([])).toEqual(DEFAULT_REACTIONS);
    expect(reactionSuggestions([]).slice(0, 5)).toContain("🙏");
  });
  it("keeps frequency order and fills unused slots with defaults", () => {
    expect(reactionSuggestions(["🔥", "🙏", "💯"]).slice(0, 6)).toEqual(["🔥", "🙏", "💯", "👍", "❤️", "😂"]);
  });
  it("keeps the preferred skin tone without filling the row with variants", () => {
    expect(reactionSuggestions(["🙏🏽", "🙏", "👍🏿", "👍", "❤", "❤️"])).toEqual(["🙏🏽", "👍🏿", "❤", "😂", "🎉", "✅", "👀", "🙌"]);
  });
  it("bounds the list and preserves joined emoji", () => {
    const frequent = ["👨‍👩‍👧‍👦", "🔥", "💯", "👋", "💪", "🤔", "🥳", "💡", "✨"];
    expect(reactionSuggestions(frequent)).toEqual(frequent.slice(0, 8));
    expect(reactionSuggestions(["", "x".repeat(17)])).toEqual(DEFAULT_REACTIONS);
  });
});
