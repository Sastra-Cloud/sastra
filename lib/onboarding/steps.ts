import { canManage, isAdminRole } from "@/lib/auth/policy";

export type OnboardingSignals = {
  completedTaskCount: number;
  assignedTaskCount: number;
  standupCount: number;
  hasStandup: boolean;
  workspaceConfirmed: boolean;
  projectSlug: string | null;
  budgetProjectSlug: string | null;
  hasTeammate: boolean;
  hasAssignedWork: boolean;
};

export type OnboardingStep = {
  key: string;
  label: string;
  href: string;
} & ({ type: "visit" } | { type: "outcome"; complete: boolean });

export function onboardingSteps(role: string, signals: OnboardingSignals): OnboardingStep[] {
  if (isAdminRole(role)) return [
    { key: "workspace", label: "Confirm workspace defaults", href: "/settings/workspace", type: "outcome", complete: signals.workspaceConfirmed },
    { key: "project", label: "Create a project", href: "/projects/new", type: "outcome", complete: !!signals.projectSlug },
    { key: "team", label: "Invite a teammate", href: "/settings/team", type: "outcome", complete: signals.hasTeammate },
    { key: "assign", label: "Assign work", href: signals.projectSlug ? `/projects/${signals.projectSlug}/tasks` : "/projects/new", type: "outcome", complete: signals.hasAssignedWork },
  ];
  const steps: OnboardingStep[] = [
    { key: "work", label: "Open My Work", href: "/tasks", type: "visit" },
  ];
  if (signals.assignedTaskCount > 0 || signals.completedTaskCount > 0) steps.push({ key: "task", label: "Finish your first task", href: "/tasks", type: "outcome", complete: signals.completedTaskCount > 0 });
  if (signals.hasStandup) steps.push({ key: "standup", label: "Answer a team check-in", href: "/standups", type: "outcome", complete: signals.standupCount > 0 });
  if (canManage(role)) {
    if (signals.budgetProjectSlug) steps.push({ key: "budget", label: "Open a project's budget", href: `/projects/${signals.budgetProjectSlug}/budget`, type: "visit" });
    steps.push({ key: "schedule", label: "Review the schedule", href: "/schedule", type: "visit" });
  }
  steps.push({ key: "guide", label: "Read Getting started", href: "/help#getting-started", type: "visit" });
  return steps;
}

export function onboardingStepComplete(step: OnboardingStep, dismissed: (key: string) => boolean): boolean {
  return step.type === "outcome" ? step.complete : dismissed(`onboarding:item:${step.key}`);
}
