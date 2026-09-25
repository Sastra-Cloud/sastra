import { describe, expect, it } from "vitest";

import {
  EXTRACTION_JSON_SCHEMA,
  fillMouPaymentAmounts,
  gateExtractionFormats,
  normalizeExtraction,
} from "@/lib/imports/schema";
import { groupForCategory } from "@/lib/budget/compute";

function schemaComplexity(value: unknown): {
  properties: number;
  optional: number;
  unions: number;
} {
  if (!value || typeof value !== "object") {
    return { properties: 0, optional: 0, unions: 0 };
  }
  const node = value as Record<string, unknown>;
  let properties = 0;
  let optional = 0;
  let unions = Array.isArray(node.type) || Array.isArray(node.anyOf) ? 1 : 0;
  if (node.type === "object" && node.properties) {
    const fields = node.properties as Record<string, unknown>;
    const required = new Set(
      Array.isArray(node.required)
        ? node.required.filter((field): field is string => typeof field === "string")
        : []
    );
    properties += Object.keys(fields).length;
    optional += Object.keys(fields).filter((field) => !required.has(field)).length;
  }
  for (const child of Object.values(node)) {
    if (!child || typeof child !== "object") continue;
    const nested = schemaComplexity(child);
    properties += nested.properties;
    optional += nested.optional;
    unions += nested.unions;
  }
  return { properties, optional, unions };
}

describe("EXTRACTION_JSON_SCHEMA", () => {
  it("keeps Anthropic's compiled grammar free of optional and union parameters", () => {
    const complexity = schemaComplexity(EXTRACTION_JSON_SCHEMA);
    expect(complexity.properties).toBeGreaterThan(0);
    expect(complexity.optional).toBe(0);
    expect(complexity.unions).toBe(0);
  });
});

