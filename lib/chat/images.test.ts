import { describe, expect, it } from "vitest";

import type { Attachment } from "@/lib/files/queries";
import { chatMessageImages } from "./images";

function attachment(id: string, mimeType: string, name = "image.png"): Attachment {
  return {
    attachmentId: `attachment-${id}`,
    fileId: id,
    originalName: name,
    mimeType,
    sizeBytes: 1234,
    label: null,
    notes: null,
  };
}

describe("chatMessageImages", () => {
  it("builds one message gallery in attachment order without documents or audio", () => {
    const images = chatMessageImages([
      attachment("document", "application/pdf", "proof.pdf"),
      attachment("first", "image/png"),
      attachment("voice", "audio/webm", "recording.webm"),
      attachment("second", "image/jpeg"),
    ]);

    expect(images.map((image) => image.fileId)).toEqual(["first", "second"]);
    expect(images[1]).toEqual({
      attachmentId: "attachment-second",
      fileId: "second",
      name: "image.png",
      sizeBytes: 1234,
      src: "/api/files/second/download?inline=1",
      downloadUrl: "/api/files/second/download",
    });
  });

  it("keeps repeated files and filenames as distinct attachment positions", () => {
    const first = attachment("shared", "image/png");
    const second = { ...first, attachmentId: "another-attachment" };
    const images = chatMessageImages([first, second]);

    expect(images).toHaveLength(2);
    expect(images.map((image) => image.attachmentId)).toEqual([
      "attachment-shared", "another-attachment",
    ]);
  });

  it("leaves messages without images out of the viewer", () => {
    expect(chatMessageImages([])).toEqual([]);
    expect(chatMessageImages([attachment("document", "application/pdf")])).toEqual([]);
  });
});
