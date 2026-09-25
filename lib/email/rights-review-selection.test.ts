import { describe, expect, it } from "vitest";

import {
  collapseSignedAgreementReviews,
  validatedAgreementProjectIds,
} from "./rights-review-selection";

describe("collapseSignedAgreementReviews", () => {
  it("shows one document-level card for project-scoped reviews of the same agreement", () => {
    const reviews = [
      {
        id: "review-a",
        fileId: "agreement-file",
        kind: "signed_agreement" as const,
        status: "ready" as const,
      },
      {
        id: "review-b",
        fileId: "agreement-file",
        kind: "signed_agreement" as const,
        status: "ready" as const,
      },
      {
        id: "review-c",
        fileId: "agreement-file",
        kind: null,
        status: "processing" as const,
      },
    ];

    expect(
      collapseSignedAgreementReviews(reviews).map((review) => review.id)
    ).toEqual(["review-a"]);
  });

  it("keeps project-specific payment reviews separate", () => {
    const reviews = [
      {
        id: "receipt-a",
        fileId: "receipt-file",
        kind: "license_fee_receipt" as const,
        status: "ready" as const,
      },
      {
        id: "receipt-b",
        fileId: "receipt-file",
        kind: "license_fee_receipt" as const,
        status: "ready" as const,
      },
    ];

    expect(collapseSignedAgreementReviews(reviews)).toEqual(reviews);
  });
});

describe("validatedAgreementProjectIds", () => {
  it("deduplicates linked targets", () => {
    expect(
      validatedAgreementProjectIds(["a", "a", "b"], ["a", "b", "c"])
    ).toEqual(["a", "b"]);
  });

  it("rejects empty or unlinked targets", () => {
    expect(validatedAgreementProjectIds([], ["a"])).toBeNull();
    expect(validatedAgreementProjectIds(["a", "outside"], ["a", "b"])).toBeNull();
  });
});
