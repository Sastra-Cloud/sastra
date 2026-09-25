import { describe, expect, it } from "vitest";

import { heuristic } from "@/lib/standup/heuristic";

const clean = { open: 5, overdue: 0, stalled: 0 };

describe("standup heuristic", () => {
  it("low risk when nothing is flagged", () => {
    const r = heuristic("completed", [], clean);
    expect(r.stuckRisk).toBe("low");
    expect(r.impediments).toEqual([]);
  });

  it("medium risk on a single flag", () => {
    expect(heuristic("completed", [], { open: 5, overdue: 1, stalled: 0 }).stuckRisk).toBe(
      "medium"
    );
  });

  it("high risk when two or more flags", () => {
    expect(
      heuristic("completed", [], { open: 5, overdue: 1, stalled: 1 }).stuckRisk
    ).toBe("high");
  });

  it("high risk when the standup was missed", () => {
    const r = heuristic("missed", [], clean);
    expect(r.stuckRisk).toBe("high");
    expect(r.reasoning).toMatch(/did not submit/i);
  });

  it("captures real impediments and ignores negatives", () => {
    const answers = [
      { prompt: "Any impediments in your way?", content: "Waiting on Crossway license" },
      { prompt: "What will you do today?", content: "Edit chapter 3" },
    ];
    const r = heuristic("completed", answers, clean);
    expect(r.impediments).toEqual(["Waiting on Crossway license"]);
    expect(r.stuckRisk).toBe("medium"); // 1 impediment flag

    const none = heuristic(
      "completed",
      [{ prompt: "Any blockers?", content: "None" }],
      clean
    );
    expect(none.impediments).toEqual([]);
    expect(none.stuckRisk).toBe("low");
  });
});
