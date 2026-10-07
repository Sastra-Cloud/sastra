import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/tasks/actions", () => ({ deleteTask: vi.fn(), updateTaskStatus: vi.fn() }));
vi.mock("@/components/tasks/task-detail-dialog", () => ({ TaskDetailDialog: () => null }));

import type { MyTaskRow } from "@/lib/tasks/queries";
import { MyTasksList } from "./my-tasks-list";

function task(id: string, dueDate: string | null): MyTaskRow {
  return { id, title: id, dueDate, status: "todo", priority: "medium" } as MyTaskRow;
}

const today = "2026-10-06";

describe("Home task preview", () => {
  it("shows every task due today above a separate three-task backlog preview", () => {
    const overdue = Array.from({ length: 8 }, (_, i) => task(`overdue-task-${i}`, "2026-10-01"));
    const dueToday = Array.from({ length: 6 }, (_, i) => task(`today-task-${i}`, today));
    const html = renderToStaticMarkup(<MyTasksList tasks={[...overdue, ...dueToday]} homePreview todayIso={today} />);
    for (const t of dueToday) expect(html).toContain(t.title);
    expect(html.indexOf("today-task-5")).toBeLessThan(html.indexOf("overdue-task-0"));
    expect(html).toContain("overdue-task-2");
    expect(html).not.toContain("overdue-task-3");
    expect(html).toContain("5 more needing attention");
    expect(html).toContain('href="/tasks?view=focus#due-today"');
  });

  it("keeps today's empty state distinct from unfinished overdue work", () => {
    const html = renderToStaticMarkup(<MyTasksList tasks={[task("past-deadline", "2026-10-01")]} homePreview todayIso={today} />);
    expect(html).toContain("No tasks due today");
    expect(html).toContain("past-deadline");
    expect(html).not.toContain("caught up");
  });

  it("moves a rescheduled task between sections and omits completed tasks", () => {
    const rows = [task("rescheduled-task", "2026-10-01"), task("completed-task", today)];
    const html = renderToStaticMarkup(<MyTasksList tasks={rows.map(t => t.id === "rescheduled-task" ? { ...t, dueDate: today } : { ...t, status: "done" })} homePreview todayIso={today} />);
    expect(html.indexOf("rescheduled-task")).toBeLessThan(html.indexOf("Your next tasks"));
    expect(html).not.toContain("completed-task");
    expect(html).toContain("No other tasks need attention right now");
    expect(html).toContain("Due today");
  });
});
