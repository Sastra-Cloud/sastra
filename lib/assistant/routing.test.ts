import { describe, expect, it } from "vitest";

import { assistantTaskKeyFor } from "./routing";

describe("assistantTaskKeyFor", () => {
  it("keeps routine member tasks on the economical model", () => {
    expect(assistantTaskKeyFor("What are my open tasks?", "member")).toBe("assistant");
  });

  it("keeps focused live portfolio reads on the economical model", () => {
    expect(
      assistantTaskKeyFor(
        "Which projects still need licenses from Crossway?",
        "manager"
      )
    ).toBe("assistant");
    expect(
      assistantTaskKeyFor("Show me active books due this quarter", "manager")
    ).toBe("assistant");
  });

  it("routes sensitive manager workflows and multi-step asks to the stronger model", () => {
    expect(
      assistantTaskKeyFor("Draft a reply about the license payment", "manager")
    ).toBe("assistant_complex");
    expect(
      assistantTaskKeyFor("Create the task and then compare every blocker", "member")
    ).toBe("assistant_complex");
  });
});
