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
  it("reserves the selected undated order ahead of a long deadline list", () => {
    const rows = [
      { ...task("chosen-undated-task", null), isNextUp: true, rank: 0 },
      { ...task("chosen-today-task", today), isNextUp: true, rank: 1 },
      ...Array.from({ length: 12 }, (_, index) => task(`deadline-task-${index}`, today)),
    ];
    const html = renderToStaticMarkup(<MyTasksList tasks={rows} homePreview todayIso={today} />);
    expect(html.indexOf("chosen-undated-task")).toBeLessThan(html.indexOf("deadline-task-0"));
    expect(html).toContain("No due date");
    expect(html).toContain("13 due today");
    expect(html).toContain("1 of today&#x27;s tasks shown in Next up above");
    expect(html).toContain("deadline-task-11");
    expect(html).toContain('href="/tasks?view=focus#next-up"');
    expect(html.match(/>chosen-today-task</g)).toHaveLength(1);
  });
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
    expect(html).toContain('data-task-id="rescheduled-task"');
    expect(html).toContain("1 due today");
    expect(html).not.toContain("completed-task");
    expect(html).not.toContain("No other tasks need attention right now");
    expect(html).not.toContain('id="home-next-tasks-heading"');
    expect(html).toContain("Due today");
  });

  it("shows one quiet state when all remaining work is planned for later", () => {
    const html = renderToStaticMarkup(<MyTasksList tasks={[task("future-task", "2027-02-01")]} homePreview todayIso={today} />);
    expect(html).toContain("No tasks due today.");
    expect(html).toContain("No other tasks need attention right now");
    expect(html).toContain("1 planned for later");
    expect(html).not.toContain('id="home-due-today-heading"');
    expect(html).not.toContain('id="home-next-tasks-heading"');
  });
});
