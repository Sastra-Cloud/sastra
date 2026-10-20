import { describe, expect, it } from "vitest";
import { countDueWorkTasks, EMPTY_NAVIGATION_BADGES, navigationBadgeFor, navigationBadgeText } from "./badges";

const today = "2026-10-19";
const task = { status: "todo", assignedTo: "me", dueDate: today };

describe("menu badge meaning", () => {
  it("counts only unfinished work due now for the current person", () => {
    expect(countDueWorkTasks([
      task,
      { ...task, dueDate: "2026-10-18", status: "blocked" },
      { ...task, dueDate: "2026-10-20" },
      { ...task, dueDate: null },
      { ...task, status: "done" },
      { ...task, assignedTo: "someone-else" },
    ], "me", today, "America/Los_Angeles")).toBe(2);
  });

  it("respects printer-payment waiting periods and follow-up dates", () => {
    const waiting = { ...task, dueDate: null, printPaymentStatus: "requested", printWireRequestedAt: "2026-10-16T18:00:00Z" };
    expect(countDueWorkTasks([waiting], "me", today, "America/Los_Angeles")).toBe(0);
    expect(countDueWorkTasks([waiting], "me", "2026-10-21", "America/Los_Angeles")).toBe(1);
    expect(countDueWorkTasks([{ ...waiting, printPaymentNeededByDate: today }], "me", today, "America/Los_Angeles")).toBe(1);
  });

  it("explains the work breakdown without duplicating chat or standup counts", () => {
    const counts = { dueTasks: 2, taskSuggestions: 1, followUps: 3, chat: 7, standups: 1, correspondence: 4 };
    expect(navigationBadgeFor("/tasks", counts)).toEqual({ count: 6, description: "2 tasks due or overdue, 1 task suggestion to review, 3 follow-ups due" });
    expect(navigationBadgeFor("/chat", counts)).toEqual({ count: 7, description: "7 unread messages" });
    expect(navigationBadgeFor("/standups", counts)).toEqual({ count: 1, description: "1 check-in waiting for you" });
    expect(navigationBadgeFor("/correspondence", counts)).toEqual({ count: 4, description: "4 email threads with shared reviews or unassigned follow-ups", href: "/correspondence?bucket=review" });
    for (const href of ["/dashboard", "/projects", "/settings"]) {
      expect(navigationBadgeFor(href, counts)).toBeNull();
    }
  });

  it("hides zero badges and caps the visible number without losing the real count", () => {
    expect(navigationBadgeFor("/tasks", EMPTY_NAVIGATION_BADGES)).toBeNull();
    expect(navigationBadgeFor("/chat", EMPTY_NAVIGATION_BADGES)).toBeNull();
    expect(navigationBadgeFor("/standups", EMPTY_NAVIGATION_BADGES)).toBeNull();
    expect(navigationBadgeText(99)).toBe("99");
    expect(navigationBadgeText(100)).toBe("99+");
    expect(navigationBadgeFor("/chat", { ...EMPTY_NAVIGATION_BADGES, chat: 187 })?.description).toBe("187 unread messages");
  });
});
