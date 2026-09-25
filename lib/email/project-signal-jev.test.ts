import { describe, expect, it } from "vitest";

import {
  COUNTERPARTY_NONE,
  shouldSkipProjectSignalReview,
} from "./project-signal-jev";

/** A judgment that clearly rules out all three suggestion kinds. */
function clearlyNegative() {
  return {
    newDeliverable: { noul: 0.05 },
    fundingObligation: { noul: 0.02 },
    counterpartyType: { choice: COUNTERPARTY_NONE, confidence: 0.98 },
  };
}

describe("shouldSkipProjectSignalReview", () => {
  it("skips mail that rules out every suggestion kind", () => {
    expect(shouldSkipProjectSignalReview(clearlyNegative())).toBe(true);
  });

  it("reviews when the judgment is missing", () => {
    expect(shouldSkipProjectSignalReview(null)).toBe(false);
    expect(shouldSkipProjectSignalReview(undefined)).toBe(false);
  });

  it("reviews when a new deliverable is possible", () => {
    expect(
      shouldSkipProjectSignalReview({
        ...clearlyNegative(),
        newDeliverable: { noul: 0.3 },
      })
    ).toBe(false);
  });

  it("reviews when a dated funding obligation is possible", () => {
    expect(
      shouldSkipProjectSignalReview({
        ...clearlyNegative(),
        fundingObligation: { noul: 0.42 },
      })
    ).toBe(false);
  });

  it("reviews when any counterparty relationship is indicated", () => {
    for (const relationship of ["rights_holder", "funding_partner", "printer"]) {
      expect(
        shouldSkipProjectSignalReview({
          ...clearlyNegative(),
          counterpartyType: { choice: relationship, confidence: 0.99 },
        })
      ).toBe(false);
    }
  });

  it("reviews when the counterparty answer is unsure", () => {
    expect(
      shouldSkipProjectSignalReview({
        ...clearlyNegative(),
        counterpartyType: { choice: COUNTERPARTY_NONE, confidence: 0.55 },
      })
    ).toBe(false);
  });

  it("reviews when a probability is not a usable number", () => {
    expect(
      shouldSkipProjectSignalReview({
        ...clearlyNegative(),
        newDeliverable: { noul: Number.NaN },
      })
    ).toBe(false);
    expect(
      shouldSkipProjectSignalReview({
        ...clearlyNegative(),
        counterpartyType: {
          choice: COUNTERPARTY_NONE,
          confidence: Number.NaN,
        },
      })
    ).toBe(false);
  });

  it("reviews when an expected answer is absent", () => {
    const partial = { newDeliverable: { noul: 0.01 } } as never;
    expect(shouldSkipProjectSignalReview(partial)).toBe(false);
  });

  it("matches the observed live judgments for real sample mail", () => {
    // Probabilities recorded from jev-1.13.0 on representative mail.
    const newsletter = {
      newDeliverable: { noul: 0.06 },
      fundingObligation: { noul: 0.01 },
      counterpartyType: { choice: COUNTERPARTY_NONE, confidence: 1 },
    };
    const securityAlert = {
      newDeliverable: { noul: 0.01 },
      fundingObligation: { noul: 0.01 },
      counterpartyType: { choice: COUNTERPARTY_NONE, confidence: 1 },
    };
    // A printer quote reads low on "new deliverable" — the counterparty answer
    // is what keeps it in review.
    const printerQuote = {
      newDeliverable: { noul: 0.24 },
      fundingObligation: { noul: 0.02 },
      counterpartyType: { choice: "printer", confidence: 1 },
    };
    const grantDeadline = {
      newDeliverable: { noul: 0.03 },
      fundingObligation: { noul: 0.99 },
      counterpartyType: { choice: "funding_partner", confidence: 1 },
    };
    expect(shouldSkipProjectSignalReview(newsletter)).toBe(true);
    expect(shouldSkipProjectSignalReview(securityAlert)).toBe(true);
    expect(shouldSkipProjectSignalReview(printerQuote)).toBe(false);
    expect(shouldSkipProjectSignalReview(grantDeadline)).toBe(false);
  });
});