describe("normalizeExtraction", () => {
  it("normalizes an outgoing invoice for reviewed receipt matching", () => {
    const out = normalizeExtraction({
      documentKind: "invoice",
      invoice: {
        direction: "outgoing",
        invoiceNumber: "00281",
        issueDate: "10/06/2025",
        dueDate: "",
        issuerName: "Workspace Publisher",
        recipientName: "Funding Partner",
        recipientEmail: "finance@example.org",
        projectTitle: "The Parables of Jesus",
        amount: "$12,840",
        currency: "usd",
        description: "Translation and printing",
      },
      agreementType: "mou_only",
      projects: [{ title: "The Parables of Jesus" }],
    });

    expect(out.documentKind).toBe("invoice");
    expect(out.invoice).toMatchObject({
      direction: "outgoing",
      invoiceNumber: "00281",
      issueDate: "2025-10-06",
      dueDate: null,
      amount: 12840,
      currency: "USD",
    });
  });

  it("keeps legacy agreement imports compatible", () => {
    const out = normalizeExtraction({
      agreementType: "mou_only",
      projects: [{ title: "Existing agreement" }],
    });
    expect(out.documentKind).toBe("agreement");
    expect(out.invoice).toBeNull();
  });

  it("coerces numeric strings (with $, commas) into numbers", () => {
    const out = normalizeExtraction({
      agreementType: "mou_only",
      agreementTotalAmount: "20,702",
      paymentProjectIndex: "0",
      mouPaymentSchedule: [
        {
          trigger: "on_signing",
          amount: "10,351",
          dueDate: "",
          notes: "First payment",
        },
      ],
      projects: [
        {
          title: "X",
          wordCount: "59000",
          maxCopies: "3,000",
          completeWithinMonths: "12",
          licenseTermMonths: "60",
          renewalMonths: "12",
          renewalNoticeDays: "60",
          totalAmount: "6,202",
          episodeCount: "50",
          budgetLines: [
            { label: "Editing", category: "editing", unit: "words", quantity: "59,000", unitPrice: "$0.03", amount: "1,770" },
          ],
        },
      ],
    });
    expect(out.agreementTotalAmount).toBe(20702);
    expect(out.paymentProjectIndex).toBe(0);
    expect(out.mouPaymentSchedule[0].amount).toBe(10351);
    expect(out.projects[0].wordCount).toBe(59000);
    expect(out.projects[0]).toMatchObject({
      maxCopies: 3000,
      completeWithinMonths: 12,
      licenseTermMonths: 60,
      renewalMonths: 12,
      renewalNoticeDays: 60,
      totalAmount: 6202,
      episodeCount: 50,
    });
    const line = out.projects[0].budgetLines[0];
    expect(line.quantity).toBe(59000);
    expect(line.unitPrice).toBe(0.03);
    expect(line.amount).toBe(1770);
  });

  it("maps unknown category → custom and unknown unit → flat", () => {
    const out = normalizeExtraction({
      agreementType: "mou_only",
      projects: [
        {
          title: "X",
          budgetLines: [
            { label: "Misc", category: "marketing", unit: "each", quantity: null, unitPrice: null, amount: 500 },
          ],
        },
      ],
    });
    expect(out.projects[0].budgetLines[0].category).toBe("custom");
    expect(out.projects[0].budgetLines[0].unit).toBe("flat");
  });

  it("preserves a stated total when extracted quantity arithmetic conflicts", () => {
    const out = normalizeExtraction({
      agreementType: "mou_only",
      projects: [
        {
          title: "X",
          budgetLines: [
            {
              label: "Print/Ship 3000 softcover books",
              category: "print_ship",
              unit: "pages",
              quantity: 27,
              unitPrice: 1650,
              amount: 1650,
            },
          ],
        },
      ],
    });

    expect(out.projects[0].budgetLines[0]).toMatchObject({
      unit: "flat",
      quantity: 1,
      unitPrice: 1650,
      amount: 1650,
    });
    expect(out.projects[0].budgetLines[0].notes).toContain(
      "stated total was preserved as a flat amount"
    );
  });

  it("keeps consistent extracted quantity arithmetic intact", () => {
    const out = normalizeExtraction({
      agreementType: "mou_only",
      projects: [
        {
          title: "X",
          budgetLines: [
            {
              label: "Editing",
              category: "editing",
              unit: "words",
              quantity: 59000,
              unitPrice: 0.03,
              amount: 1770,
            },
          ],
        },
      ],
    });

    expect(out.projects[0].budgetLines[0]).toMatchObject({
      unit: "words",
      quantity: 59000,
      unitPrice: 0.03,
      amount: 1770,
      notes: null,
    });
  });

  it("represents an extracted total without a rate as one flat amount", () => {
    const out = normalizeExtraction({
      agreementType: "mou_only",
      projects: [
        {
          title: "X",
          budgetLines: [
            {
              label: "Printing",
              category: "print_ship",
              unit: "pages",
              quantity: null,
              unitPrice: null,
              amount: 1650,
            },
          ],
        },
      ],
    });

    expect(out.projects[0].budgetLines[0]).toMatchObject({
      unit: "flat",
      quantity: 1,
      unitPrice: 1650,
      amount: 1650,
      notes: null,
    });
  });

  it("treats empty strings / missing as null", () => {
    const out = normalizeExtraction({
      agreementType: "mou_only",
      partnerOrg: "",
      contactEmail: null,
      projects: [{ title: "X", description: "", territory: undefined }],
    });
    expect(out.partnerOrg).toBeNull();
    expect(out.contactEmail).toBeNull();
    expect(out.projects[0].description).toBeNull();
    expect(out.projects[0].territory).toBeNull();
  });

  it("normalizes free-text dates to yyyy-mm-dd without timezone drift", () => {
    const out = normalizeExtraction({
      agreementType: "mou_only",
      signedDate: "April 1, 2025",
      projects: [
        { title: "X", startDate: "2025-04-01", publicationDate: "not a date" },
      ],
    });
    expect(out.signedDate).toBe("2025-04-01");
    expect(out.projects[0].startDate).toBe("2025-04-01");
    expect(out.projects[0].publicationDate).toBeNull();
  });

  it("defaults formats to false and respects true", () => {
    const out = normalizeExtraction({
      agreementType: "mou_only",
      projects: [{ title: "X", formats: { print: true } }],
    });
    expect(out.projects[0].formats).toEqual({
      print: true,
      ebook: false,
      audio: false,
      video: false,
    });
  });

  it("falls back to mou_only for an invalid agreement type and rounds ints", () => {
    const out = normalizeExtraction({
      agreementType: "something_else",
      projects: [{ title: "X", maxCopies: 1000.6, wordCount: 58999.4 }],
    });
    expect(out.agreementType).toBe("mou_only");
    expect(out.projects[0].maxCopies).toBe(1001);
    expect(out.projects[0].wordCount).toBe(58999);
  });

  it("defaults projects to an empty array", () => {
    const out = normalizeExtraction({ agreementType: "mou_plus_license" });
    expect(out.projects).toEqual([]);
  });

  it("captures license holder, partner-update date, and computes the due date", () => {
    const out = normalizeExtraction({
      agreementType: "mou_plus_license",
      signedDate: "2025-07-09",
      projects: [
        {
          title: "The Trinity",
          licenseHolder: "Union",
          completeWithinMonths: 18,
          partnerUpdateDate: "2025-12-31",
          publicationDate: "",
        },
      ],
    });
    expect(out.projects[0].licenseHolder).toBe("Union");
    expect(out.projects[0].completeWithinMonths).toBe(18);
    expect(out.projects[0].partnerUpdateDate).toBe("2025-12-31");
    expect(out.projects[0].publicationDate).toBe("2027-01-09"); // signed + 18mo
  });

  it("prefers an explicit publication date over the computed one", () => {
    const out = normalizeExtraction({
      agreementType: "mou_only",
      signedDate: "2025-07-09",
      projects: [{ title: "X", completeWithinMonths: 18, publicationDate: "2026-01-01" }],
    });
    expect(out.projects[0].publicationDate).toBe("2026-01-01");
  });

  it("anchors the due date to the start date when there is no signed date", () => {
    // A license with an Effective Date in startDate but no separate signedDate:
    // "within 18 months of the Effective Date" should compute off startDate.
    const out = normalizeExtraction({
      agreementType: "license_only",
      projects: [
        { title: "X", startDate: "2024-08-08", completeWithinMonths: 18, publicationDate: "" },
      ],
    });
    expect(out.projects[0].publicationDate).toBe("2026-02-08"); // start + 18mo
  });

  it("captures license term, auto-renew, renewal terms, and copyright", () => {
    const out = normalizeExtraction({
      agreementType: "license_only",
      projects: [
        {
          title: "X",
          licenseTermMonths: 60,
          autoRenews: true,
          renewalMonths: 12,
          renewalNoticeDays: 60,
          copyrightHolder: "Crossway",
          copyrightNotice: "© 2003 by Author. Published by Crossway.",
        },
      ],
    });
    const p = out.projects[0];
    expect(p.licenseTermMonths).toBe(60);
    expect(p.autoRenews).toBe(true);
    expect(p.renewalMonths).toBe(12);
    expect(p.renewalNoticeDays).toBe(60);
    expect(p.copyrightHolder).toBe("Crossway");
    expect(p.copyrightNotice).toBe("© 2003 by Author. Published by Crossway.");
  });

  it("parses a podcast license: kind, territory, obligations, episode-milestone payment (Ask Ligonier)", () => {
    const out = normalizeExtraction({
      agreementType: "license_only",
      partnerOrg: "Ligonier Ministries",
      signedDate: "2026-07-09",
      mouPaymentSchedule: [
        { trigger: "on_signing", amount: 5044, dueDate: "2026-07-09", notes: "payment 1 of 2" },
        {
          trigger: "on_52_episodes",
          amount: 5044,
          dueDate: "2027-07-01",
          notes: "payment 2 of 2 after 52 episodes",
        },
      ],
      projects: [
        {
          title: "Ask Ligonier (Khmer)",
          kind: "podcast",
          territory: "Cambodia",
          formats: { audio: true },
          copyrightNotice:
            "© 2026. Ligonier Ministries. All worldwide rights reserved.\nUsed with permission under license.",
          obligations: [
            {
              clauseRef: "2.2",
              kind: "attribution",
              cadence: "per_episode",
              label: "Khmer audio cue every episode",
              text: "Ask Ligonier was originally produced in English by Ligonier Ministries.",
            },
            {
              clauseRef: "2.3",
              kind: "artwork_approval",
              cadence: "per_artwork",
              label: "Ligonier artwork approval",
              text: "give Ligonier final approval of any artwork used for the Work",
            },
            {
              clauseRef: "5",
              kind: "analytics_report",
              cadence: "quarterly",
              label: "Quarterly analytics report",
              text: "furnish quarterly reports about audience analytics and statistics",
            },
          ],
        },
      ],
    });
    const p = out.projects[0];
    expect(p.kind).toBe("podcast");
    expect(p.territory).toBe("Cambodia");
    expect(out.mouPaymentSchedule.map((m) => m.trigger)).toEqual([
      "on_signing",
      "on_52_episodes",
    ]);
    expect(out.mouPaymentSchedule[1].dueDate).toBe("2027-07-01");
    expect(p.obligations).toHaveLength(3);
    expect(p.obligations[0]).toEqual({
      clauseRef: "2.2",
      kind: "attribution",
      cadence: "per_episode",
      firstDueDate: null,
      label: "Khmer audio cue every episode",
      text: "Ask Ligonier was originally produced in English by Ligonier Ministries.",
    });
  });

  it("drops obligations with empty text and defaults invalid kind/cadence", () => {
    const out = normalizeExtraction({
      agreementType: "mou_only",
      projects: [
        {
          title: "X",
          kind: "movie",
          obligations: [
            { clauseRef: "1", kind: "bogus", cadence: "hourly", label: "Real", text: "keep me" },
            { clauseRef: "2", kind: "attribution", cadence: "standing", label: "Empty", text: "" },
          ],
        },
      ],
    });
    expect(out.projects[0].kind).toBeNull(); // invalid kind → null
    expect(out.projects[0].obligations).toHaveLength(1);
    expect(out.projects[0].obligations[0].kind).toBe("other"); // invalid → other
    expect(out.projects[0].obligations[0].cadence).toBe("standing"); // invalid → standing
  });

  it("keeps monthly/annual report cadences (recurring reminders)", () => {
    const out = normalizeExtraction({
      agreementType: "mou_only",
      projects: [
        {
          title: "X",
          obligations: [
            { clauseRef: "5", kind: "analytics_report", cadence: "monthly", label: "Monthly report", text: "monthly stats" },
            { clauseRef: "6", kind: "analytics_report", cadence: "annual", label: "Annual report", text: "annual summary" },
          ],
        },
      ],
    });
    expect(out.projects[0].obligations.map((o) => o.cadence)).toEqual([
      "monthly",
      "annual",
    ]);
    expect(out.projects[0].obligations.map((o) => o.firstDueDate)).toEqual([
      null,
      null,
    ]);
  });

  it("preserves an agreement-stated first report deadline", () => {
    const out = normalizeExtraction({
      agreementType: "license_only",
      projects: [
        {
          title: "X",
          obligations: [
            {
              clauseRef: "7",
              kind: "analytics_report",
              cadence: "annual",
              firstDueDate: "April 17, 2027",
              label: "Annual report",
              text: "Report annually by April 17.",
            },
          ],
        },
      ],
    });

    expect(out.projects[0].obligations[0].firstDueDate).toBe("2027-04-17");
  });

  it("normalizes extracted MoU payment schedule rows", () => {
    const out = normalizeExtraction({
      agreementType: "mou_only",
      mouPaymentSchedule: [
        {
          trigger: "on_completion",
          amount: "$900",
          dueDate: "Feb. 10 2026",
          notes: "payment 2 of 2",
        },
      ],
      projects: [{ title: "X" }],
    });
    expect(out.mouPaymentSchedule).toEqual([
      {
        deliveryRequirements: [],
        sourceClause: null,
        trigger: "on_completion",
        amount: 900,
        dueDate: "2026-02-10",
        notes: "payment 2 of 2",
      },
    ]);
  });

  it("promotes a legacy per-project payment schedule without duplicating it", () => {
    const out = normalizeExtraction({
      agreementType: "mou_only",
      projects: [
        {
          title: "Legacy project",
          totalAmount: 500,
          mouPaymentSchedule: [
            {
              trigger: "on_signing",
              amount: 500,
              dueDate: "2025-01-01",
              notes: "legacy",
            },
          ],
        },
      ],
    });
    expect(out.agreementTotalAmount).toBe(500);
    expect(out.paymentProjectIndex).toBe(0);
    expect(out.mouPaymentSchedule).toHaveLength(1);
  });

  it("normalizes the FY25 Khmer mixed books and podcast agreement", () => {
    const out = normalizeExtraction({
      agreementType: "mou_only",
      partnerOrg: "Desiring God",
      signedDate: "2024-09-02",
      agreementTotalAmount: "20702",
      paymentProjectIndex: "",
      mouPaymentSchedule: [
        {
          trigger: "on_signing",
          amount: "10351",
          dueDate: "2024-09-02",
          notes: "initial payment",
        },
        {
          trigger: "on_completion",
          amount: "10351",
          dueDate: "2025-07-01",
          notes: "final payment after completion; no earlier than July 1, 2025",
        },
      ],
      projects: [
        { title: "Don't Waste Your Life", kind: "book", totalAmount: "6202", completeWithinMonths: "12", rightsGrantedByAgreement: true, nonCommercialOnly: true, formats: { print: true, ebook: true, audio: true, video: true } },
        { title: "When the Darkness Will Not Lift", kind: "book", totalAmount: "1500", completeWithinMonths: "12", rightsGrantedByAgreement: true, nonCommercialOnly: true, formats: { print: true, ebook: true, audio: true } },
        { title: "50 Crucial Questions About Manhood and Womanhood", kind: "book", totalAmount: "3375", completeWithinMonths: "12", rightsGrantedByAgreement: true, nonCommercialOnly: true, formats: { print: true, ebook: true, audio: true } },
        { title: "Ask Pastor John Book Volume 2", kind: "book", totalAmount: "3325", completeWithinMonths: "12", rightsGrantedByAgreement: true, nonCommercialOnly: true, formats: { print: true, ebook: true, audio: true } },
        { title: "50 More APJ episodes", kind: "podcast", episodeCount: "50", episodeCountMode: "additional", totalAmount: "6300", completeWithinMonths: "12", rightsGrantedByAgreement: true, nonCommercialOnly: true, formats: { audio: true } },
      ],
    });

    expect(out.projects).toHaveLength(5);
    expect(out.projects.map((project) => project.kind)).toEqual([
      "book",
      "book",
      "book",
      "book",
      "podcast",
    ]);
    expect(out.projects[4].episodeCount).toBe(50);
    expect(out.projects[4].episodeCountMode).toBe("additional");
    expect(
      out.projects.every(
        (project) => project.publicationDate === "2025-09-02"
      )
    ).toBe(true);
    expect(
      out.projects.reduce(
        (sum, project) => sum + (project.totalAmount ?? 0),
        0
      )
    ).toBe(20702);
    expect(out.mouPaymentSchedule.map((payment) => payment.amount)).toEqual([
      10351,
      10351,
    ]);
    expect(out.paymentProjectIndex).toBeNull();
  });

  it("splits a grant application budget table into one project per line-item", () => {
    // Shape a grant-application/proposal extraction (ACTION Cambodia / Cornerstone):
    // four fundable line-items → four projects, unsigned, sharing the grand total.
    const out = normalizeExtraction({
      documentKind: "agreement",
      agreementType: "mou_only",
      partnerOrg: "Cornerstone Trust",
      signedDate: "", // unsigned proposal — funds not yet awarded
      documentTitle: "ACTION Cambodia Biblical Resource Development",
      agreementTotalAmount: "41910",
      projects: [
        {
          title: "Translate Calvin's Commentary on Colossians",
          kind: "book",
          totalAmount: "14800",
          budgetLines: [
            { label: "Translation (2 years)", category: "translation", unit: "flat", amount: "14800" },
          ],
        },
        {
          title: "Weekly Sastra article",
          kind: "article",
          totalAmount: "6970",
          budgetLines: [
            { label: "Additional weekly article (2 years)", category: "translation", unit: "flat", amount: "6970" },
          ],
        },
        {
          title: "Study guides & course videos",
          kind: "video_series",
          episodeCount: "148",
          totalAmount: "8140",
          budgetLines: [
            { label: "Study guides + course videos", category: "video_series", unit: "flat", amount: "8140" },
          ],
        },
        {
          title: "100 Cambodian testimony videos",
          kind: "video_series",
          episodeCount: "100",
          totalAmount: "12000",
          budgetLines: [
            { label: "Testimony video production", category: "video_series", unit: "flat", amount: "12000" },
          ],
        },
      ],
    });

    expect(out.projects).toHaveLength(4);
    expect(out.projects.map((project) => project.kind)).toEqual([
      "book",
      "article",
      "video_series",
      "video_series",
    ]);
    expect(out.projects.map((project) => project.totalAmount)).toEqual([
      14800, 6970, 8140, 12000,
    ]);
    // Per-project subtotals reconcile against the proposal grand total.
    expect(
      out.projects.reduce((sum, project) => sum + (project.totalAmount ?? 0), 0)
    ).toBe(41910);
    expect(out.agreementTotalAmount).toBe(41910);
    // Unsigned proposal: no signed date carried through.
    expect(out.signedDate).toBeNull();
    // Each line-item keeps its own budget line at the stated cost.
    expect(out.projects[0].budgetLines[0].amount).toBe(14800);
    expect(out.projects[3].episodeCount).toBe(100);
  });

  it("is idempotent — re-normalizing its own output does not throw (getImport round-trip)", () => {
    // getImport() re-runs normalizeExtraction on the STORED extraction every time
    // the review page loads. A normalized agreement stores invoice: null, which
    // must survive a second pass (regression: the review page crashed with a
    // ZodError "invoice: expected object, received null").
    const first = normalizeExtraction({
      documentKind: "agreement",
      agreementType: "mou_only",
      partnerOrg: "Cornerstone Trust",
      projects: [{ title: "Grant work", totalAmount: "41910" }],
    });
    expect(first.invoice).toBeNull();
    expect(() => normalizeExtraction(first)).not.toThrow();
    const second = normalizeExtraction(first);
    expect(second).toEqual(first);
  });

  it("re-normalizes a stored invoice extraction without dropping the invoice", () => {
    const first = normalizeExtraction({
      documentKind: "invoice",
      invoice: {
        direction: "outgoing",
        invoiceNumber: "00281",
        amount: "500",
        currency: "USD",
      },
      projects: [{ title: "Invoice work" }],
    });
    expect(first.invoice?.invoiceNumber).toBe("00281");
    const second = normalizeExtraction(first);
    expect(second.invoice?.invoiceNumber).toBe("00281");
    expect(second).toEqual(first);
  });

  it("splits grouped and agreement-wide fees across the covered titles", () => {
    const storybooks = ["Story A", "Story B", "Story C", "Story D"];
    const activityBooks = ["Activity A", "Activity B", "Activity C", "Activity D"];
    const out = normalizeExtraction({
      agreementType: "license_only",
      agreementTotalAmount: "2000",
      sharedFees: [
        {
          label: "Royalty advance",
          category: "custom",
          amount: "820",
          appliesToTitles: storybooks,
        },
        {
          label: "Storybook artwork",
          category: "cover_design",
          amount: "680",
          appliesToTitles: storybooks,
        },
        {
          label: "Activity-book artwork",
          category: "cover_design",
          amount: "400",
          appliesToTitles: activityBooks,
        },
        {
          label: "Administration fee",
          category: "custom",
          amount: "100",
          appliesToTitles: [],
        },
      ],
      projects: [...storybooks, ...activityBooks].map((title) => ({
        title,
        currency: "GBP",
      })),
    });

    expect(out.projects).toHaveLength(8);
    expect(out.projects[0].budgetLines.map((line) => line.amount)).toEqual([
      205,
      170,
      12.5,
    ]);
    expect(out.projects[0].totalAmount).toBe(387.5);
    expect(out.projects[4].budgetLines.map((line) => line.amount)).toEqual([
      100,
      12.5,
    ]);
    expect(out.projects[4].totalAmount).toBe(112.5);
    expect(
      out.projects.reduce(
        (sum, project) => sum + (project.totalAmount ?? 0),
        0
      )
    ).toBe(2000);
    expect(out.projects.every((project) => project.currency === "GBP")).toBe(true);
  });
});

