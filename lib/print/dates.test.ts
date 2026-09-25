import { describe, expect, it } from "vitest";

import { parseFlexibleDate } from "./dates";

describe("parseFlexibleDate", () => {
  it("parses ISO dates unambiguously", () => {
    expect(parseFlexibleDate("2026-05-26")).toEqual({
      iso: "2026-05-26",
      ambiguous: false,
    });
    expect(parseFlexibleDate("Issued in: 2026/5/7")).toEqual({
      iso: "2026-05-07",
      ambiguous: false,
    });
  });

  it("parses textual day-month-year", () => {
    expect(parseFlexibleDate("26 May 2026").iso).toBe("2026-05-26");
    expect(parseFlexibleDate("7 Jun 2026").iso).toBe("2026-06-07");
    expect(parseFlexibleDate("26 May, 2026").iso).toBe("2026-05-26");
  });

  it("parses textual month-day-year", () => {
    expect(parseFlexibleDate("May 26, 2026").iso).toBe("2026-05-26");
    expect(parseFlexibleDate("September 3 2026").iso).toBe("2026-09-03");
  });

  it("disambiguates numeric dates when one part exceeds 12", () => {
    // 26 can only be a day → day-first, unambiguous
    expect(parseFlexibleDate("26/05/2026")).toEqual({
      iso: "2026-05-26",
      ambiguous: false,
    });
    // 13 in the second slot can only be a day → month-first, unambiguous
    expect(parseFlexibleDate("05/13/2026")).toEqual({
      iso: "2026-05-13",
      ambiguous: false,
    });
  });

  it("prefers day-first and flags genuinely ambiguous numeric dates", () => {
    // 07/05/2026: both ≤ 12 → prefer day-first (5 May), flagged
    expect(parseFlexibleDate("07/05/2026")).toEqual({
      iso: "2026-05-07",
      ambiguous: true,
    });
  });

  it("expands two-digit years", () => {
    expect(parseFlexibleDate("26/05/26").iso).toBe("2026-05-26");
  });

  it("returns null for unparseable input", () => {
    expect(parseFlexibleDate("not a date")).toEqual({ iso: null, ambiguous: false });
    expect(parseFlexibleDate("")).toEqual({ iso: null, ambiguous: false });
    expect(parseFlexibleDate(null)).toEqual({ iso: null, ambiguous: false });
  });

  it("rejects impossible month/day values", () => {
    expect(parseFlexibleDate("2026-13-40").iso).toBe(null);
  });
});
