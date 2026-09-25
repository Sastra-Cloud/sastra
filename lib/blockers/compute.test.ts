import { describe, expect, it } from "vitest";

import {
  computeBlockers,
  healthFromBlockers,
  type TaskInput,
} from "@/lib/blockers/compute";

const TODAY = "2026-06-23";
const NOW = new Date(`${TODAY}T12:00:00Z`).getTime();
const base = { rights: undefined, budgets: [], tasks: [] as TaskInput[], today: TODAY, nowMs: NOW };

describe("rights blockers", () => {
  it("no blocker when complete", () => {
    const r = computeBlockers({
      ...base,
      rights: { id: "r1", overallStatus: "complete", completeByDate: null },
    });
    expect(r).toHaveLength(0);
  });
  it("warning while in progress", () => {
    const r = computeBlockers({
      ...base,
      rights: { id: "r1", overallStatus: "in_progress", completeByDate: "2099-01-01" },
    });
    expect(r[0]).toMatchObject({ type: "rights", severity: "warning" });
  });
  it("critical when past complete-by date", () => {
    const r = computeBlockers({
      ...base,
      rights: { id: "r1", overallStatus: "in_progress", completeByDate: "2026-06-01" },
    });
    expect(r[0]).toMatchObject({ type: "rights", severity: "critical" });
  });
  it("no blocker when none/not-set-up", () => {
    const r = computeBlockers({
      ...base,
      rights: { id: "r1", overallStatus: "none", completeByDate: null },
    });
    expect(r).toHaveLength(0);
  });
});

describe("rights expiry", () => {
  it("critical when a license has already expired", () => {
    const r = computeBlockers({
      ...base,
      rights: {
        id: "r1",
        overallStatus: "complete",
        completeByDate: null,
        licenseExpiresDate: "2026-06-01",
      },
    });
    expect(r.some((b) => b.severity === "critical" && /License expired/.test(b.title))).toBe(true);
  });
  it("warns when a license expires within 30 days", () => {
    const r = computeBlockers({
      ...base,
      rights: {
        id: "r1",
        overallStatus: "complete",
        completeByDate: null,
        licenseExpiresDate: "2026-07-10", // within 30d of 2026-06-23
      },
    });
    expect(r.some((b) => b.severity === "warning" && /License expires/.test(b.title))).toBe(true);
  });
  it("no expiry blocker when far in the future", () => {
    const r = computeBlockers({
      ...base,
      rights: {
        id: "r1",
        overallStatus: "complete",
        completeByDate: null,
        licenseExpiresDate: "2099-01-01",
      },
    });
    expect(r).toHaveLength(0);
  });
  it("no expiry blocker when an expiring license auto-renews", () => {
    const r = computeBlockers({
      ...base,
      rights: {
        id: "r1",
        overallStatus: "complete",
        completeByDate: null,
        licenseExpiresDate: "2026-06-01", // already past, but…
        licenseAutoRenews: true,
      },
    });
    expect(r.some((b) => /License expired|License expires/.test(b.title))).toBe(false);
  });
});

