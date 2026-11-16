import { describe, expect, it } from "vitest";

import { rankHelpDocs, type HelpDoc } from "./search";

const DOCS: HelpDoc[] = [
  {
    slug: "print",
    title: "Print runs & RFQs",
    category: "Publishing",
    roles: ["manager", "admin"],
    keywords: ["rfq", "quote", "printer", "reprint"],
    order: 70,
    summary: "Set up print runs, send RFQs, parse quotes.",
    body: [
      "How book production works.",
      "",
      "## Setting up a print run",
      "Create an internal record with quantity tiers. Saving does not email anyone.",
      "",
      "## Quotes",
      "Paste quote text or upload an invoice PDF for review.",
    ].join("\n"),
  },
  {
    slug: "standups",
    title: "Standups",
    category: "Communication",
    roles: ["member", "manager", "admin"],
    keywords: ["standup", "digest", "questions", "reorder"],
    order: 90,
    summary: "Async scheduled check-ins and the AI digest.",
    body: [
      "Answer the bot in chat.",
      "",
      "## Configuring standups",
      "Drag questions to reorder how they are asked.",
    ].join("\n"),
  },
];

describe("rankHelpDocs", () => {
  it("returns the most relevant topic and section for a how-to query", () => {
    const hits = rankHelpDocs(DOCS, "how do I set up a print run");
    expect(hits[0].slug).toBe("print");
    expect(hits[0].title).toContain("Setting up a print run");
    expect(hits[0].excerpt).toContain("quantity tiers");
  });

  it("matches on keywords across topics", () => {
    const hits = rankHelpDocs(DOCS, "reorder standup questions");
    expect(hits[0].slug).toBe("standups");
  });

  it("returns nothing when no term matches", () => {
    expect(rankHelpDocs(DOCS, "xyzzy nonexistent")).toEqual([]);
  });
});
