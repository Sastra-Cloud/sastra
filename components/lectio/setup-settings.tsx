"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { listLectioSetup, saveLectioSetup } from "@/lib/lectio/actions";
import { parseProfile } from "@/lib/lectio/protocol/profile";

type Options = Exclude<Awaited<ReturnType<typeof listLectioSetup>>, { error: string }>;
const selectClass = "min-h-11 w-full rounded-md border bg-background px-3 text-sm";
export function SetupSettings({ connectionId }: { connectionId: string }) {
  const [options, setOptions] = useState<Options | null>(null), [pending, setPending] = useState(false);
  const [templateId, setTemplateId] = useState(""), [workflowId, setWorkflowId] = useState(""), [handoff, setHandoff] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({}), [kind, setKind] = useState<"book" | "article">("book");
  const [files, setFiles] = useState(false), [automatic, setAutomatic] = useState(false), [error, setError] = useState<string | null>(null);
  async function load() {
    setPending(true); setError(null);
    try {
      const result = await listLectioSetup(connectionId); if ("error" in result) throw new Error(result.error);
      setOptions(result); setAutomatic(result.autoCreate);
      try {
        const p = parseProfile(result.profile); setTemplateId(p.planTemplateId); setWorkflowId(p.teamWorkflowId); setHandoff(p.handoffPhaseTemplateId || "");
        setKind(p.kind); setFiles(p.deliverFiles); setMapping(Object.fromEntries(p.stageMap.map(m => [m.stepKey, m.phaseId || "ignore"])));
      } catch { /* New connection: require an explicit first mapping. */ }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load project defaults."); }
    finally { setPending(false); }
  }
  const workflow = options?.remote.find(t => t.id === workflowId), stages = options?.stages.filter(s => s.templateId === templateId) || [];
  async function save() {
    if (!workflow || pending) return;
    setPending(true); setError(null);
    try {
      const result = await saveLectioSetup(connectionId, { version: 1, planTemplateId: templateId, teamWorkflowId: workflowId, kind,
        deliverFiles: files, handoffPhaseTemplateId: handoff || null,
        stageMap: workflow.steps.map(s => ({ stepKey: s.key, phaseId: mapping[s.key] === "ignore" ? null : mapping[s.key] })) }, automatic);
      if ("error" in result) throw new Error(result.error); toast.success("Defaults saved. Existing project mappings and dates stay as reviewed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save project defaults."); }
    finally { setPending(false); }
  }
  return <div className="mt-4 space-y-4 border-t pt-4">
    <Button variant="outline" disabled={pending} onClick={load}>{pending && !options ? "Loading defaults…" : "Connected project defaults"}</Button>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {options ? <div className="space-y-4"><p className="text-sm text-muted-foreground">Review this mapping once for new connected projects. Each project retains its own mapping when these defaults change.</p>
      <div className="space-y-2"><Label htmlFor={`plan-${connectionId}`}>Sastra project template</Label><select id={`plan-${connectionId}`} className={selectClass} value={templateId} onChange={e => { setTemplateId(e.target.value); setMapping({}); setHandoff(""); }}><option value="">Choose a template</option>{options.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor={`workflow-${connectionId}`}>Lectio team workflow</Label><select id={`workflow-${connectionId}`} className={selectClass} value={workflowId} onChange={e => { setWorkflowId(e.target.value); setMapping({}); }}><option value="">Choose a workflow</option>{options.remote.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      {workflow && templateId ? workflow.steps.map(s => <div className="grid gap-2 sm:grid-cols-2 sm:items-center" key={s.key}><Label htmlFor={`default-${s.key}`}>{s.name}</Label><select id={`default-${s.key}`} className={selectClass} value={mapping[s.key] || ""} onChange={e => setMapping(m => ({ ...m, [s.key]: e.target.value }))}><option value="">Choose a phase</option><option value="ignore">Keep only in Lectio</option>{stages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>) : null}
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor={`kind-${connectionId}`}>Projects created from Lectio</Label><select id={`kind-${connectionId}`} className={selectClass} value={kind} onChange={e => setKind(e.target.value as "book" | "article")}><option value="book">Book</option><option value="article">Article</option></select></div>
      <div className="space-y-2"><Label htmlFor={`handoff-${connectionId}`}>Next publishing stage</Label><select id={`handoff-${connectionId}`} className={selectClass} value={handoff} onChange={e => setHandoff(e.target.value)}><option value="">Manage manually</option>{stages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div></div>
      <label className="flex items-start gap-3 text-sm"><input className="mt-1 size-4" type="checkbox" checked={files} onChange={e => setFiles(e.target.checked)} /><span>Deliver completed translations to the Sastra project and its next-stage tasks.</span></label>
      <label className="flex items-start gap-3 text-sm"><input className="mt-1 size-4" type="checkbox" checked={automatic} onChange={e => setAutomatic(e.target.checked)} /><span>Use this connection by default for new eligible Sastra projects, and accept new projects from this Lectio team. Project creators can opt out.</span></label>
      <Button disabled={pending || !templateId || !workflow || workflow.steps.some(s => !mapping[s.key])} onClick={save}>{pending ? "Saving defaults…" : "Save reviewed defaults"}</Button>
    </div> : null}
  </div>;
}
