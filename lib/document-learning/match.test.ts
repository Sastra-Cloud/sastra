import { describe, expect, it } from "vitest";
import { selectExamples } from "./match";

describe("document case selection", () => {
  it("selects a matching approved workflow case without pulling in an unrelated text", () => {
    const examples = [
      { sourceName: "grant.pdf", sourceText: "Funding agreement milestone deliverables territory rights translation", id: "grant" },
      { sourceName: "license.pdf", sourceText: "Commercial license ebook audio print territory copyright holder", id: "license" },
      { sourceName: "bill.pdf", sourceText: "Printer shipment paper stock binding quotation", id: "printer" },
    ];
    const selected = selectExamples(examples, "Grant funding milestone deliverables for translation and territory rights");
    expect(selected.map((item) => item.id)).toEqual(["grant"]);
  });

  it("returns no guidance for a document without overlapping cues", () => {
    expect(selectExamples([{ sourceName: "license.pdf", sourceText: "Territory ebook copyright holder" }],
      "Warehouse shipping cartons tracking reference")).toEqual([]);
  });
});
