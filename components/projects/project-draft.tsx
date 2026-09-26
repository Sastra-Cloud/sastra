"use client";

import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { ProjectFormState } from "@/lib/projects/actions";
import type { ProjectKind } from "@/lib/projects/kinds";

export type ProjectDraft = {
  title: string; description: string; kind: ProjectKind; videoProductionMode: string;
  status: string; priority: string; printFundingStatus: string;
  sourceLanguage: string; targetLanguage: string; startDate: string; dueDate: string;
  planTemplateId: string; chapters: string;
};
export const ProjectDraftContext = createContext<{
  state: ProjectFormState; action: () => void; pending: boolean;
  draft: ProjectDraft; setDraft: Dispatch<SetStateAction<ProjectDraft>>;
} | null>(null);

export function useProjectDraft() {
  const context = useContext(ProjectDraftContext);
  if (!context) throw new Error("Project creation requires a shared draft");
  return context;
}

export function useDraftField<K extends keyof ProjectDraft>(key: K): [ProjectDraft[K], (value: ProjectDraft[K]) => void] {
  const { draft, setDraft } = useProjectDraft();
  return [draft[key], value => setDraft(current => ({ ...current, [key]: value }))];
}

export function projectDraftFormData(draft: ProjectDraft): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(draft)) data.set(key, value);
  return data;
}
