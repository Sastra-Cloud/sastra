import { describe, expect, it } from "vitest";

import { deriveAgreementDocumentIndexStatus } from "./index-status";

describe("deriveAgreementDocumentIndexStatus", () => {
  it("marks a document ready only when every chunk is ready", () => {
    expect(deriveAgreementDocumentIndexStatus(["ready", "ready"])).toBe(
      "ready"
    );
  });

  it("keeps pending work ahead of an earlier chunk failure", () => {
    expect(deriveAgreementDocumentIndexStatus(["failed", "pending"])).toBe(
      "pending"
    );
    expect(deriveAgreementDocumentIndexStatus(["ready", "processing"])).toBe(
      "processing"
    );
  });

  it("surfaces terminal failures instead of an indefinite pending state", () => {
    expect(deriveAgreementDocumentIndexStatus(["ready", "failed"])).toBe(
      "failed"
    );
    expect(deriveAgreementDocumentIndexStatus([])).toBe("failed");
  });
});