describe("budget blockers", () => {
  it("warning (not critical) on an uncommitted shortfall with no printing in scope", () => {
    const r = computeBlockers({
      ...base,
      budgets: [
        { amount: "1000", amountSecured: "0", currency: "USD", category: "translation" },
      ],
    });
    expect(r[0]).toMatchObject({ type: "budget", severity: "warning" });
  });
  it("critical — printing is blocked when print-ship is unfunded", () => {
    const r = computeBlockers({
      ...base,
      budgets: [
        { amount: "2000", amountSecured: "0", currency: "USD", category: "print_ship" },
      ],
    });
    expect(r[0]).toMatchObject({ type: "budget", severity: "critical" });
    expect(r[0].title).toContain("Printing blocked");
  });
  it("warning on partial shortfall", () => {
    const r = computeBlockers({
      ...base,
      budgets: [{ amount: "1000", amountSecured: "600", currency: "USD" }],
    });
    expect(r[0]).toMatchObject({ type: "budget", severity: "warning" });
  });
  it("no blocker when fully raised (committed funding pledged)", () => {
    const r = computeBlockers({
      ...base,
      budgets: [{ amount: "1000", amountSecured: "1000", currency: "USD" }],
    });
    expect(r).toHaveLength(0);
  });
  it("no blocker when a scheduled MoU payment covers the shortfall", () => {
    const r = computeBlockers({
      ...base,
      budgets: [
        { amount: "1000", amountSecured: "0", currency: "USD", category: "print_ship" },
      ],
      scheduledFunding: 1000,
    });
    expect(r).toHaveLength(0);
  });
  it("does not count the same line pledge and payment schedule twice", () => {
    const r = computeBlockers({
      ...base,
      budgets: [
        { amount: "1500", amountSecured: "1000", currency: "USD" },
      ],
      scheduledFunding: 1000,
    });
    expect(r[0]).toMatchObject({ type: "budget", severity: "warning" });
    expect(r[0].title).toContain("500");
  });
  it("no blocker when received non-MoU funding covers the shortfall", () => {
    const r = computeBlockers({
      ...base,
      budgets: [
        { amount: "1000", amountSecured: "0", currency: "USD", category: "print_ship" },
      ],
      receivedFunding: 1000,
    });
    expect(r).toHaveLength(0);
  });
  it("uses net available funding for print readiness after deductions", () => {
    const r = computeBlockers({
      ...base,
      budgets: [
        {
          amount: "1000",
          amountSecured: "1150",
          currency: "USD",
          category: "print_ship",
        },
      ],
      scheduledFunding: 1150,
      operationalNeeded: 1000,
      operationalAvailable: 1000.5,
    });
    expect(r).toHaveLength(0);

    const short = computeBlockers({
      ...base,
      budgets: [
        {
          amount: "1000",
          amountSecured: "1150",
          currency: "USD",
          category: "print_ship",
        },
      ],
      scheduledFunding: 1150,
      operationalNeeded: 1000,
      operationalAvailable: 990,
    });
    expect(short[0]).toMatchObject({ type: "budget", severity: "critical" });
    expect(short[0].title).toContain("after deductions");
  });
});

describe("task blockers", () => {
  it("flags overdue, not-done tasks", () => {
    const r = computeBlockers({
      ...base,
      tasks: [
        { id: "t1", title: "Late", status: "todo", dueDate: "2026-06-01", updatedAt: new Date(NOW) },
        { id: "t2", title: "Done late", status: "done", dueDate: "2026-06-01", updatedAt: new Date(NOW) },
      ],
    });
    expect(r.filter((b) => b.type === "overdue_task")).toHaveLength(1);
    expect(r[0].sourceId).toBe("t1");
  });
  it("flags stalled in-progress tasks (>5 days untouched)", () => {
    const old = NOW - 6 * 86_400_000;
    const r = computeBlockers({
      ...base,
      tasks: [
        { id: "t1", title: "Stuck", status: "in_progress", dueDate: null, updatedAt: new Date(old) },
      ],
    });
    expect(r.filter((b) => b.type === "stalled_task")).toHaveLength(1);
  });
  it("reports an overdue stalled task only once as the stronger overdue issue", () => {
    const old = NOW - 6 * 86_400_000;
    const r = computeBlockers({
      ...base,
      tasks: [
        {
          id: "t1",
          title: "Late and untouched",
          status: "in_progress",
          dueDate: "2026-06-01",
          updatedAt: new Date(old),
        },
      ],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: "overdue_task", sourceId: "t1" });
  });
});

