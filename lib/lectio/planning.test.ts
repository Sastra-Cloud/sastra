import { describe, expect, it } from "vitest";
import { parseScheduleEdit, validateScheduleEdit, type PlanningSchedule } from "./protocol/planning";

const current: PlanningSchedule = { revision: "a".repeat(64), timezone: "UTC", startDate: null, dueDate: "2026-12-01",
  tasks: [{ id: "task-1", title: "Translate", documentName: "Book", dueDate: "2026-11-01" }] };
describe("cross-app schedule edits", () => {
  it("preserves explicit cleared dates and accepts the complete current task set", () => {
    const edit = parseScheduleEdit({ ...current, startDate: "2026-10-01", dueDate: null, tasks: [{ id: "task-1", dueDate: null }] });
    validateScheduleEdit(current, edit);
    expect(edit).toMatchObject({ startDate: "2026-10-01", dueDate: null, tasks: [{ id: "task-1", dueDate: null }] });
  });
  it("rejects a stale revision or changed mapping before dates can be overwritten", () => {
    expect(() => validateScheduleEdit(current, parseScheduleEdit({ ...current, revision: "b".repeat(64) }))).toThrow(/schedule changed/i);
    expect(() => validateScheduleEdit(current, parseScheduleEdit({ ...current, tasks: [{ id: "another-task", dueDate: null }] }))).toThrow(/schedule changed/i);
    expect(() => validateScheduleEdit(current, parseScheduleEdit({ ...current, tasks: [] }))).toThrow(/schedule changed/i);
  });
  it("rejects invalid calendar dates, duplicate work, and a project ending before it starts", () => {
    expect(() => parseScheduleEdit({ ...current, dueDate: "2026-02-30" })).toThrow();
    expect(() => parseScheduleEdit({ ...current, startDate: "2026-12-02" })).toThrow(/start date/);
    expect(() => parseScheduleEdit({ ...current, tasks: [current.tasks[0], current.tasks[0]] })).toThrow(/one deadline/);
  });
});
