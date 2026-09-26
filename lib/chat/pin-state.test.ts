import { describe, expect, it } from "vitest";

import {
  PIN_EXCERPT_LENGTH,
  applyPinChange,
  pinExcerpt,
  pinnedByLabel,
  pinnedMessagePreview,
  type ChatPinnedMessage,
} from "./pin-state";

function pin(
  messageId: string,
  pinnedAt: string,
  overrides: Partial<ChatPinnedMessage> = {}
): ChatPinnedMessage {
  return {
    messageId,
    authorId: "author",
    authorName: "Sokha",
    authorImage: null,
    excerpt: `Message ${messageId}`,
    attachments: [],
    sentAt: "2026-09-01T00:00:00.000Z",
    pinnedAt,
    pinnedById: "pinner",
    pinnedByName: "Dara",
    inRecentWindow: true,
    ...overrides,
  };
}

describe("applyPinChange", () => {
  const older = pin("a", "2026-09-10T00:00:00.000Z");
  const newer = pin("b", "2026-09-12T00:00:00.000Z");

  it("adds a pin with the newest pin first", () => {
    const newest = pin("c", "2026-09-20T00:00:00.000Z");
    expect(
      applyPinChange([newer, older], { type: "pin", pin: newest }).map(
        (item) => item.messageId
      )
    ).toEqual(["c", "b", "a"]);
  });

  it("keeps the first pin when a message is pinned again", () => {
    const again = pin("a", "2026-09-25T00:00:00.000Z", {
      pinnedByName: "Someone else",
    });
    const pins = [newer, older];
    expect(applyPinChange(pins, { type: "pin", pin: again })).toBe(pins);
  });

  it("removes a pin and ignores unknown messages", () => {
    const pins = [newer, older];
    expect(applyPinChange(pins, { type: "unpin", messageId: "b" })).toEqual([
      older,
    ]);
    expect(applyPinChange(pins, { type: "unpin", messageId: "zzz" })).toBe(
      pins
    );
  });
});

describe("pin copy helpers", () => {
  it("names the pinner, or says you", () => {
    const item = pin("a", "2026-09-10T00:00:00.000Z");
    expect(pinnedByLabel(item, "someone")).toBe("Pinned by Dara");
    expect(pinnedByLabel(item, "pinner")).toBe("Pinned by you");
    expect(
      pinnedByLabel({ pinnedById: null, pinnedByName: null }, "someone")
    ).toBe("Pinned");
  });

  it("describes messages without text", () => {
    expect(
      pinnedMessagePreview({
        excerpt: null,
        attachments: [{ kind: "voice", name: "voice.webm" }],
      })
    ).toBe("Voice message");
    expect(
      pinnedMessagePreview({
        excerpt: null,
        attachments: [
          { kind: "file", name: "cover.pdf" },
          { kind: "file", name: "notes.docx" },
        ],
      })
    ).toBe("cover.pdf and 1 more file");
  });

  it("keeps excerpts short and on one line", () => {
    expect(pinExcerpt("  hello\n\n world ")).toBe("hello world");
    expect(pinExcerpt("   ")).toBeNull();
    const long = pinExcerpt("a".repeat(PIN_EXCERPT_LENGTH + 50));
    expect(long).toHaveLength(PIN_EXCERPT_LENGTH);
    expect(long?.endsWith("…")).toBe(true);
  });
});