describe("dependency blockers", () => {
  const dep = (over: boolean) => ({
    taskId: "t1",
    taskTitle: "Edit",
    taskStatus: "todo",
    blockedByTitle: "Translate",
    blockedByStatus: "in_progress",
    blockedByDueDate: over ? "2026-06-01" : "2099-01-01",
  });
  it("treats ordinary unfinished dependencies as neutral pipeline waiting", () => {
    expect(
      computeBlockers({ ...base, dependencies: [dep(false)] })
    ).toHaveLength(0);
  });
  it("reports an overdue predecessor once through the task root cause", () => {
    const r = computeBlockers({
      ...base,
      tasks: [
        {
          id: "translate",
          title: "Translate",
          status: "in_progress",
          dueDate: "2026-06-01",
          updatedAt: new Date(NOW),
        },
      ],
      dependencies: [dep(true)],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      type: "overdue_task",
      sourceId: "translate",
    });
  });
});

describe("schedule (pace) blocker", () => {
  it("adds a warning when the forecast is likely_late", () => {
    const r = computeBlockers({
      ...base,
      forecast: {
        risk: "likely_late",
        projectedDate: "2026-08-01",
        dueDate: "2026-07-15",
      },
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: "schedule", severity: "warning" });
  });

  it("never flips health red on its own", () => {
    const r = computeBlockers({
      ...base,
      forecast: {
        risk: "likely_late",
        projectedDate: "2026-08-01",
        dueDate: "2026-07-15",
      },
    });
    expect(healthFromBlockers(r)).toBe("amber");
  });

  it("adds nothing for on_track / at_risk / unknown or when dates are missing", () => {
    for (const risk of ["on_track", "at_risk", "unknown"] as const) {
      expect(
        computeBlockers({
          ...base,
          forecast: { risk, projectedDate: "2026-08-01", dueDate: "2026-07-15" },
        })
      ).toHaveLength(0);
    }
    expect(
      computeBlockers({
        ...base,
        forecast: { risk: "likely_late", projectedDate: null, dueDate: null },
      })
    ).toHaveLength(0);
  });
});

describe("project overdue blocker", () => {
  it("critical + red when the project is past its own due date", () => {
    const r = computeBlockers({
      ...base,
      project: { dueDate: "2026-01-01", status: "planning" },
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      type: "schedule",
      severity: "critical",
      sourceType: "project",
    });
    expect(r[0].title).toMatch(/Project overdue \(due 2026-01-01\)/);
    expect(healthFromBlockers(r)).toBe("red");
  });

  it("no blocker for a future or missing due date", () => {
    expect(
      computeBlockers({
        ...base,
        project: { dueDate: "2099-01-01", status: "active" },
      })
    ).toHaveLength(0);
    expect(
      computeBlockers({ ...base, project: { dueDate: null, status: "active" } })
    ).toHaveLength(0);
  });

  it("ignores completed/cancelled projects", () => {
    for (const status of ["completed", "cancelled"] as const) {
      expect(
        computeBlockers({
          ...base,
          project: { dueDate: "2026-01-01", status },
        })
      ).toHaveLength(0);
    }
  });

  it("does not treat a proposal date or forecast as committed delivery work", () => {
    expect(
      computeBlockers({
        ...base,
        project: { dueDate: "2026-01-01", status: "proposal" },
        forecast: {
          risk: "likely_late",
          projectedDate: "2026-08-01",
          dueDate: "2026-01-01",
        },
      })
    ).toHaveLength(0);
  });

  it("suppresses the speculative pace warning once the project is overdue", () => {
    const r = computeBlockers({
      ...base,
      project: { dueDate: "2026-01-01", status: "active" },
      forecast: {
        risk: "likely_late",
        projectedDate: "2026-08-01",
        dueDate: "2026-01-01",
      },
    });
    // Only the concrete overrun, not the pace forecast.
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severity: "critical", sourceType: "project" });
  });
});

describe("healthFromBlockers", () => {
  it("maps severity to RAG", () => {
    expect(healthFromBlockers([])).toBe("green");
    expect(healthFromBlockers([{ type: "budget", severity: "warning", title: "x" }])).toBe("amber");
    expect(healthFromBlockers([{ type: "rights", severity: "critical", title: "x" }])).toBe("red");
  });
});
