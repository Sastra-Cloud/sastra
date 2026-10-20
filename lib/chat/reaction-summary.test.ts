import { describe, expect, it } from "vitest";
import { summarizeReactions } from "./reaction-summary";

describe("compact message reaction summaries", () => {
  it("shows three most-used emoji and one total for every reaction", () => {
    const reactions = [
      { emoji: "👍", count: 8, mine: false }, { emoji: "❤️", count: 5, mine: false },
      { emoji: "🙏", count: 3, mine: false }, { emoji: "🎉", count: 2, mine: true },
      { emoji: "👀", count: 1, mine: false },
    ];
    const summary = summarizeReactions(reactions);
    expect(summary.total).toBe(19);
    expect(summary.preview.map(r => r.emoji)).toEqual(["👍", "❤️", "🙏"]);
    expect(summary.hasMine).toBe(true);
    expect(summary.ordered).toHaveLength(5);
    expect(reactions[3].emoji).toBe("🎉");
  });
  it("handles one reaction, joined emoji, and large totals without expanding the preview", () => {
    expect(summarizeReactions([{ emoji: "👨‍👩‍👧‍👦", count: 12345, mine: true }])).toMatchObject({ total: 12345, hasMine: true, preview: [{ emoji: "👨‍👩‍👧‍👦", count: 12345, mine: true }] });
  });
  it("has a stable order for ties and no summary for removed reactions", () => {
    const a = { emoji: "❤️", count: 1, mine: false }, b = { emoji: "👍", count: 1, mine: true };
    expect(summarizeReactions([a, b])).toEqual(summarizeReactions([b, a]));
    expect(summarizeReactions([{ emoji: "👍", count: 0, mine: true }])).toMatchObject({ total: 0, preview: [], hasMine: false });
  });
});
