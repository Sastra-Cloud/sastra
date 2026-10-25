"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectMatch } from "@/lib/lectio/protocol/project-matches";
export type ProjectConnectionChoice = { type: "new" } | { type: "existing"; projectId: string };
export function ProjectMatchDialog({ open, onClose, projects, error, teamName, allowNew = true, onRetry, onConfirm }: {
  open: boolean; onClose: () => void; projects: ProjectMatch[] | null; error: string | null; teamName: string;
  allowNew?: boolean; onRetry: () => void; onConfirm: (choice: ProjectConnectionChoice) => void;
}) {
  const [choice, setChoice] = useState(""), [search, setSearch] = useState("");
  const visible = projects?.filter(p => `${p.name || ""} ${p.sourceLanguage} ${p.targetLanguage} ${p.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="sm:max-w-xl"><DialogHeader>
    <DialogTitle>Connect to a Lectio project</DialogTitle><DialogDescription>Check for an existing project in {teamName || "the connected team"} before creating another. Suggestions require your confirmation.</DialogDescription>
  </DialogHeader><div className="min-w-0 space-y-4">
    {!projects && !error ? <p role="status" className="text-sm">Checking Lectio projects…</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error} <button type="button" className="underline" onClick={onRetry}>Retry</button></p> : null}
    {projects ? <><Input aria-label="Find an existing Lectio project" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find by title, language, or project ID" />
      <fieldset className="max-h-[35vh] space-y-2 overflow-y-auto"><legend className="mb-2 text-sm font-medium">Existing projects</legend>
        {visible?.length ? visible.slice(0, 50).map(p => <label key={p.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
          <input type="radio" name="lectio-project-choice" className="mt-1 shrink-0" checked={choice === p.id} onChange={() => setChoice(p.id)} /><span className="min-w-0"><span className="block break-words font-medium">{p.name || "Untitled project"}</span><span className="block break-words text-muted-foreground">{p.sourceLanguage} → {p.targetLanguage} · {p.id.slice(-8)}</span>{p.match === "same_title" || p.match === "similar_title" ? <span className="block text-xs text-muted-foreground">{p.match === "same_title" ? "Same title" : "Similar title"} — check the languages and project before connecting.</span> : null}</span>
        </label>) : <p className="text-sm text-muted-foreground">No available projects match this search.</p>}</fieldset>
      {visible && visible.length > 50 ? <p className="text-xs text-muted-foreground">Showing the first 50 results. Narrow your search to find another project.</p> : null}
      {allowNew ? <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"><input type="radio" name="lectio-project-choice" className="mt-1" checked={choice === "new"} onChange={() => setChoice("new")} /><span><span className="block font-medium">Create a separate Lectio project</span><span className="block text-muted-foreground">Use this when none of the existing projects is the right match.</span></span></label> : <p className="text-sm text-muted-foreground">Choose an existing project. Creating another project is not available for this connection.</p>}
    </> : null}
    <p className="text-xs text-muted-foreground">An existing project opens workflow mapping for review. Selecting it does not change its owner.</p>
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" className="min-h-11" disabled={!projects || !!error || !choice || (choice !== "new" && !projects.some(p => p.id === choice))} onClick={() => onConfirm(choice === "new" ? { type: "new" } : { type: "existing", projectId: choice })}>Continue with this choice</Button></div>
  </div></DialogContent></Dialog>;
}
