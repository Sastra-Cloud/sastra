import { describe, expect, it } from "vitest";

import { bucketAgenda, dayDiff, type AgendaItem } from "./bucket";

function item(overrides: Partial<AgendaItem> & { id: string; date: string }): AgendaItem {
  return {
    kind: "task",
    title: "Item",
    projectId: null,
    projectSlug: null,
    projectTitle: null,
    amount: null,
    currency: null,
    assigneeName: null,
    href: "#",
    ...overrides,
  };
}

describe("dayDiff", () => {
  it("computes whole-day differences", () => {
    expect(dayDiff("2026-07-03", "2026-07-03")).toBe(0);
    expect(dayDiff("2026-07-03", "2026-07-10")).toBe(7);
    expect(dayDiff("2026-07-03", "2026-07-01")).toBe(-2);
  });
});

describe("bucketAgenda", () => {
  const today = "2026-07-03";

  it("splits items into overdue / this week / next 2 weeks / later", () => {
    const items = [
      item({ id: "a", date: "2026-06-30" }), // overdue
      item({ id: "b", date: "2026-07-03" }), // today → this week
      item({ id: "c", date: "2026-07-10" }), // +7 → this week
      item({ id: "d", date: "2026-07-15" }), // +12 → next 2 weeks
      item({ id: "e", date: "2026-08-30" }), // far → later
    ];
    const b = bucketAgenda(items, today);
    expect(b.overdue.map((i) => i.id)).toEqual(["a"]);
    expect(b.thisWeek.map((i) => i.id)).toEqual(["b", "c"]);
    expect(b.next2Weeks.map((i) => i.id)).toEqual(["d"]);
    expect(b.later.map((i) => i.id)).toEqual(["e"]);
  });

  it("sorts by date, then money/milestones ahead of tasks on the same day", () => {
    const items = [
      item({ id: "task", date: "2026-07-05", kind: "task", title: "Z task" }),
      item({ id: "pay", date: "2026-07-05", kind: "mou_payment", title: "Payment" }),
      item({ id: "early", date: "2026-07-04", kind: "task", title: "Earlier" }),
    ];
    const b = bucketAgenda(items, today);
    expect(b.thisWeek.map((i) => i.id)).toEqual(["early", "pay", "task"]);
  });

  it("is empty-safe", () => {
    const b = bucketAgenda([], today);
    expect(b.overdue).toEqual([]);
    expect(b.later).toEqual([]);
  });
});
