import { describe, expect, it } from "vitest";

import { quoteHasProductionSpecs, quoteRunSpecPatch } from "./quote-run-specs";

describe("quoteRunSpecPatch", () => {
  it("converts quote millimetres to run inches and carries reviewed specs", () => {
    const quote = {
      trimWidthMm: "148.00",
      trimHeightMm: "210.00",
      textPages: 208,
      coverPages: null,
      textSpec: "32 pp 4/4 + 176 pp K/K; Woodfree 80g uncoated woodfree",
      coverSpec: "4/0; Glossy 260g C1S with matte lamination",
      binding: "Smyth sewn, paper back",
      deliveryLocation: "Foshan Warehouse",
    };

    expect(quoteRunSpecPatch(quote)).toEqual({
      trimWidthIn: "5.83",
      trimHeightIn: "8.27",
      quotedTextPages: 208,
      textPaper: quote.textSpec,
      coverPaper: quote.coverSpec,
      binding: quote.binding,
      deliveryLocation: quote.deliveryLocation,
    });
    expect(quoteHasProductionSpecs(quote)).toBe(true);
  });

  it("does not erase run specs when an accepted quote omits them", () => {
    const quote = {
      trimWidthMm: null,
      trimHeightMm: null,
      textPages: null,
      coverPages: null,
      textSpec: null,
      coverSpec: null,
      binding: null,
      deliveryLocation: null,
    };

    expect(quoteRunSpecPatch(quote)).toEqual({});
    expect(quoteHasProductionSpecs(quote)).toBe(false);
  });
});
