"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectMatch } from "@/lib/lectio/protocol/project-matches";

export type ProjectConnectionChoice = { type: "new" } | { type: "existing"; projectId: string };
type Choice = ProjectConnectionChoice | { type: "local" };

export function ProjectMatchDialog({ open, onClose, projects, error, teamName, allowNew = true,
  newProjectBlockedReason, onConfigure, onCreateLocal, onRetry, onConfirm }: {
  open: boolean; onClose: () => void; projects: ProjectMatch[] | null; error: string | null; teamName: string;
  allowNew?: boolean; newProjectBlockedReason?: string | null; onConfigure?: () => void; onCreateLocal?: () => void;
  onRetry: () => void; onConfirm: (choice: ProjectConnectionChoice) => void;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [search, setSearch] = useState("");
  const visible = projects?.filter(p => `${p.name || ""} ${p.sourceLanguage} ${p.targetLanguage} ${p.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const canContinue = choice?.type === "local" ? !!onCreateLocal : !error && !!projects && (
    choice?.type === "new" ? allowNew : choice?.type === "existing" && projects.some(p => p.id === choice.projectId)
  );
  const optionClass = "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-primary";
  const newLabel = onCreateLocal ? "Create in Sastra and Lectio" : "Create a new Lectio project";

  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{onCreateLocal ? "Choose where to create this project" : "Connect to a Lectio project"}</DialogTitle>
        <DialogDescription>Check existing projects in {teamName || "the connected team"}, or choose to create a new project.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto">
        <fieldset className="space-y-3">
          <legend className="sr-only">Project creation options</legend>
          {onCreateLocal ? <label className={optionClass}>
            <input type="radio" name="lectio-project-choice" className="mt-1 shrink-0" checked={choice?.type === "local"} onChange={() => setChoice({ type: "local" })} />
            <span><span className="block font-medium">Create in Sastra only</span><span className="block text-muted-foreground">No Lectio project is created or connected. You can connect it later.</span></span>
          </label> : null}
          <div className="space-y-2">
            <label className={`${optionClass} ${!projects || !!error || !allowNew ? "cursor-default text-muted-foreground" : ""}`}>
              <input type="radio" name="lectio-project-choice" className="mt-1 shrink-0" disabled={!projects || !!error || !allowNew} checked={choice?.type === "new"} onChange={() => setChoice({ type: "new" })} />
              <span><span className="block font-medium">{newLabel}</span><span className="block text-muted-foreground">Create a new Lectio project using the reviewed team workflow.</span></span>
            </label>
            {projects && !error && !allowNew ? <div className="space-y-2 text-sm text-muted-foreground">
              <p>{newProjectBlockedReason === "previous_connection"
                ? "This project was previously connected. Choose its existing Lectio project to reconnect."
                : newProjectBlockedReason === "defaults_required"
                  ? "A Sastra administrator needs to set up the project template and Lectio workflow first."
                  : "A Lectio team administrator needs to allow project creation from Sastra in the team’s Security settings."}</p>
              {newProjectBlockedReason === "defaults_required" && onConfigure ? <Button type="button" variant="outline" onClick={onConfigure}>Set up connected projects</Button> : null}
              {newProjectBlockedReason !== "defaults_required" && newProjectBlockedReason !== "previous_connection" ? <Button type="button" variant="outline" onClick={onRetry}>Check creation access again</Button> : null}
            </div> : null}
          </div>
          {!projects && !error ? <p role="status" className="text-sm">Checking Lectio projects…</p> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error} <button type="button" className="underline" onClick={onRetry}>Retry</button></p> : null}
          {projects ? <div className="space-y-2">
            <p className="text-sm font-medium">Connect to an existing Lectio project</p>
            <Input aria-label="Find an existing Lectio project" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find by title, language, or project ID" />
            <div className="max-h-[30vh] space-y-2 overflow-y-auto">
              {visible?.length ? visible.slice(0, 50).map(p => <label key={p.id} className={optionClass}>
                <input type="radio" name="lectio-project-choice" className="mt-1 shrink-0" checked={choice?.type === "existing" && choice.projectId === p.id} onChange={() => setChoice({ type: "existing", projectId: p.id })} />
                <span className="min-w-0"><span className="block break-words font-medium">{p.name || "Untitled project"}</span><span className="block break-words text-muted-foreground">{p.sourceLanguage} → {p.targetLanguage} · {p.id.slice(-8)}</span>
                  {p.match === "same_title" || p.match === "similar_title" ? <span className="block text-xs text-muted-foreground">{p.match === "same_title" ? "Same title" : "Similar title"} — check the languages and project before connecting.</span> : null}
                </span>
              </label>) : <p className="text-sm text-muted-foreground">No available projects match this search.</p>}
            </div>
            {visible && visible.length > 50 ? <p className="text-xs text-muted-foreground">Showing the first 50 results. Narrow your search to find another project.</p> : null}
            <p className="text-xs text-muted-foreground">An existing project opens workflow mapping for review. Its owner stays the same.</p>
          </div> : null}
        </fieldset>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" className="min-h-11 whitespace-normal" disabled={!canContinue} onClick={() => {
          if (!canContinue || !choice) return;
          if (choice.type === "local") onCreateLocal?.(); else onConfirm(choice);
        }}>{choice?.type === "local" ? "Create in Sastra only" : choice?.type === "new" ? onCreateLocal ? "Create in both systems" : "Create Lectio project" : "Review existing project"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
