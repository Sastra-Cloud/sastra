import { describe, expect, it } from "vitest";
import { onboardingSteps, onboardingStepComplete, type OnboardingSignals } from "./steps";
const empty: OnboardingSignals = { assignedTaskCount: 0, completedTaskCount: 0, standupCount: 0, hasStandup: false, workspaceConfirmed: false, projectSlug: null, budgetProjectSlug: null, hasTeammate: false, hasAssignedWork: false };
describe("truthful onboarding", () => {
  it("ignores old click completions for outcomes", () => {
    const task = onboardingSteps("member", { ...empty, assignedTaskCount: 1 }).find(s => s.key === "task")!;
    expect(onboardingStepComplete(task, () => true)).toBe(false);
    const completed = onboardingSteps("member", { ...empty, completedTaskCount: 1 }).find(s => s.key === "task")!;
    expect(onboardingStepComplete(completed, () => false)).toBe(true);
  });
  it("shows only available member steps", () => {
    expect(onboardingSteps("member", empty).map(s => s.key)).toEqual(["work", "guide"]);
    expect(onboardingSteps("member", { ...empty, hasStandup: true }).some(s => s.key === "standup")).toBe(true);
  });
  it("uses real project destinations and workspace outcomes", () => {
    expect(onboardingSteps("manager", empty).some(s => s.key === "budget")).toBe(false);
    expect(onboardingSteps("manager", { ...empty, budgetProjectSlug: "sample" }).find(s => s.key === "budget")?.href).toBe("/projects/sample/budget");
    const admin = onboardingSteps("admin", { ...empty, projectSlug: "sample", hasTeammate: true });
    expect(admin.map(s => s.key)).toEqual(["workspace", "project", "team", "assign"]);
    expect(admin.map(s => onboardingStepComplete(s, () => true))).toEqual([false, true, true, false]);
    expect(admin[3].href).toBe("/projects/sample/tasks");
  });
});
