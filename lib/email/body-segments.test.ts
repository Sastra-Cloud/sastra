import { describe, expect, it } from "vitest";

import {
  emailAnalysisText,
  emailHtmlToText,
  segmentEmailBody,
} from "./body-segments";

describe("email body segmentation", () => {
  it("separates a Gmail-style reply from quoted history", () => {
    const body =
      "The proof looks good. Please proceed.\n\nOn Tue, Jul 21, 2026 at 9:14 AM Dara <dara@example.com> wrote:\n> Can you approve the proof?";
    expect(segmentEmailBody({ text: body })).toEqual({
      visibleText: "The proof looks good. Please proceed.",
      historyText:
        "On Tue, Jul 21, 2026 at 9:14 AM Dara <dara@example.com> wrote:\n> Can you approve the proof?",
      historyKind: "quoted",
      isForwarded: false,
    });
    expect(emailAnalysisText({ text: body })).toBe(
      "The proof looks good. Please proceed."
    );
  });

  it("recognizes a wrapped On … wrote marker", () => {
    const body =
      "Thanks.\n\nOn Tue, Jul 21, 2026 at 9:14 AM Dara\n<dara@example.com> wrote:\n> Older text";
    expect(segmentEmailBody({ text: body }).visibleText).toBe("Thanks.");
  });

  it("keeps a deliberate forwarded history in AI input", () => {
    const body =
      "Please make a task for this.\n\n---------- Forwarded message ---------\nFrom: Printer <quotes@printer.test>\nSubject: Quote\n\n1,000 copies: $2,400";
    const segments = segmentEmailBody({ subject: "Fwd: Quote", text: body });
    expect(segments.visibleText).toBe("Please make a task for this.");
    expect(segments.historyKind).toBe("forwarded");
    expect(emailAnalysisText({ subject: "Fwd: Quote", text: body })).toBe(body);
  });

  it("recognizes an Outlook header block after the current reply", () => {
    const body =
      "Approved.\n\nFrom: Printer <quotes@printer.test>\nSent: Monday, July 20, 2026\nTo: Projects <projects@example.test>\nSubject: RE: Quote\n\nOlder quote";
    const segments = segmentEmailBody({ text: body });
    expect(segments.visibleText).toBe("Approved.");
    expect(segments.historyKind).toBe("quoted");
  });

  it("falls back to readable text for HTML-only mail", () => {
    const html =
      "<style>.x{color:red}</style><p>Hello &amp; welcome</p><blockquote>Old</blockquote>";
    expect(emailHtmlToText(html)).toBe("Hello & welcome\n Old");
    expect(segmentEmailBody({ html })).toEqual({
      visibleText: "Hello & welcome",
      historyText: "Old",
      historyKind: "quoted",
      isForwarded: false,
    });
  });
});
