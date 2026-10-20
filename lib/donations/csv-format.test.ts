import { describe, expect, it } from "vitest";

import {
  donationCsvHeaderSignature,
  parseDonationAmount,
  parseDonationDate,
  parseDonationTable,
  previewDonationTable,
  readDonationCsv,
  RECEIVED_STATUS,
} from "./csv";
import {
  donationCsvColumnProfiles,
  donationCsvMappingProblems,
  donationValueShape,
  formatNameFromFilename,
  isGivingPlatformExport,
  suggestDonationCsvMapping,
} from "./csv-format";
import { normalizeAiDonationCsvMapping } from "./csv-format-schema";

// Same header layout as a fund-manager "Donation Detail" download; values are invented.
const FUND_MANAGER_CSV = [
  '﻿Fund,Date,"Donor Name","Donor Address","Contact Info",Currency,Amount,"Amount - Fund Segment","Contribution Type","Gift Count","Gift Count - Fund Segment","Donor Comments"',
  '"10001 - Example: Translation Ministry","October 16, 2026","Northstar Foundation","1 Main St Springfield, IL 62701 US","(555) 010-0000\\n ",USD,"$6,094.69","$22,145.44",Offline,,4,"52 videos\\n52 articles "',
  '"10001 - Example: Translation Ministry","October 13, 2026",Anonymous,,,USD,$25.00,"$22,145.44",Online,,4,',
  '"10001 - Example: Translation Ministry","October 13, 2026",Anonymous,,,USD,$25.00,"$22,145.44",Online,,4,',
  '"10001 - Example: Translation Ministry","August 04, 2026","Example Church","2 Oak Ave Denver, CO 80210 US","(555) 010-0001\\n pastor@example.org",USD,"$16,000.75","$22,145.44",Recurring,,4,"For printing"',
].join("\r\n");

