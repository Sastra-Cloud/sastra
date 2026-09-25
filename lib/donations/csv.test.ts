import { describe, expect, it } from "vitest";

import {
  donationRowFingerprint,
  findSensitiveDonationHeaders,
  parseCsvRows,
  parseDonationCsv,
  SensitiveDonationColumnsError,
} from "./csv";

describe("donation CSV parsing", () => {
  it("preserves quoted commas and newlines", () => {
    expect(parseCsvRows('Donor,Notes\r\n"Church, Inc.","Line one\nLine two"\r\n')).toEqual([
      ["Donor", "Notes"],
      ["Church, Inc.", "Line one\nLine two"],
    ]);
  });

  it("separates successful donations from failed attempts", () => {
    const parsed = parseDonationCsv(
      [
        "Campaign External Id,Donor,Campaign,Recurring,Amount,Payment,Status,Date/Time,Notes",
        'C-1042,Northstar Foundation,Education,,13742,,Success,2/14/2026 0:00,"Three programs"',
        "C-1042,Example Donor,Education,,26000,card,Failed,4/27/2026 11:11,",
      ].join("\n")
    );
    expect(parsed.rowCount).toBe(2);
    expect(parsed.failedRows).toBe(1);
    expect(parsed.successfulRows).toHaveLength(1);
    expect(parsed.successfulRows[0]).toMatchObject({
      donor: "Northstar Foundation",
      donorKey: "northstar foundation",
      amountCents: 1_374_200,
      donationDate: "2026-02-14",
    });
    expect(parsed.successfulAmount).toBe(13_742);
  });

  it("makes equivalent row formatting idempotent", () => {
    const first = donationRowFingerprint({
      campaignExternalId: "C-1042",
      donor: "Northstar Foundation",
      campaign: "Education",
      recurring: null,
      amountCents: 1_374_200,
      paymentMethod: null,
      sourceStatus: "Success",
      sourceDateTime: "2/14/2026 0:00",
      notes: "Three programs",
    });
    const second = donationRowFingerprint({
      campaignExternalId: "C-1042",
      donor: "  NORTHSTAR   foundation ",
      campaign: "education",
      recurring: "",
      amountCents: 1_374_200,
      paymentMethod: "",
      sourceStatus: "success",
      sourceDateTime: "2/14/2026   0:00",
      notes: "three programs",
    });
    expect(second).toBe(first);
  });

  it("rejects a successful row with no useful date", () => {
    expect(() =>
      parseDonationCsv(
        "Donor,Amount,Status,Date/Time\nExample,100,Success,soon"
      )
    ).toThrow("Row 2 has an invalid date.");
  });

  it("keeps successful refunds as negative ledger adjustments", () => {
    const parsed = parseDonationCsv(
      "Donor,Amount,Status,Date/Time\nExample,-2000,Success,10/31/2025 3:34"
    );
    expect(parsed.successfulRows[0].amountCents).toBe(-200_000);
    expect(parsed.successfulAmount).toBe(-2_000);
  });

  it("rejects payment credentials and sensitive identity columns", () => {
    const csv = [
      "Donor,Amount,Status,Date/Time,Credit Card Number,CVV,Routing Number,SSN",
      "Example,100,Success,10/31/2025 3:34,4111111111111111,123,021000021,000000000",
    ].join("\n");

    expect(findSensitiveDonationHeaders(csv)).toEqual([
      "Credit Card Number",
      "CVV",
      "Routing Number",
      "SSN",
    ]);
    expect(() => parseDonationCsv(csv)).toThrow(SensitiveDonationColumnsError);
  });

  it("allows non-sensitive payment labels used by the giving export", () => {
    const parsed = parseDonationCsv(
      "Donor,Amount,Payment,Status,Date/Time\nExample,100,ACH,Success,10/31/2025 3:34"
    );

    expect(parsed.successfulRows[0].paymentMethod).toBe("ACH");
  });
});
