import { describe, expect, it } from "vitest";

import { looksLikeEmailRightsDocument } from "./rights-review";

describe("email rights document candidate gate", () => {
  it("accepts signed agreements and payment receipts", () => {
    expect(
      looksLikeEmailRightsDocument({
        subject: "Fwd: Document signed: Khmer audio license",
        bodyText: "Document signing is complete.",
        fileName: "completed-document.pdf",
        mimeType: "application/pdf",
      })
    ).toBe(true);
    expect(
      looksLikeEmailRightsDocument({
        subject: "Fwd: Payment Receipt",
        bodyText: "Your payment with Crossway has been processed.",
        fileName: "receipt.pdf",
        mimeType: "application/pdf",
      })
    ).toBe(true);
  });

  it("rejects ordinary PDFs and non-PDF attachments", () => {
    expect(
      looksLikeEmailRightsDocument({
        subject: "Project update",
        bodyText: "Here is the revised manuscript.",
        fileName: "interior-proof.pdf",
        mimeType: "application/pdf",
      })
    ).toBe(false);
    expect(
      looksLikeEmailRightsDocument({
        subject: "Payment receipt",
        fileName: "receipt.png",
        mimeType: "image/png",
      })
    ).toBe(false);
  });
});
