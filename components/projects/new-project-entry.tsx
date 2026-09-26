"use client";

import { createProject, type ProjectFormState } from "@/lib/projects/actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { confirmDialog } from "@/lib/dialog-requests";
import { ProjectDraftContext, projectDraftFormData, type ProjectDraft } from "./project-draft";
import { useActionState, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { useGuidance } from "@/components/guidance/guidance-provider";
import { NewProjectForm } from "@/components/projects/new-project-form";
import { NewProjectGuided } from "@/components/projects/new-project-guided";
import { Button } from "@/components/ui/button";

type Template = {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
};

type Props = {
  templates: Template[];
  defaultSourceLanguage: string | null;
  defaultTargetLanguage: string | null;
  defaultPlanTemplateKey: string | null;
};

/**
 * Chooses the guided step-by-step flow or the single-page expert form based on
 * the user's guidance preference, and lets either user cross over. Both paths
 * submit the same `createProject` action with the same fields.
 */
export function NewProjectEntry(props: Props) {
  const { enabled } = useGuidance();
  const [mode, setMode] = useState<"guided" | "form">(
    enabled ? "guided" : "form"
  );

  const router = useRouter();
  const [initialDraft] = useState<ProjectDraft>(() => ({
    title: "", description: "", kind: "book", videoProductionMode: "original",
    status: "planning", priority: "medium", printFundingStatus: "not_assessed",
    sourceLanguage: props.defaultSourceLanguage ?? "", targetLanguage: props.defaultTargetLanguage ?? "",
    startDate: "", dueDate: "", chapters: "",
    planTemplateId: (props.templates.find(t => t.key === props.defaultPlanTemplateKey) ?? props.templates.find(t => t.key === "book-translation"))?.id ?? "none",
  }));
  const [draft, setDraft] = useState(initialDraft);
  const [state, action, pending] = useActionState(async (previous: ProjectFormState): Promise<ProjectFormState> => {
    try { return await createProject(previous, projectDraftFormData(draft)); }
    catch (error) {
      if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
      return { error: "Could not create the project. Your details are still here; check your connection and try again." };
    }
  }, {});
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <ProjectDraftContext.Provider value={{ draft, setDraft, state, action, pending }}>
      <div className="space-y-4">
        <nav aria-label="Other ways to create a project" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {[{ href: "/projects/import", label: "Import from document" }, { href: "/projects/plan", label: "Plan with AI" }].map(method => (
            <Link key={method.href} href={method.href} className="text-primary underline underline-offset-4" onClick={async event => {
              if (pending) { event.preventDefault(); return; }
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
              event.preventDefault();
              if (dirty && !(await confirmDialog("Leave this creation form? Your unsaved project details will be lost."))) return;
              router.push(method.href);
            }}>{method.label}</Link>
          ))}
        </nav>
        {mode === "guided" ? <NewProjectGuided {...props} onUseForm={() => { if (!pending) setMode("form"); }} /> : <>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setMode("guided")}><Sparkles className="size-4" />Use guided setup</Button>
          </div>
          <NewProjectForm {...props} />
        </>}
      </div>
    </ProjectDraftContext.Provider>
  );
}
