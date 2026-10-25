"use client";

import { createContext, useContext } from "react";
import { can, canInProject } from "@/lib/auth/policy";

type ManagementContext = { userId: string; role: string; managedProjectIds: string[] };
const Context = createContext<ManagementContext | null>(null);

export function ProjectManagementProvider({ children, ...value }: ManagementContext & { children: React.ReactNode }) {
  return <Context value={value}>{children}</Context>;
}

/** Display hints only. Each server mutation independently checks current grants. */
export function useProjectManagement(projectId: string | null | undefined, fallback: boolean) {
  const context = useContext(Context);
  return {
    canManageProject: context ? canInProject(context.role, "tasks.manage", projectId, context.managedProjectIds) : fallback,
    canManageWorkspace: context ? can(context.role, "workspace.manage") : fallback,
    currentUserId: context?.userId,
  };
}
