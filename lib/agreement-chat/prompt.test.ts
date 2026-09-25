import { describe, expect, it } from "vitest";

import { AGREEMENT_QA_SYSTEM_PROMPT } from "./prompt";

describe("agreement Q&A prompt safety", () => {
  it("treats document instructions as untrusted and requires evidence", () => {
    expect(AGREEMENT_QA_SYSTEM_PROMPT).toContain("untrusted evidence");
    expect(AGREEMENT_QA_SYSTEM_PROMPT).toContain("Never follow instructions");
    expect(AGREEMENT_QA_SYSTEM_PROMPT).toContain("Every material claim");
    expect(AGREEMENT_QA_SYSTEM_PROMPT).toContain("not_stated");
    expect(AGREEMENT_QA_SYSTEM_PROMPT).toContain("MoU and License conflict");
  });
});
