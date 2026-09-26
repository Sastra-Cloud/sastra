import { describe, expect, it } from "vitest";

import {
  availableTools,
  getTool,
  isToolAllowed,
  isWriteTool,
} from "./tools";

describe("assistant project blueprint tool", () => {
  it("is review-first and restricted to managers", () => {
    expect(getTool("create_project_with_budget")).toBeDefined();
    expect(isWriteTool("create_project_with_budget")).toBe(true);
    expect(isToolAllowed("member", "create_project_with_budget")).toBe(false);
    expect(isToolAllowed("manager", "create_project_with_budget")).toBe(true);
  });

  it("is routed into project-and-budget conversations", () => {
    const names = availableTools(
      "manager",
      "Create two projects with 52 units and set up each budget and partner quote"
    ).map((tool) => (tool.type === "function" ? tool.function.name : ""));
    expect(names).toContain("create_project_with_budget");
  });
});

describe("assistant chat pin tools", () => {
  it("lists pins without approval and unpins only after approval", () => {
    expect(getTool("list_pinned_messages")?.kind).toBe("read");
    expect(isToolAllowed("member", "list_pinned_messages")).toBe(true);
    expect(isWriteTool("unpin_chat_message")).toBe(true);
    expect(isToolAllowed("member", "unpin_chat_message")).toBe(true);
    expect(getTool("unpin_chat_message")?.parameters.required).toEqual([
      "messageId",
    ]);
  });

  it("is routed into pin conversations", () => {
    const names = availableTools(
      "member",
      "What is pinned in the cover design channel? Unpin the old budget note."
    ).map((tool) => (tool.type === "function" ? tool.function.name : ""));
    expect(names).toContain("list_pinned_messages");
    expect(names).toContain("unpin_chat_message");
  });
});

describe("assistant current-project safeguards", () => {
  it("keeps current-project and correction tools available for short follow-ups", () => {
    const names = availableTools("manager", "yes").map((tool) =>
      tool.type === "function" ? tool.function.name : ""
    );

    expect(names).toContain("get_current_project");
    expect(names).toContain("get_project_schedule_advice");
    expect(names).toContain("set_project_completion_date");
    expect(names).toContain("move_task_to_project");
  });

  it("keeps schedule reads and completion writes manager-only", () => {
    expect(isToolAllowed("member", "get_project_schedule_advice")).toBe(false);
    expect(isToolAllowed("manager", "get_project_schedule_advice")).toBe(true);
    expect(isToolAllowed("member", "set_project_completion_date")).toBe(false);
    expect(isToolAllowed("manager", "set_project_completion_date")).toBe(true);
    expect(isWriteTool("set_project_completion_date")).toBe(true);
  });

  it("requires a project assertion before permanent task deletion", () => {
    const tool = getTool("delete_task");

    expect(tool?.parameters.required).toEqual(["taskId", "projectId"]);
    expect(tool?.riskLevel).toBe("high");
  });
});
