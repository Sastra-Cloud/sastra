import { describe, expect, it } from "vitest";

import { clipboardImageFiles } from "./clipboard";

function clipboard(
  files: File[],
  items: Array<{ kind: string; type: string; getAsFile: () => File | null }>
) {
  return {
    files: files as unknown as FileList,
    items: items as unknown as DataTransferItemList,
  };
}

function fileItem(file: File) {
  return { kind: "file", type: file.type, getAsFile: () => file };
}

describe("clipboardImageFiles", () => {
  it("leaves ordinary text and non-image files to the browser", () => {
    const document = new File(["text"], "notes.txt", { type: "text/plain" });
    expect(clipboardImageFiles(clipboard([document], [
      { kind: "string", type: "text/plain", getAsFile: () => null },
      fileItem(document),
    ]))).toEqual([]);
  });

  it("preserves multiple images without duplicating their files representation", () => {
    const first = new File(["first"], "image.png", { type: "image/png" });
    const second = new File(["second"], "image.jpg", { type: "image/jpeg" });
    expect(clipboardImageFiles(clipboard([first, second], [
      { kind: "string", type: "text/html", getAsFile: () => null },
      fileItem(first),
      fileItem(second),
    ]))).toEqual([first, second]);
  });

  it("accepts browsers that expose images only as files", () => {
    const image = new File(["image"], "screenshot.png", { type: "image/png" });
    expect(clipboardImageFiles(clipboard([image], []))).toEqual([image]);
  });

  it("falls back to files when an advertised image item is unreadable", () => {
    const image = new File(["image"], "screenshot.webp", { type: "image/webp" });
    expect(clipboardImageFiles(clipboard([image], [
      { kind: "file", type: "image/webp", getAsFile: () => null },
    ]))).toEqual([image]);
    expect(clipboardImageFiles(clipboard([], [
      { kind: "file", type: "image/png", getAsFile: () => null },
    ]))).toEqual([]);
  });
});
