"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { linkLectioProject, previewLectioProject, refreshLectioProject, resolveLectioReopen, disconnectLectioProject, previewLectioMapping, updateLectioMapping } from "@/lib/lectio/actions";
import { findLectioProjectMatches, createLectioProjectForReview } from "@/lib/lectio/match-actions";
import { Switch } from "@/components/ui/switch";
import { ProjectMatchDialog } from "./project-match-dialog";
import type { ProjectMatch } from "@/lib/lectio/protocol/project-matches";
import type { ProjectSnapshot } from "@/lib/lectio/protocol/contract";
type Props = {
  existingUnits: { id: string; name: string }[];
  projectId: string; canManage: boolean; phases: { id: string; name: string }[];
  projectName: string; sourceLanguage: string; targetLanguage: string;
  initialConnectionId?: string; initialRemoteProjectId?: string;
  connections: { id: string; teamName: string }[];
  link: { id: string; generation: number; state: string; href: string | null; lastAppliedAt: string | null; lastError: string | null; snapshot: ProjectSnapshot | null; reviewRequired: boolean } | null;
  reopens: { id: string; title: string }[];
};
const selectClass = "min-h-11 w-full rounded-md border bg-background px-3 text-sm";
export function ProjectTranslation({ projectId, projectName, sourceLanguage, targetLanguage, initialConnectionId, initialRemoteProjectId, canManage, existingUnits, phases, connections, link: providedLink, reopens }: Props) {
  const router = useRouter();
  const link = providedLink && ["active", "linking"].includes(providedLink.state) ? providedLink : null;
  const [connectionId, setConnectionId] = useState(connections.some(c => c.id === initialConnectionId) ? initialConnectionId! : connections.length === 1 ? connections[0].id : "");
  const [remoteId, setRemoteId] = useState(initialRemoteProjectId || ""), [setupOpen, setSetupOpen] = useState(!!initialRemoteProjectId);
  const [matchOpen, setMatchOpen] = useState(false), [matches, setMatches] = useState<ProjectMatch[] | null>(null), [matchError, setMatchError] = useState<string | null>(null), [allowNew, setAllowNew] = useState(true);
  const [preview, setPreview] = useState<ProjectSnapshot | null>(null), [mapping, setMapping] = useState<Record<string, string>>({});
  const [review, setReview] = useState<ProjectSnapshot | null>(null), [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [adoptions, setAdoptions] = useState<Record<string, string>>({});
  const [deliverFiles, setDeliverFiles] = useState(false);
  const [handoffPhaseId, setHandoffPhaseId] = useState("");
  const [pending, setPending] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  async function work(key: string, action: () => Promise<void>) {
    if (pending) return; setPending(key); setError(null);
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Could not complete this operation. Please retry."); }
    finally { setPending(null); }
  }
  async function checkMatches() {
    setSetupOpen(true);
    if (!connectionId) { setError("Choose the Lectio team before checking for existing projects."); return; }
    setMatchOpen(true); setMatches(null); setMatchError(null);
    try { const result = await findLectioProjectMatches(connectionId, { name: projectName, sourceLanguage, targetLanguage }, projectId);
      if ("error" in result) setMatchError(result.error!); else { setMatches(result.projects); setAllowNew(result.allowNew); }
    } catch { setMatchError("Could not check Lectio projects. Retry when connected."); }
  }
  async function loadPreview(id = remoteId) { await work("preview", async () => {
    const result = await previewLectioProject(projectId, connectionId, id);
    if ("error" in result) throw new Error(result.error); setPreview(result.snapshot!); setMapping({}); setAdoptions({});
  }); }
  async function linkProject() { if (!preview) return; await work("link", async () => {
    const result = await linkLectioProject(projectId, connectionId, remoteId,
      preview.steps.map(s => ({ stepKey: s.key, phaseId: mapping[s.key] === "ignore" ? null : mapping[s.key] })), handoffPhaseId || null, deliverFiles, Object.entries(adoptions).filter(([, unitId]) => unitId).map(([documentId, unitId]) => ({ documentId, unitId })));
    if ("error" in result) throw new Error(result.error); toast.success("Translation workflow connected"); router.refresh();
  }); }
  const snapshot = link?.snapshot;
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-1"><h2 className="text-xl font-semibold">Translation</h2>
      <p className="max-w-2xl text-sm text-muted-foreground">Lectio manages translation and review. Sastra keeps the publishing schedule and downstream work together.</p></div>
      {link ? <div className="flex flex-wrap gap-2">{link.href ? <Button nativeButton={false} render={<a href={link.href} target="_blank" rel="noopener noreferrer" />} variant="outline">Open in Lectio ↗</Button> : null}
        {canManage ? <Button variant="outline" disabled={pending === "sync" || link.reviewRequired} onClick={() => work("sync", async () => {
          const result = await refreshLectioProject(projectId); if ("error" in result) throw new Error(result.error);
          toast.success("prepared" in result && result.prepared ? "Lectio project is ready. Review mapping to finish connecting." : "Translation progress synchronized"); router.refresh();
        })}>{pending === "sync" ? "Synchronizing…" : "Sync now"}</Button> : null}</div> : null}</header>
    {canManage ? <section aria-label="Lectio project connection" className="space-y-2 rounded-xl border bg-card p-4"><div className="flex min-h-11 items-center justify-between gap-4"><Label htmlFor="project-connected-lectio">Connected to Lectio</Label><Switch id="project-connected-lectio" aria-label="Connected to Lectio" checked={!!link} disabled={!!pending} onCheckedChange={checked => checked ? void checkMatches() : setConfirmDisconnect(true)} /></div><p className="text-sm text-muted-foreground">{link ? link.reviewRequired ? "Finish reviewing workflow mapping before synchronization starts." : link.state === "linking" ? "Preparing the connection…" : "This project shares translation progress and schedules with Lectio." : "This project is not connected. Turn this on to review a possible match or create a separate Lectio project."}</p></section> : null}
    {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
    {link ? <>
      {canManage ? <div className="flex flex-wrap gap-2">
        {link.href && ["active", "linking"].includes(link.state) ? <Button variant="outline" disabled={pending === "mapping"} onClick={() => work("mapping", async () => {
          const result = await previewLectioMapping(projectId); if ("error" in result) throw new Error(result.error);
          setReview(result.snapshot); setMapping(Object.fromEntries(result.mapping.map(m => [m.stepKey, m.phaseId || "ignore"])));
        })}>{pending === "mapping" ? "Loading workflow…" : link.reviewRequired ? "Finish connecting: review mapping" : "Review workflow mapping"}</Button> : null}
      </div> : null}
      {confirmDisconnect ? <section className="space-y-3 rounded-lg border border-destructive/30 p-4" role="alert">
        <p className="text-sm">Disconnect this translation workflow? Sastra keeps its files, tasks, dates, and history. Translation tasks become editable here. Lectio keeps its project and translations.</p>
        <div className="flex gap-2"><Button variant="destructive" disabled={pending === "disconnect"} onClick={() => work("disconnect", async () => {
          const result = await disconnectLectioProject(projectId, { id: link.id, generation: link.generation }); if ("error" in result) throw new Error(result.error);
          setConfirmDisconnect(false); setPreview(null); setReview(null); setSetupOpen(false); setRemoteId(""); setMapping({}); setAdoptions({});
          toast.success("Project disconnected. Lectio will receive the change automatically."); router.refresh();
        })}>{pending === "disconnect" ? "Disconnecting…" : "Confirm disconnect"}</Button><Button variant="outline" onClick={() => setConfirmDisconnect(false)}>Cancel</Button></div>
      </section> : null}
      {review ? <section className="max-w-3xl space-y-4 rounded-xl border bg-card p-5"><h3 className="font-semibold">Review changed workflow</h3>
        <p className="text-sm text-muted-foreground">Keep the same phase to reuse its tasks and dates. A new phase creates new tasks; tasks from removed mappings stay in project history. This review sends no completion alerts.</p>
        {review.steps.map(s => <div key={s.key} className="grid gap-2 sm:grid-cols-2 sm:items-center"><Label htmlFor={`review-${s.key}`}>{s.name}</Label><select id={`review-${s.key}`} className={selectClass} value={mapping[s.key] || ""} onChange={e => setMapping(m => ({ ...m, [s.key]: e.target.value }))}>
          <option value="">Choose a phase</option><option value="ignore">Keep only in Lectio</option>{phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>)}
        <div className="flex gap-2"><Button disabled={pending === "save-mapping" || review.steps.some(s => !mapping[s.key])} onClick={() => work("save-mapping", async () => {
          const result = await updateLectioMapping(projectId, review.steps.map(s => ({ stepKey: s.key, phaseId: mapping[s.key] === "ignore" ? null : mapping[s.key] })), review.version);
          if ("error" in result) throw new Error(result.error); setReview(null); toast.success("Workflow mapping updated"); router.refresh();
        })}>{pending === "save-mapping" ? "Updating workflow…" : "Confirm mapping"}</Button><Button variant="outline" onClick={() => setReview(null)}>Cancel</Button></div>
      </section> : null}
      <div className="rounded-lg border bg-card p-4 text-sm"><p className="font-medium">{link.state === "active" ? "Connected to Lectio" : link.state === "linking" ? "Connection is being prepared" : "Source project is no longer connected"}</p>
        <p className="mt-1 text-muted-foreground">{link.lastAppliedAt ? `Last synchronized ${new Date(link.lastAppliedAt).toLocaleString()}` : "Waiting for the first complete workflow snapshot."}</p>
        {link.lastError ? <p className="mt-2 text-destructive">Synchronization needs attention. Review the connection and workflow mapping, then retry.</p> : null}
        {snapshot?.allRequiredWorkComplete ? <p className="mt-2 font-medium text-success">Translation work is complete. Review the next publishing stage; the Sastra project remains open.</p> : null}</div>
      {reopens.map(task => <section key={task.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-warning/40 p-4">
        <div><h3 className="font-medium">{task.title}</h3><p className="text-sm text-muted-foreground">This work reopened in Lectio. Review any downstream work before changing the Sastra task.</p></div>
        {canManage ? <div className="flex gap-2">{(["reopen", "keep"] as const).map(decision => <Button key={decision} variant="outline" disabled={pending === task.id} onClick={() => work(task.id, async () => {
          const result = await resolveLectioReopen(projectId, task.id, decision, snapshot!.version); if ("error" in result) throw new Error(result.error); router.refresh();
        })}>{decision === "reopen" ? "Reopen Sastra task" : "Keep completed"}</Button>)}</div> : null}</section>)}
      {snapshot ? <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><caption className="sr-only">Translation progress by document and workflow step</caption>
        <thead className="bg-muted/40"><tr><th className="min-w-48 p-3">Document</th>{snapshot.steps.map(s => <th className="min-w-32 p-3" key={s.key}>{s.name}</th>)}</tr></thead>
        <tbody>{snapshot.documents.map(doc => <tr key={doc.id} className="border-t"><th scope="row" className="p-3 font-medium"><a className="text-primary hover:underline" href={`${link.href}?documentId=${encodeURIComponent(doc.id)}`} target="_blank" rel="noopener noreferrer">{doc.name}</a><p className="mt-1 font-normal text-muted-foreground">{doc.sourceWordCount.toLocaleString()} words</p></th>
          {doc.steps.map(s => <td key={s.key} className="p-3 align-top"><span className={s.state === "completed" ? "text-success" : s.state === "active" ? "font-medium" : "text-muted-foreground"}>{s.state === "completed" ? "Complete" : s.state === "active" ? "In progress" : "Not started"}</span>
            {s.assigneeIds.length ? <p className="mt-1 text-xs text-muted-foreground">{s.assigneeIds.map(id => snapshot.people.find(p => p.id === id)?.name).filter(Boolean).join(", ")}</p> : null}</td>)}</tr>)}</tbody></table>
        {!snapshot.documents.length ? <p className="p-6 text-sm text-muted-foreground">Upload the first document in Lectio to see its translation stages here.</p> : null}</div> : null}
    </> : canManage && setupOpen ? <section className="max-w-3xl space-y-4 rounded-xl border bg-card p-5">
      <h3 className="font-semibold">Review the project connection</h3>
      {!connections.length ? <p className="text-sm text-muted-foreground">Ask a workspace administrator to connect a Lectio team in Settings → Lectio.</p> : <>
        <div className="space-y-2"><Label htmlFor="translation-team">Lectio team</Label><select id="translation-team" value={connectionId} className={selectClass} onChange={e => { setConnectionId(e.target.value); setRemoteId(""); setPreview(null); }}>
          <option value="">Choose a team</option>
          {connections.map(c => <option key={c.id} value={c.id}>{c.teamName}</option>)}</select></div>
        <Button variant="outline" disabled={!connectionId || !!pending} onClick={() => void checkMatches()}>Check existing Lectio projects</Button>
        {remoteId && !preview ? <Button className="ml-2" disabled={!connectionId || !!pending} variant="outline" onClick={() => void loadPreview()}>{pending === "preview" ? "Loading workflow…" : "Review the selected Lectio project"}</Button> : null}
        {preview ? <div className="space-y-4 border-t pt-4"><h4 className="font-medium">Match translation stages to Sastra phases</h4>
          <p className="text-sm text-muted-foreground">Several Lectio steps can share one Sastra phase. That phase finishes when all its steps finish. Choose “Keep only in Lectio” for steps you do not want represented by a Sastra task.</p>
          {preview.steps.map(s => <div key={s.key} className="grid gap-2 sm:grid-cols-2 sm:items-center"><Label htmlFor={`stage-${s.key}`}>{s.name}</Label><select id={`stage-${s.key}`} className={selectClass} value={mapping[s.key] || ""} onChange={e => setMapping(m => ({ ...m, [s.key]: e.target.value }))}>
            <option value="">Choose a phase</option><option value="ignore">Keep only in Lectio</option>{phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>)}
          <div className="space-y-2"><Label htmlFor="translation-handoff">Next publishing stage</Label><select id="translation-handoff" className={selectClass} value={handoffPhaseId} onChange={e => setHandoffPhaseId(e.target.value)}>
            <option value="">Manage the handoff manually</option>{phases.filter(p => !Object.values(mapping).includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <p className="text-xs text-muted-foreground">Creates one task per document in this phase. New translation completions notify its coordinator and fill an empty deadline; existing dates stay as set.</p></div>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4" checked={deliverFiles} onChange={e => setDeliverFiles(e.target.checked)} /><span>Deliver completed translations to Sastra. Files attach to this project and its next-stage tasks. IDML sources deliver a DOCX translation; native IDML exports remain in Lectio.</span></label>
          {existingUnits.length && preview.documents.length ? <fieldset className="space-y-3"><legend className="text-sm font-medium">Reuse existing project units</legend>
            <p className="text-sm text-muted-foreground">Choose an existing unit for each matching document, or create a new one. A single existing task in each mapped phase is reused with its dates, comments, time, and financial history. Lectio takes over its progress and assignment. Ambiguous task matches require review.</p>
            {preview.documents.map(doc => <div key={doc.id} className="grid gap-2 sm:grid-cols-2"><Label htmlFor={`adopt-${doc.id}`}>{doc.name}</Label><select id={`adopt-${doc.id}`} className={selectClass} value={adoptions[doc.id] || ""} onChange={e => setAdoptions(old => ({ ...old, [doc.id]: e.target.value }))}><option value="">Create a new unit</option>{existingUnits.filter(u => adoptions[doc.id] === u.id || !Object.values(adoptions).includes(u.id)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>)}
          </fieldset> : null}
          <p className="rounded-lg bg-muted/40 p-3 text-sm">This connects {preview.documents.length} documents using the selected existing units or new units. Dates and project status are preserved. Initial imported history sends no work notifications.</p>
          <Button disabled={pending === "link" || preview.steps.some(s => !mapping[s.key]) || !Object.values(mapping).some(v => v !== "ignore")} onClick={linkProject}>{pending === "link" ? "Connecting workflow…" : "Confirm mapping and connect"}</Button>
        </div> : null}
      </>}
    </section> : <p className="text-sm text-muted-foreground">This project has no connected translation workflow yet.</p>}
    {matchOpen ? <ProjectMatchDialog open onClose={() => setMatchOpen(false)} projects={matches} error={matchError} teamName={connections.find(c => c.id === connectionId)?.teamName || ""} allowNew={allowNew} onRetry={() => void checkMatches()} onConfirm={choice => {
      setMatchOpen(false);
      if (choice.type === "existing") { setRemoteId(choice.projectId); void loadPreview(choice.projectId); }
      else void work("create", async () => { const result = await createLectioProjectForReview(projectId, connectionId); if ("error" in result) throw new Error(result.error); toast.success("Connection queued. Review workflow mapping after the Lectio project is ready."); router.refresh(); });
    }} /> : null}
  </div>;
}
