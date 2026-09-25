import { describe, expect, it } from "vitest";

import {
  buildPrintProofProjectUpdate,
  buildPrintProofTaskSuggestion,
  shouldSuggestProjectUpdateFromProof,
} from "./project-update-suggestion-policy";

describe("buildPrintProofProjectUpdate", () => {
  it("describes a revised cover proof without inventing approval", () => {
    expect(
      buildPrintProofProjectUpdate(
        "Attached please kindly find the PDF proof of revised cover for approval."
      )
    ).toEqual({
      suggestedBody:
        "The printer sent the revised cover proof for approval. It is ready for review.",
      reason:
        "A linked printer email includes an attached cover proof and asks for approval.",
    });
  });

  it("uses a generic proof label when the email gives no subtype", () => {
    expect(buildPrintProofProjectUpdate("Proof attached for approval."))
      .toMatchObject({
        suggestedBody:
          "The printer sent the print proof for approval. It is ready for review.",
      });
  });

  it("requires explicit review or approval language", () => {
    expect(
      shouldSuggestProjectUpdateFromProof("Revised proof attached for approval.")
    ).toBe(true);
    expect(shouldSuggestProjectUpdateFromProof("Proof attached for your files."))
      .toBe(false);
  });

  it("builds an actionable proof-review task without inventing a due date", () => {
    expect(
      buildPrintProofTaskSuggestion({
        bodyText:
          "Attached please kindly find the PDF proof of revised cover for approval.",
        projectTitle: "The Trinity",
        sourceSender: "stone@relianceprinting.com",
        recipientName: "Bora",
      })
    ).toEqual({
      title: "Review revised cover proof and reply to Stone",
      description:
        "Review the attached revised cover proof for The Trinity, then reply to Stone in the email thread.",
      reason:
        "This proof email was sent directly to Bora and asks for approval.",
    });
  });
});
