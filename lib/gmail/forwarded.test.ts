import { describe, expect, it } from "vitest";

import { extractForwardedHeaderHints } from "./forwarded";

describe("extractForwardedHeaderHints", () => {
  it("returns no hints for ordinary messages", () => {
    expect(
      extractForwardedHeaderHints({
        subject: "Print quote",
        text: "Please quote 1,000 copies.",
      })
    ).toEqual({
      isForwarded: false,
      emails: [],
      fromEmails: [],
      names: [],
      fromNames: [],
      forwarderNote: null,
      originalDate: null,
    });
  });

  it("separates the teammate note and original date from forwarded content", () => {
    const hints = extractForwardedHeaderHints({
      subject: "Fwd: Setting up a call",
      text: [
        "Please make this a task for next Friday.",
        "",
        "---------- Forwarded message ---------",
        "From: Joshua Larson <joshua@example.org>",
        "Date: Fri, 17 Jul 2026 21:49:00 -0700",
        "Subject: Setting up a Call",
        "To: Bora <bora@example.org>",
        "",
        "Book a time: https://calendar.google.com/example",
      ].join("\n"),
    });

    expect(hints.forwarderNote).toBe(
      "Please make this a task for next Friday."
    );
    expect(hints.originalDate?.toISOString()).toBe("2026-07-18T04:49:00.000Z");
  });

  it("parses Gmail's human-readable forwarded date", () => {
    const hints = extractForwardedHeaderHints({
      subject: "Fwd: Invoice request",
      text: [
        "---------- Forwarded message ---------",
        "From: Partner <partner@example.org>",
        "Date: Tue, Oct 8, 2024 at 4:18\u202fPM",
        "Subject: Invoice request",
        "To: Team <team@example.org>",
      ].join("\n"),
    });

    expect(hints.originalDate?.getFullYear()).toBe(2024);
    expect(hints.originalDate?.getMonth()).toBe(9);
    expect(hints.originalDate?.getDate()).toBe(8);
  });

  it("extracts original forwarded header emails", () => {
    const hints = extractForwardedHeaderHints({
      subject: "Fwd: MoU update",
      text: [
        "---------- Forwarded message ---------",
        "From: Rights Team <rights@example.org>",
        "To: Nathan Wells <nathan@example.org>",
        "Cc: Bora <bora@example.org>",
        "Subject: MoU update",
        "",
        "Thanks.",
      ].join("\n"),
    });

    expect(hints.isForwarded).toBe(true);
    expect(hints.fromEmails).toEqual(["rights@example.org"]);
    expect(hints.emails).toEqual([
      "rights@example.org",
      "nathan@example.org",
      "bora@example.org",
    ]);
    expect(hints.fromNames).toEqual(["Rights Team"]);
  });

  it("keeps forwarded sender names when the address is not visible", () => {
    const hints = extractForwardedHeaderHints({
      subject: "Fwd: Fundamentals of the Faith",
      text: [
        "Forwarded message:",
        "From: Stone",
        "To: Dara Sok",
        "",
        "Would you please confirm the spec as below?",
        "Trim size: 210 x 297 mm portrait",
        "1000 cps @ USD 1.76 per cpy.",
      ].join("\n"),
    });

    expect(hints.isForwarded).toBe(true);
    expect(hints.fromNames).toEqual(["Stone"]);
    expect(hints.names).toEqual(["Stone", "Dara Sok"]);
  });
});
