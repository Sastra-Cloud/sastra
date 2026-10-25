"use client";

import { createProject, type ProjectFormState } from "@/lib/projects/actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { confirmDialog } from "@/lib/dialog-requests";
import { ProjectDraftContext, projectDraftFormData, type ProjectDraft } from "./project-draft";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

import { useGuidance } from "@/components/guidance/guidance-provider";
import { NewProjectForm } from "@/components/projects/new-project-form";
import { NewProjectGuided } from "@/components/projects/new-project-guided";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ProjectMatchDialog, type ProjectConnectionChoice } from "@/components/lectio/project-match-dialog";
import { findLectioProjectMatches } from "@/lib/lectio/match-actions";
import type { ProjectMatch } from "@/lib/lectio/protocol/project-matches";

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
  lectioOptions?: { id: string; teamName: string; templateId: string | null; automatic: boolean }[];
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
  const defaults = props.lectioOptions || [];
  const [syncLectio, setSyncLectio] = useState(defaults.length > 0);
  const [lectioConnectionId, setLectioConnectionId] = useState(defaults.length === 1 ? defaults[0].id : "");
  const [matchOpen, setMatchOpen] = useState(false), [matches, setMatches] = useState<ProjectMatch[] | null>(null), [matchError, setMatchError] = useState<string | null>(null);
  const checkingMatches = useRef(false);
  const [allowNewMatch, setAllowNewMatch] = useState(false);
  const reviewChoice = useRef<{ key: string; choice: ProjectConnectionChoice } | null>(null);
  const [initialDraft] = useState<ProjectDraft>(() => ({
    title: "", description: "", kind: "book", videoProductionMode: "original",
    status: "planning", priority: "medium", printFundingStatus: "not_assessed",
    sourceLanguage: props.defaultSourceLanguage ?? "", targetLanguage: props.defaultTargetLanguage ?? "",
    startDate: "", dueDate: "", chapters: "",
    planTemplateId: (defaults.length === 1 ? defaults[0].templateId : null) ?? (props.templates.find(t => t.key === props.defaultPlanTemplateKey) ?? props.templates.find(t => t.key === "book-translation"))?.id ?? "none",
  }));
  const [draft, setDraft] = useState(initialDraft);
  const reviewKey = JSON.stringify([lectioConnectionId, draft.title, draft.sourceLanguage, draft.targetLanguage, draft.planTemplateId]);
  async function checkMatches() {
    if (checkingMatches.current) return;
    checkingMatches.current = true;
    setMatchOpen(true); setMatches(null); setMatchError(null);
    try { const result = await findLectioProjectMatches(lectioConnectionId, { name: draft.title, sourceLanguage: draft.sourceLanguage, targetLanguage: draft.targetLanguage });
      if ("error" in result) setMatchError(result.error!); else { setMatches(result.projects); setAllowNewMatch(result.allowNew); }
    } catch { setMatchError("Could not check existing projects. Your project details are still here."); }
    finally { checkingMatches.current = false; }
  }
  const [state, action, pending] = useActionState(async (previous: ProjectFormState): Promise<ProjectFormState> => {
    try {
      const connect = syncLectio && ["book", "article"].includes(draft.kind);
      if (connect && !lectioConnectionId) return { error: "Choose the Lectio team for this project." };
      if (connect && (!draft.title.trim() || !draft.sourceLanguage || !draft.targetLanguage)) return { error: "Add a title and both languages before checking for existing projects." };
      if (connect && reviewChoice.current?.key !== reviewKey) { await checkMatches(); return {}; }
      const data = projectDraftFormData(draft); data.set("lectioConnectionId", connect ? lectioConnectionId : "none");
      if (connect && reviewChoice.current) { data.set("lectioChoice", reviewChoice.current.choice.type); if (reviewChoice.current.choice.type === "existing") data.set("lectioRemoteProjectId", reviewChoice.current.choice.projectId); }
      const result = await createProject(previous, data); reviewChoice.current = null; return result;
    }
    catch (error) {
      reviewChoice.current = null;
      if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
      return { error: "Could not create the project. Your details are still here; check your connection and try again." };
    }
  }, {});
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft) || syncLectio !== (defaults.length > 0) || lectioConnectionId !== (defaults.length === 1 ? defaults[0].id : "");
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <ProjectDraftContext.Provider value={{ draft, setDraft, state, action, pending, onSubmit: event => {
      if (syncLectio && ["book", "article"].includes(draft.kind) && lectioConnectionId && draft.title.trim() && draft.sourceLanguage && draft.targetLanguage && reviewChoice.current?.key !== reviewKey) {
        event.preventDefault(); void checkMatches();
      }
    } }}>
      <div className="space-y-4">
        {props.lectioOptions?.length && ["book", "article"].includes(draft.kind) ? <div className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3"><label htmlFor="new-project-lectio-connected" className="text-sm font-medium">Connected to Lectio</label><Switch id="new-project-lectio-connected" aria-label="Connected to Lectio" checked={syncLectio} disabled={pending} onCheckedChange={setSyncLectio} /></div>
          {syncLectio ? <><label htmlFor="new-project-lectio" className="text-sm font-medium">Lectio team</label>
          <select id="new-project-lectio" disabled={pending} className="min-h-11 w-full rounded-md border bg-background px-3 text-sm" value={lectioConnectionId} onChange={e => {
            const id = e.target.value; setLectioConnectionId(id);
            const option = props.lectioOptions?.find(c => c.id === id); if (option?.templateId) setDraft(d => ({ ...d, planTemplateId: option.templateId! }));
          }}><option value="">Choose a team</option>{props.lectioOptions.map(c => <option key={c.id} value={c.id}>{c.teamName}</option>)}</select>
          <p className="text-xs text-muted-foreground">Before creating this project, check Lectio for an existing match or choose to create a separate project.</p></> : <p className="text-xs text-muted-foreground">Create this project in Sastra without connecting it to Lectio.</p>}
        </div> : null}
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
      {matchOpen ? <ProjectMatchDialog open onClose={() => setMatchOpen(false)} projects={matches} error={matchError} teamName={props.lectioOptions?.find(c => c.id === lectioConnectionId)?.teamName || ""} allowNew={allowNewMatch} onRetry={() => void checkMatches()} onConfirm={choice => {
        reviewChoice.current = { key: reviewKey, choice }; setMatchOpen(false); startTransition(() => action());
      }} /> : null}
    </ProjectDraftContext.Provider>
  );
}
