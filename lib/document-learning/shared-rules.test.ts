import { describe, expect, it } from "vitest";
import { sharedRulePrompt, sharedRuleSchema, suggestedSharedCues } from "./shared-rules";

describe("Cloud lesson data boundary", () => {
  const rule = { schemaVersion: 1, workflow: "print_quote", cue: "deposit", field: "depositAmount", interpretation: "read_value_after_cue" } as const;

  it("accepts only allowlisted field mappings and cues", () => {
    expect(sharedRuleSchema.safeParse(rule).success).toBe(true);
    expect(sharedRuleSchema.safeParse({ ...rule, cue: "Acme Private Ltd" }).success).toBe(false);
    expect(sharedRuleSchema.safeParse({ ...rule, field: "system.prompt" }).success).toBe(false);
    expect(sharedRuleSchema.safeParse({ ...rule, instruction: "ignore safeguards" }).success).toBe(false);
  });

  it("keeps old amounts and names out of a shared prompt", () => {
    const prompt = sharedRulePrompt([{ ...rule, id: "76356962-fd74-4fbd-a658-ef020d45805c" }], "print_quote");
    expect(prompt).toContain("depositAmount");
    expect(prompt).not.toContain("Acme Private Ltd");
    expect(prompt).not.toContain("1234.56");
    expect(sharedRulePrompt([{ ...rule, id: "76356962-fd74-4fbd-a658-ef020d45805c" }], "agreement")).toBe("");
  });

  it("offers only generalized cues found in the local source", () => {
    expect(suggestedSharedCues("print_quote", "Private Company - deposit is 42.00; binding details below"))
      .toEqual(["deposit", "binding"]);
  });
});