describe("donation CSV formats", () => {
  it("suggests the fund-manager columns without guessing aggregate ones", () => {
    const table = readDonationCsv(FUND_MANAGER_CSV);
    const { mapping, missingRequired } = suggestDonationCsvMapping(
      table.headers,
      table.rows
    );

    expect(missingRequired).toEqual([]);
    expect(mapping.columns).toMatchObject({
      date: "Date",
      donor: "Donor Name",
      amount: "Amount",
      status: null,
      currency: "Currency",
      campaign: "Fund",
      paymentMethod: "Contribution Type",
      notes: "Donor Comments",
    });
    expect(isGivingPlatformExport(table.headers)).toBe(false);
    expect(donationCsvMappingProblems(table.headers, mapping)).toEqual([]);
  });

  it("imports every row as received when the export has no status column", () => {
    const table = readDonationCsv(FUND_MANAGER_CSV);
    const { mapping } = suggestDonationCsvMapping(table.headers, table.rows);
    const parsed = parseDonationTable(table, mapping, { currency: "USD" });

    expect(parsed.failedRows).toBe(0);
    expect(parsed.successfulRows).toHaveLength(4);
    expect(parsed.successfulRows[0]).toMatchObject({
      donor: "Northstar Foundation",
      amountCents: 609_469,
      donationDate: "2026-10-16",
      sourceStatus: RECEIVED_STATUS,
      campaign: "10001 - Example: Translation Ministry",
      paymentMethod: "Offline",
    });
    expect(parsed.successfulAmount).toBe(22_145.44);
  });

  it("keeps two identical gifts in one file and matches them again on re-import", () => {
    const table = readDonationCsv(FUND_MANAGER_CSV);
    const { mapping } = suggestDonationCsvMapping(table.headers, table.rows);
    const first = parseDonationTable(table, mapping);
    const second = parseDonationTable(table, mapping);
    const [, anonymousOne, anonymousTwo] = first.successfulRows;

    expect(anonymousOne.rowFingerprint).not.toBe(anonymousTwo.rowFingerprint);
    expect(second.successfulRows.map((row) => row.rowFingerprint)).toEqual(
      first.successfulRows.map((row) => row.rowFingerprint)
    );
  });

  it("refuses rows in another currency", () => {
    const table = readDonationCsv(
      FUND_MANAGER_CSV.replace("Anonymous,,,USD", "Anonymous,,,EUR")
    );
    const { mapping } = suggestDonationCsvMapping(table.headers, table.rows);

    expect(() => parseDonationTable(table, mapping, { currency: "USD" })).toThrow(
      "Row 3 is in EUR. Sastra records donations in USD."
    );
    expect(previewDonationTable(table, mapping, { currency: "USD" }).error).toBe(
      "Row 3 is in EUR. Sastra records donations in USD."
    );
  });

  it("counts only chosen status values as received", () => {
    const table = readDonationCsv(
      [
        "Gift Date,Name,Gift Amount,Payment Status",
        "14/02/2026,Example Donor,100,Completed",
        "15/02/2026,Example Donor,50,Declined",
        "16/02/2026,Other Donor,25,Completed",
      ].join("\n")
    );
    const { mapping } = suggestDonationCsvMapping(table.headers, table.rows);

    expect(mapping.columns.status).toBe("Payment Status");
    expect(mapping.successStatuses).toEqual(["Completed"]);
    expect(mapping.dateOrder).toBe("dmy");
    const preview = previewDonationTable(table, mapping);
    expect(preview).toMatchObject({
      receivedRows: 2,
      failedRows: 1,
      receivedAmount: "125.00",
      numericDates: true,
      error: null,
    });
    expect(preview.sample[0].date).toBe("2026-02-14");
  });

  it("reports missing required columns in plain language", () => {
    const table = readDonationCsv("Reference,Total\nA-1,10");
    const { mapping, missingRequired } = suggestDonationCsvMapping(
      table.headers,
      table.rows
    );

    expect(missingRequired).toEqual(["date", "donor"]);
    expect(donationCsvMappingProblems(table.headers, mapping)).toEqual([
      "Choose the column for Gift date.",
      "Choose the column for Donor.",
    ]);
  });

  it("identifies a header layout regardless of order or case", () => {
    expect(donationCsvHeaderSignature(["Date", "Donor Name", "Amount"])).toBe(
      donationCsvHeaderSignature(["amount", "DONOR NAME", " date "])
    );
    expect(donationCsvHeaderSignature(["Date", "Donor", "Amount"])).not.toBe(
      donationCsvHeaderSignature(["Date", "Donor Name", "Amount"])
    );
  });

  it("names a new format from its file name", () => {
    expect(
      formatNameFromFilename("Donation-Detail-Fund-Manager-Download_2610191345.csv")
    ).toBe("Donation Detail Fund Manager Download");
  });
});

describe("donation values", () => {
  it.each([
    ["October 16, 2026", "2026-10-16"],
    ["Oct 4 2026", "2026-10-04"],
    ["Friday, October 16, 2026", "2026-10-16"],
    ["16 October 2026", "2026-10-16"],
    ["16-Oct-2026", "2026-10-16"],
    ["2026-10-16T09:30:00Z", "2026-10-16"],
    ["2026/10/16", "2026-10-16"],
    ["10/16/2026 3:34", "2026-10-16"],
    ["10/16/26", "2026-10-16"],
  ])("reads %s", (input, expected) => {
    expect(parseDonationDate(input)).toBe(expected);
  });

  it("reads numeric dates in the chosen order and rejects impossible dates", () => {
    expect(parseDonationDate("03/04/2026", "dmy")).toBe("2026-04-03");
    expect(parseDonationDate("03/04/2026", "mdy")).toBe("2026-03-04");
    expect(parseDonationDate("02/30/2026")).toBeNull();
    expect(parseDonationDate("Smarch 3, 2026")).toBeNull();
    expect(parseDonationDate("soon")).toBeNull();
  });

  it.each([
    ["$6,094.69", 6094.69],
    ["13742", 13742],
    ["-2000", -2000],
    ["-$20.00", -20],
    ["$-20.00", -20],
    ["(25.00)", -25],
    ["USD 25", 25],
    ["25.00 USD", 25],
    ["US$1,000", 1000],
    ["1.234,56", 1234.56],
    ["25,5", 25.5],
    ["€ 12", 12],
  ])("reads amount %s", (input, expected) => {
    expect(parseDonationAmount(input)).toBe(expected);
  });

  it.each(["", "abc", "1,2345", "1e5", "12.3.4"])(
    "rejects amount %j",
    (input) => {
      expect(parseDonationAmount(input)).toBeNull();
    }
  );
});

