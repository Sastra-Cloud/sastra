import { describe, expect, it } from "vitest";

import {
  agreementParserKind,
  agreementPdfNeedsOcr,
  agreementNormalizedText,
  buildAgreementChunks,
} from "./chunks";

describe("agreement chunking", () => {
  const base = {
    documentId: "11111111-1111-4111-8111-111111111111",
    contentHash: "hash",
    documentName: "License.pdf",
    label: "license" as const,
  };

  it("preserves headings, pages, source order, and stable IDs", () => {
    const pages = [
      { page: 1, text: "1. GRANT OF RIGHTS\n\nThe Publisher grants print rights." },
      { page: 2, text: "2. TERRITORY\n\nThe territory is Cambodia." },
    ];
    const first = buildAgreementChunks({ ...base, pages });
    const second = buildAgreementChunks({ ...base, pages });
    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({ section: "1. GRANT OF RIGHTS", pageStart: 1 });
    expect(first[1]).toMatchObject({ section: "2. TERRITORY", pageStart: 2 });
    expect(second.map((chunk) => chunk.id)).toEqual(first.map((chunk) => chunk.id));
  });

  it("marks page boundaries in normalized multi-page text", () => {
    expect(
      agreementNormalizedText([
        { page: 1, text: "First" },
        { page: 2, text: "Second" },
      ])
    ).toContain("--- Page 2 ---\nSecond");
  });

  it("splits very long clauses without losing text", () => {
    const text = "A".repeat(7_400);
    const chunks = buildAgreementChunks({
      ...base,
      pages: [{ page: 3, text }],
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.content).join("")).toBe(text);
    expect(chunks.every((chunk) => chunk.pageStart === 3)).toBe(true);
  });

  it("routes supported document types and leaves spreadsheets unavailable", () => {
    expect(agreementParserKind("application/pdf")).toBe("pdf");
    expect(
      agreementParserKind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe("docx");
    expect(agreementParserKind("image/jpeg")).toBe("image");
    expect(
      agreementParserKind(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    ).toBeNull();
  });

  it("sends scanned and text-poor PDFs to OCR", () => {
    expect(agreementPdfNeedsOcr([{ page: 1, text: "" }])).toBe(true);
    expect(agreementPdfNeedsOcr([{ page: 1, text: "x".repeat(400) }])).toBe(
      false
    );
    expect(agreementPdfNeedsOcr([{ page: 1, text: "---".repeat(200) }])).toBe(
      true
    );
  });
});
