import { describe, expect, it } from "vitest";

import { resolveTaskKeyFromJudgments } from "./routing-jev";

const YES = { noul: 0.95 };
const NO = { noul: 0.02 };
const UNSURE = { noul: 0.5 };

function judgment(
  projectRead: { noul: number },
  operational: { noul: number },
  multiStep: { noul: number }
) {
  return {
    isSimpleProjectRead: projectRead,
    isOperational: operational,
    isMultiStep: multiStep,
  };
}

describe("resolveTaskKeyFromJudgments", () => {
  it("keeps a plain project read on the economical model", () => {
    expect(
      resolveTaskKeyFromJudgments(judgment(YES, NO, NO), "What are my open tasks?", "member")
    ).toBe("assistant");
  });

  it("routes sensitive work to the stronger model for managers", () => {
    expect(
      resolveTaskKeyFromJudgments(
        judgment(NO, YES, NO),
        "Draft a reply about the license payment",
        "manager"
      )
    ).toBe("assistant_complex");
  });

  it("keeps sensitive wording on the economical model for members", () => {
    // Members cannot reach the operational tools, so the stronger model buys
    // nothing — this mirrors the role guard in the keyword rules.
    expect(
      resolveTaskKeyFromJudgments(
        judgment(NO, YES, NO),
        "Who handles the license payment?",
        "member"
      )
    ).toBe("assistant");
  });

  it("routes multi-step asks to the stronger model for any role", () => {
    expect(
      resolveTaskKeyFromJudgments(
        judgment(NO, NO, YES),
        "Compare every project and then plan the next quarter",
        "member"
      )
    ).toBe("assistant_complex");
  });

  it("lets multi-step override a project read", () => {
    expect(
      resolveTaskKeyFromJudgments(
        judgment(YES, NO, YES),
        "List all projects and compare their budgets",
        "manager"
      )
    ).toBe("assistant_complex");
  });

  it("treats very long asks as multi-step even when judged otherwise", () => {
    const long = "Tell me about the project. ".repeat(30);
    expect(long.length).toBeGreaterThan(500);
    expect(resolveTaskKeyFromJudgments(judgment(YES, NO, NO), long, "manager")).toBe(
      "assistant_complex"
    );
  });

  it("defers to the keyword rules when any signal is mid-band", () => {
    expect(
      resolveTaskKeyFromJudgments(judgment(UNSURE, NO, NO), "anything", "manager")
    ).toBeNull();
    expect(
      resolveTaskKeyFromJudgments(judgment(YES, UNSURE, NO), "anything", "manager")
    ).toBeNull();
    expect(
      resolveTaskKeyFromJudgments(judgment(YES, NO, UNSURE), "anything", "manager")
    ).toBeNull();
  });

  it("defers to the keyword rules when the judgment is unavailable", () => {
    expect(resolveTaskKeyFromJudgments(null, "anything", "manager")).toBeNull();
    expect(resolveTaskKeyFromJudgments(undefined, "anything", "manager")).toBeNull();
  });

  it("defers when a probability is not a usable number", () => {
    expect(
      resolveTaskKeyFromJudgments(
        judgment({ noul: Number.NaN }, NO, NO),
        "anything",
        "manager"
      )
    ).toBeNull();
  });
});