describe("AI column profiles", () => {
  it("masks donor details and shares only short repeated codes", () => {
    const table = readDonationCsv(FUND_MANAGER_CSV);
    const profiles = donationCsvColumnProfiles(table.headers, table.rows);
    const sent = JSON.stringify(profiles);

    expect(sent).not.toContain("Northstar");
    expect(sent).not.toContain("pastor@example.org");
    expect(sent).not.toContain("Springfield");
    expect(sent).not.toContain("010-0000");
    expect(sent).not.toContain("printing");
    expect(profiles.find((item) => item.header === "Contribution Type")?.values)
      .toBeNull(); // three distinct values across four rows is not repeated enough
    expect(profiles.find((item) => item.header === "Currency")?.values).toEqual([
      "USD",
    ]);
    expect(profiles.find((item) => item.header === "Donor Name")?.values).toBeNull();
    expect(profiles.find((item) => item.header === "Date")?.shapes).toContain(
      "October 99, 9999"
    );
  });

  it("keeps month names and currency codes but masks everything else", () => {
    expect(donationValueShape("October 16, 2026")).toBe("October 99, 9999");
    expect(donationValueShape("jordan@example.com")).toBe("aaaaaa@aaaaaaa.aaa");
    expect(donationValueShape("$6,094.69 USD")).toBe("$9,999.99 USD");
  });
});

describe("AI column suggestions", () => {
  const table = readDonationCsv(
    [
      "When,Giver,Gift,Outcome,Total To Date",
      "2026-01-05,Example Donor,100,ok,100",
      "2026-01-06,Other Donor,50,bounced,150",
      "2026-01-07,Third Donor,25,ok,175",
    ].join("\n")
  );

  it("keeps real headers and statuses that occur in the file", () => {
    const result = normalizeAiDonationCsvMapping(table.headers, table.rows, {
      date: "When",
      donor: "Giver",
      amount: "Gift",
      status: "Outcome",
      currency: null,
      campaign: "Fund",
      campaignExternalId: null,
      recurring: null,
      paymentMethod: null,
      notes: null,
      successStatuses: ["ok", "settled"],
      formatName: "  Church giving   export ",
    });

    expect(result?.name).toBe("Church giving export");
    expect(result?.mapping.columns).toMatchObject({
      date: "When",
      donor: "Giver",
      amount: "Gift",
      status: "Outcome",
      campaign: null,
    });
    expect(result?.mapping.successStatuses).toEqual(["ok"]);
    expect(
      previewDonationTable(table, result!.mapping)
    ).toMatchObject({ receivedRows: 2, failedRows: 1, receivedAmount: "125.00" });
  });

  it("refuses to reuse one column for two required fields", () => {
    const result = normalizeAiDonationCsvMapping(table.headers, table.rows, {
      date: "When",
      donor: "Gift",
      amount: "Gift",
      status: null,
      currency: null,
      campaign: null,
      campaignExternalId: null,
      recurring: null,
      paymentMethod: null,
      notes: null,
      successStatuses: [],
      formatName: "",
    });

    expect(result?.mapping.columns.donor).toBe("Gift");
    expect(result?.mapping.columns.amount).toBeNull();
    expect(result?.name).toBeNull();
  });

  it("rejects a malformed reply", () => {
    expect(
      normalizeAiDonationCsvMapping(table.headers, table.rows, { date: 4 })
    ).toBeNull();
  });
});
