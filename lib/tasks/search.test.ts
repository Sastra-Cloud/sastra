import { describe, expect, it } from "vitest";

import type { MyWorkTaskRow } from "./queries";
import {
  escapeLikePattern,
  matchesTaskSearch,
  myWorkTaskLocations,
  otherTaskReason,
  rankTaskSearchMatches,
  taskSearchTerms,
} from "./search";

const task = (id: string, fields: Partial<MyWorkTaskRow> = {}) =>
  ({
    id,
    title: id,
    description: null,
    projectTitle: null,
    status: "todo",
    dueDate: null,
    isNextUp: false,
    rank: 0,
    blockedByTitle: null,
    printPaymentId: null,
    completedAt: null,
    assignedTo: "me",
    assigneeName: "Me",
    ...fields,
  }) as MyWorkTaskRow;

describe("taskSearchTerms", () => {
  it("lower-cases, removes repeated words, and ignores one-letter queries", () => {
    expect(taskSearchTerms("  Cover  PROOF cover ")).toEqual(["cover", "proof"]);
    expect(taskSearchTerms("a")).toEqual([]);
    expect(taskSearchTerms("   ")).toEqual([]);
  });

  it("caps the number of words", () => {
    expect(taskSearchTerms("one two three four five six seven")).toHaveLength(6);
  });
});

describe("matchesTaskSearch", () => {
  const row = task("Send printer payment", {
    projectTitle: "The True Gospel",
    description: "Wire the deposit",
  });

  it("needs every word, from the title, project, or description", () => {
    expect(matchesTaskSearch(row, ["printer", "gospel"])).toBe(true);
    expect(matchesTaskSearch(row, ["deposit"])).toBe(true);
    expect(matchesTaskSearch(row, ["printer", "invoice"])).toBe(false);
    expect(matchesTaskSearch(row, [])).toBe(false);
  });
});

describe("rankTaskSearchMatches", () => {
  it("puts title matches first and keeps the order otherwise", () => {
    const rows = [
      task("Review layout", { description: "cover notes" }),
      task("Approve cover proof"),
      task("Cover design"),
      task("Print run", { projectTitle: "Cover stories" }),
    ];
    expect(rankTaskSearchMatches(rows, ["cover"]).map((row) => row.title)).toEqual([
      "Cover design",
      "Approve cover proof",
      "Review layout",
      "Print run",
    ]);
  });
});

describe("escapeLikePattern", () => {
  it("makes wildcard characters literal", () => {
    expect(escapeLikePattern("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("myWorkTaskLocations", () => {
  it("names the Focus section for each loaded task", () => {
    const locations = myWorkTaskLocations(
      [
        task("selected", { isNextUp: true }),
        task("today", { dueDate: "2026-10-19" }),
        task("started", { status: "in_progress" }),
        task("request", { assignedBy: "teammate", assignmentSource: "direct" }),
        task("deferred", { assignedBy: "teammate", assignmentSource: "direct", assignmentDeferredAt: new Date() }),
        task("overdue", { dueDate: "2026-10-01" }),
        task("far", { dueDate: "2027-03-01" }),
        task("finished", { status: "done", completedAt: new Date("2026-10-15T03:00:00Z") }),
      ],
      "2026-10-19",
      "Asia/Phnom_Penh"
    );
    expect(Object.fromEntries(locations)).toEqual({
      selected: "In Next up",
      today: "In Due today",
      request: "In From teammates",
      started: "In Working now",
      overdue: "In Other assigned work",
      far: "In Later",
      deferred: "In Later",
      finished: "Done Oct 15, 2026",
    });
  });
});

describe("otherTaskReason", () => {
  it("explains why a task is not in My Work", () => {
    const done = { status: "done", completedAt: new Date("2026-09-03T05:00:00Z") };
    expect(otherTaskReason(task("a", done), "me", "2026-10-19", "UTC")).toBe("Done Sep 3, 2026");
    expect(
      otherTaskReason(task("b", { assignedTo: "bora", assigneeName: "Bora" }), "me", "2026-10-19", "UTC")
    ).toBe("Assigned to Bora");
    expect(
      otherTaskReason(task("c", { ...done, assignedTo: null }), "me", "2026-10-19", "UTC")
    ).toBe("Done Sep 3, 2026 · Not assigned");
  });
});
