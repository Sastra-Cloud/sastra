export type ConversationMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ProposedTask = {
  name: string;
  description?: string;
  roleKey?: string;
  offsetDays?: number;
  isPerUnit?: boolean;
};

export type ProposedPhase = {
  name: string;
  /** The coordinator role for this stage (project_roles.key). */
  roleKey?: string;
  durationDays?: number;
  tasks: ProposedTask[];
};

export type ProposedPlan = {
  projectTitle: string;
  summary?: string;
  assumptions?: string[];
  risks?: string[];
  suggestedUnits: string[];
  suggestedRoles: string[];
  phases: ProposedPhase[];
};