describe("gateExtractionFormats", () => {
  it("zeroes format rights for a funding MoU with a separate unsecured license, but keeps copies + budget", () => {
    const gated = gateExtractionFormats(
      normalizeExtraction({
        agreementType: "mou_plus_license",
        signedDate: "2025-07-09",
        projects: [
          {
            title: "The Trinity",
            licenseHolder: "Union",
            rightsGrantedByAgreement: false,
            maxCopies: 1000,
            formats: { print: true, ebook: true },
            budgetLines: [
              { label: "Advance royalty fee", category: "custom", unit: "flat", amount: 50 },
            ],
          },
        ],
      })
    );
    expect(gated.projects[0].formats).toEqual({
      print: false,
      ebook: false,
      audio: false,
      video: false,
    });
    expect(gated.projects[0].maxCopies).toBe(1000);
    expect(gated.projects[0].budgetLines).toHaveLength(1);
  });

  it("keeps formats for a public-domain mou_only (no external license needed)", () => {
    const gated = gateExtractionFormats(
      normalizeExtraction({
        agreementType: "mou_only",
        projects: [{ title: "X", licenseHolder: "", rightsGrantedByAgreement: true, formats: { print: true } }],
      })
    );
    expect(gated.projects[0].formats.print).toBe(true);
  });

  it("keeps formats for a signed license_only", () => {
    const gated = gateExtractionFormats(
      normalizeExtraction({
        agreementType: "license_only",
        signedDate: "2025-01-01",
        projects: [{ title: "X", rightsGrantedByAgreement: true, formats: { print: true, ebook: true } }],
      })
    );
    expect(gated.projects[0].formats.print).toBe(true);
  });

  it("keeps formats for a license_only even without a detected signed date", () => {
    // The document IS the license; it grants the formats it names regardless of
    // whether a signature date was parsed out.
    const gated = gateExtractionFormats(
      normalizeExtraction({
        agreementType: "license_only",
        projects: [{ title: "X", rightsGrantedByAgreement: true, formats: { print: true } }],
      })
    );
    expect(gated.projects[0].formats.print).toBe(true);
  });
});

