import { describe, expect, it } from "vitest";

import { looksLikePrintProofAttachment } from "./proof-attachment";

describe("looksLikePrintProofAttachment", () => {
  it("recognizes an explicitly named proof PDF", () => {
    expect(
      looksLikePrintProofAttachment({
        fileName: "Discipling revised proof.pdf",
        mimeType: "application/pdf",
        newestBodyText: "Please review the attached file.",
      })
    ).toBe(true);
  });

  it("recognizes a generically named PDF when the current reply delivers a proof", () => {
    expect(
      looksLikePrintProofAttachment({
        fileName: "Discipling-revised-cover.pdf",
        mimeType: "application/pdf",
        newestBodyText:
          "Attached please kindly find the PDF proof of revised cover for approval.",
      })
    ).toBe(true);
  });

  it("does not promote an invoice or quoted proof history", () => {
    expect(
      looksLikePrintProofAttachment({
        fileName: "invoice-3000-copies.pdf",
        mimeType: "application/pdf",
        newestBodyText: "Attached is the invoice for payment approval.",
      })
    ).toBe(false);
    expect(
      looksLikePrintProofAttachment({
        fileName: "book.pdf",
        mimeType: "application/pdf",
        newestBodyText: "Thanks, received. We will reply shortly.",
      })
    ).toBe(false);
  });

  it("never labels non-PDF attachments as proofs", () => {
    expect(
      looksLikePrintProofAttachment({
        fileName: "cover-proof.jpg",
        mimeType: "image/jpeg",
        newestBodyText: "Attached proof for approval.",
      })
    ).toBe(false);
  });
});
