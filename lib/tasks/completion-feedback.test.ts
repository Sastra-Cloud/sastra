import { describe, expect, it, vi } from "vitest";
const success = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success } }));
import { showTaskCompleted } from "./completion-feedback";

describe("confirmed completion feedback", () => {
  it("offers only the canonical server handoff and navigates its saved task", () => {
    const navigate = vi.fn();
    showTaskCompleted({ handoff: { taskId: "saved", title: "Edit chapter", assigneeName: "Editor", dueDate: "2026-10-01", href: "/projects/example/tasks?task=saved" } }, navigate, "pending");
    const [, options] = success.mock.lastCall!;
    expect(options.id).toBe("pending");
    expect(options.description).toContain("Editor");
    expect(navigate).not.toHaveBeenCalled();
    options.action.onClick();
    expect(navigate).toHaveBeenCalledWith("/projects/example/tasks?task=saved");
  });
  it("does not invent an action when the pipeline has no confirmed handoff", () => {
    showTaskCompleted({ handoff: null }, vi.fn());
    expect(success.mock.lastCall![1].action).toBeUndefined();
  });
});
