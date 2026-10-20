import { describe, expect, it } from "vitest";

import {
  classifyDonationRow,
  lookalikeDonorKey,
  type DonationDedupeState,
} from "./dedupe";

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

  it("matches lookalikes across export formats with different donor spellings", () => {
    const tracker = state();
    classifyDonationRow(
      tracker,
      {
        rowFingerprint: "giving-platform-row",
        donorKey: "anonymous donor",
        amountCents: 1_450_000,
        donationDate: "2026-06-23",
      },
      "earlier"
    );
    expect(
      classifyDonationRow(
        tracker,
        {
          rowFingerprint: "fund-manager-row",
          donorKey: "anonymous",
          amountCents: 1_450_000,
          donationDate: "2026-06-23",
        },
        "later"
      )
    ).toEqual({ kind: "new", duplicateOfId: "earlier" });
  });

  it("ignores ampersands and the word and in donor names", () => {
    expect(lookalikeDonorKey("jeff kristie example")).toBe(
      lookalikeDonorKey("jeff and kristie example")
    );
    expect(lookalikeDonorKey("anonymous giver")).toBe("anonymous");
    expect(lookalikeDonorKey("anonymous foundation")).toBe("anonymous foundation");
  });
});
