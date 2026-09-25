import { describe, expect, it } from "vitest";

import {
  extractLatestProofUrl,
  parsePrinterQuoteText,
  parsePrinterQuoteTextVariants,
  resolveFinalPrintPaymentAmount,
} from "@/lib/print/parser";

const finalInvoice = `
INVOICE No: #26050701
Issued in: 2026/5/7
Job Description                    ISBN                    Po No.       Qty (cps)        Unite Price (USD) Total Amount (USD)
A Brief Introduction to the Bible                                                   5160                  0.690             3,560.40
Deposit                                                                                                                    -2,070.00
                                                                                                                 Total:     1,490.40
Spec:
A Brief Introduction to the Bible
Trim size: 140 x 210 mm portrait
188 PP text + 4 pp Cover
Text: Print 1/1 on 80 gsm WHITE uncoated woodfree
Cover: Print 4c/0c on 250 gsm art paper plus scuff free matte lamination.
Binding Smyth sewn paper back
Deliver to Foshan
Payment term: 60% deposit (USD2070) and 40% (1490.4) balance on approved completion
`;

describe("parsePrinterQuoteText", () => {
  it("extracts invoice, quantity, price, specs, and payment terms", () => {
    const parsed = parsePrinterQuoteText(finalInvoice);
    expect(parsed.kind).toBe("final_invoice");
    expect(parsed.invoiceNumber).toBe("26050701");
    expect(parsed.issueDate).toBe("2026-05-07");
    expect(parsed.title).toBe("A Brief Introduction to the Bible");
    expect(parsed.quantityCps).toBe(5160);
    expect(parsed.unitPrice).toBe("0.690");
    expect(parsed.totalAmount).toBe("3560.40");
    expect(parsed.depositAmount).toBe("2070.00");
    expect(parsed.balanceAmount).toBe("1490.40");
    expect(parsed.trimWidthMm).toBe("140.00");
    expect(parsed.trimHeightMm).toBe("210.00");
    expect(parsed.textPages).toBe(188);
    expect(parsed.coverPages).toBe(4);
    expect(parsed.deliveryLocation).toBe("Foshan");
  });

  it("derives the remaining balance from a deposit invoice's grand total", () => {
    const parsed = parsePrinterQuoteText(`
INVOICE No: #26081401R1
Issued in: 2026/8/14
Job Description ISBN Po No. Qty (cps) Unite Price (USD) Total Amount (USD)
The Worship Ministry Guidebook 1000 1.780 1,780.00
Total: 1,780.00
Payment term: 60% deposit (USD 1068) and 40% balance on approved completion
`);

    expect(parsed.kind).toBe("deposit_invoice");
    expect(parsed.totalAmount).toBe("1780.00");
    expect(parsed.depositAmount).toBe("1068.00");
    expect(parsed.balanceAmount).toBe("712.00");
  });

  it("never uses a staged grand total as the final payment", () => {
    expect(
      resolveFinalPrintPaymentAmount({
        totalAmount: "1780.00",
        depositAmount: "1068.00",
        balanceAmount: null,
      })
    ).toBe("712.00");
    expect(
      resolveFinalPrintPaymentAmount({
        totalAmount: "1780.00",
        depositAmount: "1068.00",
        balanceAmount: "1780.00",
      })
    ).toBe("712.00");
  });

  it("finds the latest proof link", () => {
    expect(
      extractLatestProofUrl(
        "first https://we.tl/t/old then latest https://we.tl/t/EEvRHbJVnPgxDnT6"
      )
    ).toBe("https://we.tl/t/EEvRHbJVnPgxDnT6");
  });

  it("extracts copied printer email quantity tiers", () => {
    const parsed = parsePrinterQuoteTextVariants(`
Fundamentals of the Faith
Trim size: 210 x 297 mm portrait
120 PP text + 4 pp Cover
Text: Print 1/1 on 80 gsm WHITE uncoated woodfree
Cover: Print 4c/0c on 250 gsm art paper plus scuff free matte lamination.
Binding Smyth sewn paper back
Deliver to Foshan
1000 cps @ USD 1.76 per cpy.
2000 cps @ USD 1.32 per cpy.
3000 cps @ USD 0.98 per cpy
`);

    expect(parsed).toHaveLength(3);
    expect(parsed.map((quote) => quote.quantityCps)).toEqual([1000, 2000, 3000]);
    expect(parsed.map((quote) => quote.unitPrice)).toEqual([
      "1.760",
      "1.320",
      "0.980",
    ]);
    expect(parsed.map((quote) => quote.totalAmount)).toEqual([
      "1760.00",
      "2640.00",
      "2940.00",
    ]);
    expect(parsed[0].textPages).toBe(120);
    expect(parsed[0].trimWidthMm).toBe("210.00");
    expect(parsed[0].deliveryLocation).toBe("Foshan");
  });

  it("reads a per-copy price smushed against the unit (e.g. 0.61per cpy)", () => {
    // Real-world Reliance Printing wording where a tier's price had no space
    // before "per". The regex must still recover 0.61 so the AI backfill has a
    // value to fill from when the model drops it.
    const parsed = parsePrinterQuoteTextVariants(`
Discipling
160 PP text + 4 pp Cover
Deliver to Foshan
2000 cps @ USD 0.76 per cpy
3000 cps @ USD 0.61per cpy
4000 cps @ USD 0.55 per copy
5000 cps @ USD 0.5 per cpy.
`);

    const quantities = parsed.map((quote) => quote.quantityCps);
    for (const q of [2000, 3000, 4000, 5000]) expect(quantities).toContain(q);
    // The smushed 3,000 tier keeps its price rather than dropping to null.
    const tier3000 = parsed.find((quote) => quote.quantityCps === 3000);
    expect(tier3000?.unitPrice).toBe("0.610");
    expect(tier3000?.totalAmount).toBe("1830.00");
  });

  it("extracts tiers and specs from quoted forwarded email text", () => {
    const parsed = parsePrinterQuoteTextVariants(`
---------- Forwarded message ---------
From: Stone <stone@relianceprinting.com>
Subject: Re: Re: Fundamentals of the Faith

> Fundamentals of the Faith
> Trim size: 210 x 297 mm portrait
> 120 PP text + 4 pp Cover
> Text: Print 1/1 on 80 gsm WHITE uncoated woodfree
> Cover: Print 4c/0c on 250 gsm art paper plus scuff free matte lamination.
> Binding Smyth sewn paper back
> Deliver to Foshan
> 1000 cps @ USD 1.76 per cpy.
> 2000 cps @ USD 1.32 per cpy.
> 3000 cps @ USD 0.98 per cpy
`);

    expect(parsed).toHaveLength(3);
    expect(parsed.map((quote) => quote.quantityCps)).toEqual([1000, 2000, 3000]);
    expect(parsed[0].textPages).toBe(120);
    expect(parsed[0].coverPages).toBe(4);
    expect(parsed[0].textSpec).toBe(
      "Print 1/1 on 80 gsm WHITE uncoated woodfree"
    );
    expect(parsed[0].coverSpec).toBe(
      "Print 4c/0c on 250 gsm art paper plus scuff free matte lamination."
    );
    expect(parsed[0].binding).toBe("Smyth sewn paper back");
    expect(parsed[0].deliveryLocation).toBe("Foshan");
  });

  it("extracts legacy quote specs with units on both trim dimensions", () => {
    const [parsed] = parsePrinterQuoteTextVariants(`
Hope Out Loud
Size: 148 mm x 210mm, 208 PP
Color: Cover:4/0,Inside:32 pp 4/4+ 176pp K/K
Paper: Cover: Glossy-
260g C1S 4C+ Matte lamination/0c on outside
        Inside: Woodfree 80g uncoated woodfree
Finish: Smyth sewn, paper back
Delivery to Foshan Warehouse
25000 cps @ USD 0.57 per cpy.
`);

    expect(parsed.title).toBe("Hope Out Loud");
    expect(parsed.quantityCps).toBe(25_000);
    expect(parsed.unitPrice).toBe("0.570");
    expect(parsed.totalAmount).toBe("14250.00");
    expect(parsed.trimWidthMm).toBe("148.00");
    expect(parsed.trimHeightMm).toBe("210.00");
    expect(parsed.textPages).toBe(208);
    expect(parsed.textSpec).toBe(
      "32 pp 4/4+ 176pp K/K; Woodfree 80g uncoated woodfree"
    );
    expect(parsed.coverSpec).toBe(
      "4/0; Glossy- 260g C1S 4C+ Matte lamination/0c on outside"
    );
    expect(parsed.binding).toBe("Smyth sewn, paper back");
    expect(parsed.deliveryLocation).toBe("Foshan Warehouse");
  });
});
