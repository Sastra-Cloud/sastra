"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { applyDefaultProjectPeople, previewDefaultProjectPeople, saveDefaultProjectPeople } from "@/lib/projects/people-actions";
import { confirmDialog } from "@/lib/dialog-requests";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";

type Preview = Awaited<ReturnType<typeof previewDefaultProjectPeople>>;

export function DefaultProjectPeople({ people, defaultIds }: {
  people: { id: string; name: string; image: string | null }[]; defaultIds: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(defaultIds);
  const [saved, setSaved] = useState(defaultIds);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [operation, setOperation] = useState<"save" | "preview" | "apply" | null>(null);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState("");
  const changed = [...selected].sort().join("\n") !== [...saved].sort().join("\n");

  async function save() {
    const names = people.filter(p => selected.includes(p.id)).map(p => p.name).join(", ");
    if (!(await confirmDialog(selected.length
      ? `Use these people as the default team for new projects: ${names}? They will receive project chat access when a project is created. Existing projects will stay unchanged.`
      : "Clear the default project team? New projects will start without a default team. Existing projects will stay unchanged."))) return;
    const ids = [...selected];
    setOperation("save");
    start(async () => {
      try {
        await saveDefaultProjectPeople(ids);
        setSaved(ids); setPreview(null); setStatus("Default project team saved."); router.refresh();
      } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the default project team."); }
    });
  }

  function review() {
    setOperation("preview");
    start(async () => {
      try { setPreview(await previewDefaultProjectPeople()); setStatus(""); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Could not preview the project update."); }
    });
  }

  function apply() {
    if (!preview) return;
    const reviewed = preview;
    setOperation("apply");
    start(async () => {
      try {
        const result = await applyDefaultProjectPeople(reviewed.fingerprint);
        setPreview(null); setStatus(`Added ${result.added} project memberships. Existing people and work roles were kept.`); router.refresh();
      } catch (error) { setPreview(null); toast.error(error instanceof Error ? error.message : "Could not update project people. Preview and try again."); }
    });
  }

  return <section id="default-project-team" className="scroll-mt-24 space-y-4 rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="default-project-team-heading" aria-busy={pending}>
    <div className="space-y-1">
      <h2 id="default-project-team-heading" className="text-base font-semibold">Default project team</h2>
      <p className="text-sm text-muted-foreground">Selected people are added to every new project, with access to its chats and shared chat files. Assign work roles separately when needed.</p>
    </div>
    <fieldset disabled={pending} className="space-y-2">
      <legend className="mb-2 text-sm font-medium">People added to new projects</legend>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => { setSelected(people.map(p => p.id)); setPreview(null); }}>Select everyone</Button>
        <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => { setSelected([]); setPreview(null); }}>Clear selection</Button>
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        {people.map(person => <label key={person.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
          <input type="checkbox" aria-label={person.name} checked={selected.includes(person.id)} className="size-4 shrink-0 accent-primary" onChange={e => {
            setSelected(current => e.target.checked ? [...current, person.id] : current.filter(id => id !== person.id)); setPreview(null); setStatus("");
          }} />
          <UserAvatar name={person.name} image={person.image} size="sm" />
          <span className="min-w-0 break-words text-sm">{person.name}</span>
        </label>)}
      </div>
    </fieldset>
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={save} disabled={pending || !changed} className="min-h-11 sm:min-h-9">Save default team</Button>
      <p className="text-sm text-muted-foreground">{selected.length} selected{changed ? " · Unsaved changes" : ""}</p>
    </div>
    <div className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-medium">Existing projects</h3>
      <p className="text-sm text-muted-foreground">Add the saved default team to all existing projects, including completed projects. This keeps other people, work roles, and management grants. To remove someone, open that project’s People tab.</p>
      <Button variant="outline" onClick={review} disabled={pending || changed || saved.length === 0} className="min-h-11 sm:min-h-9">Preview adding to existing projects</Button>
      {changed ? <p className="text-xs text-muted-foreground">Save your default team before previewing.</p> : null}
      {preview ? <div className="space-y-3 rounded-lg border p-3">
        <p className="text-sm font-medium">Add {preview.people.length} people to {preview.projectCount} projects?</p>
        <p className="break-words text-sm">{preview.people.map(p => p.name).join(", ")}</p>
        <p className="text-sm text-muted-foreground">They will be able to read each project’s existing chat history and files. People already in a project will not be duplicated. No one will be removed.</p>
        <div className="flex flex-wrap gap-2"><Button onClick={apply} disabled={pending || preview.projectCount === 0} className="min-h-11 sm:min-h-9">Confirm adding people</Button><Button variant="ghost" disabled={pending} onClick={() => setPreview(null)} className="min-h-11 sm:min-h-9">Cancel</Button></div>
      </div> : null}
    </div>
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{pending ? operation === "preview" ? "Preparing project update preview…" : operation === "apply" ? "Adding people to existing projects…" : "Saving default project team…" : status}</p>
    <p className="text-xs text-muted-foreground">New teammates are not selected automatically. Review this list after inviting someone. <Link className="text-primary underline underline-offset-4" href="/help?topic=projects">Project help</Link></p>
  </section>;
}
