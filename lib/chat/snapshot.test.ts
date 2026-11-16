import { describe, expect, it } from "vitest";
import { reuseChatSnapshot } from "./snapshot";

describe("recent chat snapshots", () => {
  it("keeps unchanged polling data from triggering another transcript render", () => {
    const current = [{ id: "message", content: "Hello", reactions: [], attachments: [] }];
    expect(reuseChatSnapshot(current, structuredClone(current))).toBe(current);
  });

  it("accepts changes within an existing message rather than using its ID as freshness", () => {
    const current = [{
      id: "message", content: "Original", editedAt: null as string | null,
      reactions: [{ emoji: "👍", count: 1, mine: false }],
      attachments: [{ id: "file", name: "Draft.pdf" }],
      replyTo: { messageId: "original", preview: "Before" },
    }];
    for (const patch of [
      { content: "Edited", editedAt: "2026-11-04T12:00:00Z" },
      { reactions: [{ emoji: "👍", count: 2, mine: true }] },
      { attachments: [{ id: "file", name: "Final.pdf" }] },
      { replyTo: { messageId: "original", preview: "After" } },
    ]) {
      const incoming = [{ ...current[0], ...patch }];
      expect(reuseChatSnapshot(current, incoming)).toBe(incoming);
    }
    expect(reuseChatSnapshot(current, [])).toEqual([]);
  });
});
