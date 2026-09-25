import { describe, expect, it } from "vitest";

import { parsedTextQuotes, quoteExtractionText } from "./email-text-quote";

const olderQuote = [
  "From: Dara Sok <dara.sok@example.org>",
  "Date: July 10, 2026",
  "Subject: Re: Discipling",
  "2000 cps @ USD 0.76 per cpy.",
  "4000 cps @ USD 0.55 per cpy.",
].join("\n");

describe("printer email quote source text", () => {
  it("does not refresh old quote tiers from a routine reply's quoted history", () => {
    const body = [
      "Hi Bora,",
      "",
      "We will send the PDF proof of text to you for approval tomorrow.",
      "",
      olderQuote,
    ].join("\n");

    expect(quoteExtractionText(body)).not.toContain("2000 cps");
    expect(parsedTextQuotes(body)).toEqual([]);
  });

  it("extracts a new price in the latest reply without rereading older tiers", () => {
    const body = [
      "The revised price is 3000 cps @ USD 0.61 per cpy.",
      "",
      olderQuote,
    ].join("\n");

    expect(parsedTextQuotes(body).map((quote) => quote.quantityCps)).toEqual([3000]);
  });

  it("preserves the full body for a deliberate forwarded quote", () => {
    const body = ["FYI", "", "---------- Forwarded message ----------", olderQuote].join(
      "\n"
    );

    expect(
      parsedTextQuotes(body, { includeQuotedHistory: true }).map(
        (quote) => quote.quantityCps
      )
    ).toEqual([2000, 4000]);
  });
});
