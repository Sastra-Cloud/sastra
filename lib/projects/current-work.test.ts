import { describe, expect, it } from "vitest";
import { summarizeCurrentWork } from "./current-work";

const stages = [{ id: "translation", name: "Translation" }, { id: "editing", name: "Editing" }];
const task = (id: string, overrides = {}) => ({ id, title: id, status: "todo", phaseId: "translation", assignedTo: "other", dueDate: null, ...overrides });
describe("current project work", () => {
  it("reports parallel started stages and excludes completed tasks", () => {
    const result = summarizeCurrentWork([task("one", { status: "in_progress" }), task("two", { status: "review", phaseId: "editing" }), task("done", { status: "done", assignedTo: "viewer" })], stages, "viewer", []);
    expect(result.stageNames).toEqual(["Translation", "Editing"]);
    expect(result.started).toBe(true);
    expect(result.nextTask?.id).not.toBe("done");
  });
  it("prefers actionable viewer work over a blocked viewer task and labels a blocked fallback", () => {
    const tasks = [task("blocked", { assignedTo: "viewer", status: "in_progress" }), task("ready", { assignedTo: "viewer" })];
    const dependencies = [{ taskId: "blocked", blockedByStatus: "review" }];
    expect(summarizeCurrentWork(tasks, stages, "viewer", dependencies).nextTask?.id).toBe("ready");
    expect(summarizeCurrentWork(tasks.slice(0, 1), stages, "viewer", dependencies).blocked).toBe(true);
    expect(summarizeCurrentWork(tasks, stages, "viewer", [{ taskId: "blocked", blockedByStatus: "done" }]).nextTask?.id).toBe("blocked");
  });
  it("reports no invented stage or next task for empty and complete projects", () => {
    for (const tasks of [[], [task("done", { status: "done" })]]) {
      const result = summarizeCurrentWork(tasks, stages, "viewer", []);
      expect(result.nextTask).toBeNull();
      expect(result.stageNames).toEqual([]);
    }
  });
});
