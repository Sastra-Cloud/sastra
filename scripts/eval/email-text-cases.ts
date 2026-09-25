/**
 * Committed email-text extraction cases for the live eval (`pnpm eval`). These
 * are synthetic/sample printer emails (no private data), so they're safe to
 * commit. Each case's `expected` lists the tiers the model should return; the
 * eval matches by quantity and compares the listed fields only.
 */

export type ExpectedQuote = {
  quantityCps?: number | null;
  unitPrice?: string | null;
  invoiceNumber?: string | null;
  issueDate?: string | null;
  textPages?: number | null;
  deliveryLocation?: string | null;
};

export type EmailTextCase = {
  name: string;
  text: string;
  expected: ExpectedQuote[];
};

export const EMAIL_TEXT_CASES: EmailTextCase[] = [
  {
    name: "three-tier-plain",
    text: `
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
`,
    expected: [
      { quantityCps: 1000, unitPrice: "1.760", textPages: 120, deliveryLocation: "Foshan" },
      { quantityCps: 2000, unitPrice: "1.320" },
      { quantityCps: 3000, unitPrice: "0.980" },
    ],
  },
  {
    name: "forwarded-quoted-tiers",
    text: `
---------- Forwarded message ---------
From: Stone <stone@relianceprinting.com>
Subject: Re: Re: Fundamentals of the Faith

> Fundamentals of the Faith
> Trim size: 210 x 297 mm portrait
> 120 PP text + 4 pp Cover
> Deliver to Foshan
> 1000 cps @ USD 1.76 per cpy.
> 2000 cps @ USD 1.32 per cpy.
> 3000 cps @ USD 0.98 per cpy
`,
    expected: [
      { quantityCps: 1000, unitPrice: "1.760" },
      { quantityCps: 2000, unitPrice: "1.320" },
      { quantityCps: 3000, unitPrice: "0.980" },
    ],
  },
  {
    name: "single-final-invoice",
    text: `
INVOICE No: #26050701
Issued in: 2026/5/7
A Brief Introduction to the Bible   5160   0.690   3,560.40
Deposit                                     -2,070.00
                                    Total:   1,490.40
Trim size: 140 x 210 mm portrait
188 PP text + 4 pp Cover
Deliver to Foshan
Payment term: 60% deposit (USD2070) and 40% (1490.4) balance on approved completion
`,
    expected: [
      {
        quantityCps: 5160,
        unitPrice: "0.690",
        invoiceNumber: "26050701",
        issueDate: "2026-05-07",
        textPages: 188,
        deliveryLocation: "Foshan",
      },
    ],
  },
];
