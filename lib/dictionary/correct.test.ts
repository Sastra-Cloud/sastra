import { describe, expect, it } from "vitest";

import { applyVoiceDictionary } from "./correct";

describe("applyVoiceDictionary", () => {
  it("replaces explicit aliases and canonicalizes casing", () => {
    const entries = [{ term: "Bora", aliases: ["Bra", "Barra", "Borra"] }];

    expect(applyVoiceDictionary("Assign bra to the task.", entries)).toBe(
      "Assign Bora to the task."
    );
    expect(applyVoiceDictionary("Ask BARRA tomorrow.", entries)).toBe(
      "Ask Bora tomorrow."
    );
    expect(applyVoiceDictionary("bora can review it.", entries)).toBe(
      "Bora can review it."
    );
  });

  it("does not replace aliases inside another word", () => {
    const entries = [{ term: "Ro", aliases: ["Row"] }];

    expect(applyVoiceDictionary("The brown rowboat", entries)).toBe(
      "The brown rowboat"
    );
  });

  it("supports Unicode names and punctuation", () => {
    const entries = [
      { term: "សុភ័ក្រ", aliases: ["សុភ័ក"] },
      { term: "Dara P. Sok", aliases: ["Dara P Sok"] },
    ];

    expect(applyVoiceDictionary("សួស្តី សុភ័ក!", entries)).toBe(
      "សួស្តី សុភ័ក្រ!"
    );
    expect(applyVoiceDictionary("Ask Dara P Sok.", entries)).toBe(
      "Ask Dara P. Sok."
    );
  });

  it("treats regex syntax as literal text", () => {
    const entries = [{ term: "C++", aliases: ["C plus plus"] }];

    expect(applyVoiceDictionary("Use C++ or C plus plus.", entries)).toBe(
      "Use C++ or C++."
    );
  });

  it("skips an alias that points to multiple terms", () => {
    const entries = [
      { term: "Bora", aliases: ["Barra"] },
      { term: "Borak", aliases: ["Barra"] },
    ];

    expect(applyVoiceDictionary("Ask Barra.", entries)).toBe("Ask Barra.");
  });
});
