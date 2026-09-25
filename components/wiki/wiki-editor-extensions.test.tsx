import { describe, expect, it, vi } from "vitest";

import { createWikiEditorExtensions } from "./wiki-editor-extensions";

describe("createWikiEditorExtensions", () => {
  it("connects the external embed node to the draft edit handler", () => {
    const onEdit = vi.fn();
    const embedExtension = createWikiEditorExtensions(onEdit).find(
      (extension) => extension.name === "externalEmbed"
    );

    expect(embedExtension?.options.onEdit).toBe(onEdit);
  });
});
