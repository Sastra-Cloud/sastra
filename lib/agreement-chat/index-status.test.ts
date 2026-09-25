import { describe, expect, it } from "vitest";

import {
  deriveAgreementDocumentIndexStatus,
  friendlyAgreementIndexError,
} from "./index-status";

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

describe("friendlyAgreementIndexError", () => {
  it("turns provider timeout details into actionable user-facing copy", () => {
    expect(
      friendlyAgreementIndexError(
        "aiEmbed:wiki_embedding timed out after 30000ms"
      )
    ).toBe("The search provider timed out before this source could be added.");
  });
});