describe("podcast license extraction (episodes, non-commercial, split total)", () => {
  it("keeps episodeCount and nonCommercialOnly", () => {
    const out = normalizeExtraction({
      agreementType: "license_only",
      projects: [
        {
          title: "Ask Ligonier (Khmer)",
          kind: "podcast",
          episodeCount: 104,
          nonCommercialOnly: true,
        },
      ],
    });
    expect(out.projects[0].episodeCount).toBe(104);
    expect(out.projects[0].nonCommercialOnly).toBe(true);
  });

  it("defaults episodeCount null and nonCommercialOnly false when absent", () => {
    const out = normalizeExtraction({
      agreementType: "license_only",
      projects: [{ title: "A book" }],
    });
    expect(out.projects[0].episodeCount).toBeNull();
    expect(out.projects[0].episodeCountMode).toBe("total");
    expect(out.projects[0].nonCommercialOnly).toBe(false);
  });

  it("splits a known total across equal payment tranches", () => {
    const filled = fillMouPaymentAmounts(
      normalizeExtraction({
        agreementType: "license_only",
        agreementTotalAmount: 10088,
        mouPaymentSchedule: [
          { trigger: "on_signing", amount: null, dueDate: "", notes: "1 of 2" },
          { trigger: "on_52_episodes", amount: null, dueDate: "2027-07-01", notes: "2 of 2" },
        ],
        projects: [
          {
            title: "X",
          },
        ],
      })
    );
    expect(filled.mouPaymentSchedule.map((m) => m.amount)).toEqual([
      5044, 5044,
    ]);
  });

  it("does not override tranche amounts the model already provided", () => {
    const filled = fillMouPaymentAmounts(
      normalizeExtraction({
        agreementType: "license_only",
        agreementTotalAmount: 900,
        mouPaymentSchedule: [
          { trigger: "on_signing", amount: 600, dueDate: "", notes: "" },
          { trigger: "on_completion", amount: null, dueDate: "", notes: "" },
        ],
        projects: [
          {
            title: "X",
          },
        ],
      })
    );
    expect(filled.mouPaymentSchedule.map((m) => m.amount)).toEqual([
      600, null,
    ]);
  });
});

describe("groupForCategory", () => {
  it("routes media categories to additional_media", () => {
    expect(groupForCategory("audiobook")).toBe("additional_media");
    expect(groupForCategory("video_series")).toBe("additional_media");
  });
  it("routes everything else to book_publishing", () => {
    expect(groupForCategory("translation")).toBe("book_publishing");
    expect(groupForCategory("print_ship")).toBe("book_publishing");
    expect(groupForCategory("custom")).toBe("book_publishing");
  });
});
