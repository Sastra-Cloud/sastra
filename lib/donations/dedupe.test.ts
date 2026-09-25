import { describe, expect, it } from "vitest";

import { classifyDonationRow, type DonationDedupeState } from "./dedupe";

function state(): DonationDedupeState {
  return {
    exactFingerprints: new Set(),
    possibleByDonorAmountDate: new Map(),
  };
}

describe("donation import dedupe", () => {
  it("skips an identical row fingerprint", () => {
    const tracker = state();
    const row = {
      rowFingerprint: "same-row",
      donorKey: "example donor",
      amountCents: 10_000,
      donationDate: "2026-06-01",
    };
    expect(classifyDonationRow(tracker, row, "first")).toEqual({
      kind: "new",
      duplicateOfId: null,
    });
    expect(classifyDonationRow(tracker, row, "second")).toEqual({
      kind: "exact_duplicate",
    });
  });

  it("flags a same-day lookalike inside the current CSV", () => {
    const tracker = state();
    const shared = {
      donorKey: "example donor",
      amountCents: 10_000,
      donationDate: "2026-06-01",
    };
    classifyDonationRow(
      tracker,
      { ...shared, rowFingerprint: "first-row" },
      "first"
    );
    expect(
      classifyDonationRow(
        tracker,
        { ...shared, rowFingerprint: "different-row" },
        "second"
      )
    ).toEqual({ kind: "new", duplicateOfId: "first" });
  });
});
