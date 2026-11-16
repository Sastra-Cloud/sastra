import { describe, expect, it } from "vitest";

import { parsedTextQuotes, quoteExtractionText } from "./email-text-quote";
import { reusedQuoteFlag, withQuoteSourceFlag } from "./estimate-intake";

const olderQuote = [
  "From: Dara Sok <dara.sok@example.org>",
  "Date: July 10, 2026",
  "Subject: Re: Discipling",
  "2000 cps @ USD 0.76 per cpy.",
  "4000 cps @ USD 0.55 per cpy.",
].join("\n");

describe("printer email quote source text", () => {
  it("preserves reused planning prices and specifications when AI is unavailable, without mistaking matching specs for permission to reuse prices", () => {
    const note = `The Trinity has the same specs as New Birth, so we can re-use the quote for printing:
The Trinity
Size: 109 × 178 mm (4.3 × 7 in)
Cover pages: 4
Estimated target-language pages: 144 (budget estimate only; final layout pending).
Text paper: Print 1/1 on 80 gsm uncoated woodfree
Cover paper: Print 4c/0c on 250 gsm art paper plus matte lamination
Binding: Smyth sewn paper back
Delivery: Delivery to Foshan Warehouse
1000 cps @ USD 1.36 per cpy, Total USD 1360
2000 cps @ USD 0.86 per cpy, Total USD 1720
3000 cps @ USD 0.72 per cpy, Total USD 2160`;
    const quotes = parsedTextQuotes(note);
    expect(quotes.map(quote => [quote.quantityCps, quote.unitPrice, quote.totalAmount])).toEqual([
      [1000, "1.360", "1360.00"], [2000, "0.860", "1720.00"], [3000, "0.720", "2160.00"],
    ]);
    expect(quotes[0]).toMatchObject({ textPages: 144, coverPages: 4, trimWidthMm: "109.00", trimHeightMm: "178.00",
      textSpec: "Print 1/1 on 80 gsm uncoated woodfree", binding: "Smyth sewn paper back", deliveryLocation: "Foshan Warehouse" });
    expect(quotes[0].coverSpec).toContain("250 gsm");
    const flags = withQuoteSourceFlag([], note);
    expect(flags).toEqual([expect.objectContaining({ kind: "reused_quote", note: expect.stringContaining("New Birth") })]);
    expect(withQuoteSourceFlag(flags, note)).toHaveLength(1);
    expect(reusedQuoteFlag("Use the same specs as New Birth. Please request a new price.")).toBeNull();
    expect(reusedQuoteFlag("Do not reuse the quote. Request a fresh price.")).toBeNull();
    expect(reusedQuoteFlag("1000 copies at USD 1.36", true)).toHaveProperty("kind", "reused_quote");
  });
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
