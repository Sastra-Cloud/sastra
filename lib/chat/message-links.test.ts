import { describe, expect, it } from "vitest";
import { firstMessageLink, messageLinkSegments } from "./message-links";

describe("chat web links", () => {
  it("preserves multilingual text, line breaks, punctuation, and balanced URL parentheses", () => {
    const text = "សួស្តី @Alex\nTry https://example.org/wiki/Art_(tool), then www.example.com. ល្អ!";
    const segments = messageLinkSegments(text);
    expect(segments.map(segment => segment.text).join("")).toBe(text);
    expect(segments.filter(segment => segment.type === "link")).toEqual([
      { type: "link", text: "https://example.org/wiki/Art_(tool)", href: "https://example.org/wiki/Art_(tool)" },
      { type: "link", text: "www.example.com", href: "https://www.example.com/" },
    ]);
    expect(firstMessageLink(text)).toBe("https://example.org/wiki/Art_(tool)");
  });

  it("never makes script, file, credential-bearing, or email addresses navigable", () => {
    const text = "javascript:alert(1) data:text/html,test file:///etc/passwd ftp://example.org/a https://user:pass@example.org/ name@example.org";
    expect(messageLinkSegments(text)).toEqual([{ type: "text", text }]);
    expect(firstMessageLink(text)).toBeNull();
  });
});
