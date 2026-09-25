import { describe, expect, it } from "vitest";

import { helpDocSections, rankHelpDocs, type HelpDoc } from "./search";

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

describe("helpDocSections", () => {
  it("splits a body into H2 sections and keeps the intro", () => {
    const sections = helpDocSections(DOCS[0]);
    expect(sections.map((s) => s.heading)).toEqual([
      "Print runs & RFQs",
      "Setting up a print run",
      "Quotes",
    ]);
    expect(sections[1].text).toContain("quantity tiers");
  });

  it("falls back to the whole body when there are no headings", () => {
    const doc: HelpDoc = { ...DOCS[0], body: "Just a paragraph." };
    const sections = helpDocSections(doc);
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe(doc.title);
  });
});

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

  it("ignores stop-short queries with no term over two characters", () => {
    expect(rankHelpDocs(DOCS, "a to")).toEqual([]);
  });

  it("respects the limit", () => {
    const hits = rankHelpDocs(DOCS, "print run standup questions", 1);
    expect(hits).toHaveLength(1);
  });

  it("caps excerpt length", () => {
    const doc: HelpDoc = { ...DOCS[0], body: `## Big\n${"word ".repeat(400)}` };
    const hits = rankHelpDocs([doc], "big word");
    expect(hits[0].excerpt.length).toBeLessThanOrEqual(700);
  });
});
