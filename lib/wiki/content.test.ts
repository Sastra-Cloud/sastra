import { describe, expect, it } from "vitest";

import {
  canonicalizeWikiEmbed,
  extractWikiHeadings,
  validateWikiDocument,
} from "./content";

describe("wiki content", () => {
  it("accepts structured tutorial content and extracts searchable text", () => {
    const result = validateWikiDocument({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Prepare files" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Open the guide", marks: [{ type: "link", attrs: { href: "https://example.com/guide" } }] },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain("Prepare files Open the guide");
  });

  it("rejects executable links and unapproved embeds", () => {
    expect(
      validateWikiDocument({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }],
      })
    ).toMatchObject({ ok: false });
    expect(
      validateWikiDocument({
        type: "doc",
        content: [{ type: "externalEmbed", attrs: { provider: "website", externalId: "x", url: "https://example.com" } }],
      })
    ).toMatchObject({ ok: false });
  });

  it("normalizes only supported video providers", () => {
    expect(canonicalizeWikiEmbed("https://youtu.be/dQw4w9WgXcQ")?.provider).toBe("youtube");
    expect(
      canonicalizeWikiEmbed(
        "https://youtu.be/2w-R7xr8cp0?si=9JKnvYpH_qEVqtYl"
      )
    ).toMatchObject({
      provider: "youtube",
      externalId: "2w-R7xr8cp0",
    });
    expect(canonicalizeWikiEmbed("https://vimeo.com/123456")?.externalId).toBe("123456");
    expect(canonicalizeWikiEmbed("https://example.com/video")).toBeNull();
  });

  it("creates stable unique heading anchors", () => {
    expect(
      extractWikiHeadings({
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Next step" }] },
          { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Next step" }] },
        ],
      }).map((heading) => heading.id)
    ).toEqual(["next-step", "next-step-2"]);
  });
});
