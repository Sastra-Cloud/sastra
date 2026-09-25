import { describe, expect, it } from "vitest";

import { tokenizeAssistantWikiLinks } from "./assistant-message-content";

describe("tokenizeAssistantWikiLinks", () => {
  it("linkifies exact internal Wiki paths with anchors", () => {
    expect(
      tokenizeAssistantWikiLinks(
        "See How to Create an Index: /wiki/indesign-tutorials/create-an-index#set-up."
      )
    ).toContainEqual({
      type: "wiki-link",
      value: "/wiki/indesign-tutorials/create-an-index#set-up",
    });
  });

  it("leaves external and embedded paths as plain text", () => {
    const content =
      "Do not link https://evil.example/wiki/indesign/create or javascript:/wiki/indesign/create";
    expect(tokenizeAssistantWikiLinks(content)).toEqual([
      { type: "text", value: content },
    ]);
  });
});
