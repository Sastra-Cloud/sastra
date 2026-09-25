import { describe, expect, it } from "vitest";

import { validateAgreementAnswer } from "./answer";
import type { AgreementEvidence } from "./retrieval";

const evidence: AgreementEvidence[] = [
  {
    id: "chunk-1",
    documentId: "11111111-1111-4111-8111-111111111111",
    fileId: "22222222-2222-4222-8222-222222222222",
    attachmentId: "33333333-3333-4333-8333-333333333333",
    documentName: "License.pdf",
    label: "license",
    sourceOrder: 1,
    chunkIndex: 0,
    section: "Territory",
    pageStart: 4,
    pageEnd: 4,
    content: "The licensed territory is Cambodia, excluding export sales.",
  },
];

describe("agreement answer validation", () => {
  it("accepts exact evidence quotes and resolves metadata server-side", () => {
    const result = validateAgreementAnswer(
      {
        status: "answered",
        answer: "The license covers Cambodia but excludes exports.",
        citations: [
          {
            chunk_id: "chunk-1",
            quote: "Cambodia, excluding export sales",
          },
        ],
      },
      evidence
    );
    expect(result.status).toBe("answered");
    expect(result.citations[0]).toMatchObject({
      documentName: "License.pdf",
      pageStart: 4,
    });
  });

  it("downgrades an answered response with invented evidence", () => {
    const result = validateAgreementAnswer(
      {
        status: "answered",
        answer: "Exports are allowed.",
        citations: [{ chunk_id: "missing", quote: "Exports are allowed." }],
      },
      evidence
    );
    expect(result.status).toBe("ambiguous");
    expect(result.citations).toEqual([]);
    expect(result.answer).not.toContain("Exports are allowed");
  });

  it("preserves a supported not-stated abstention without citations", () => {
    const result = validateAgreementAnswer(
      { status: "not_stated", answer: "The agreement does not state a currency.", citations: [] },
      evidence
    );
    expect(result.status).toBe("not_stated");
  });
});
