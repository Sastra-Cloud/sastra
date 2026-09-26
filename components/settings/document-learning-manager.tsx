"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BookOpenCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { confirmDialog } from "@/lib/dialog-requests";
import { setDocumentLearningEnabled, setDocumentCaseEnabled, removeDocumentCase } from "@/lib/document-learning/actions";
import { contributeDocumentCase } from "@/lib/document-learning/actions";
import { SHARED_FIELDS, SHARED_INTERPRETATIONS, suggestedSharedCues, type SharedDocumentRule } from "@/lib/document-learning/shared-rules";

type Case = {
  id: string;
  workflow: string;
  source: string;
  sourceName: string | null;
  sourceText: string | null;
  enabled: boolean;
  corrected: Record<string, unknown>;
  createdAt: Date;
  cloudSubmittedAt: Date | null;
};

const LABELS: Record<string, string> = {
  agreement: "Agreement or funding document", invoice: "Invoice",
  rights_agreement: "Email rights agreement", rights_receipt: "License fee receipt",
  print_quote: "Print quote",
};

export function DocumentLearningManager({ enabled: initialEnabled, canPause, canShare, cases: initialCases }: {
  enabled: boolean; canPause: boolean; canShare: boolean; cases: Case[];
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [cases, setCases] = useState(initialCases);
  const [workspacePending, setWorkspacePending] = useState(false);
  const [pendingCases, setPendingCases] = useState<Set<string>>(new Set());

  async function changeWorkspace(value: boolean) {
    if (workspacePending) return;
    const previous = enabled;
    setEnabled(value);
    setWorkspacePending(true);
    try { await setDocumentLearningEnabled(value); }
    catch { setEnabled(previous); toast.error("Could not change document learning."); }
    finally { setWorkspacePending(false); }
  }

  async function changeCase(id: string, value: boolean) {
    if (pendingCases.has(id)) return;
    const previous = cases.find((row) => row.id === id)?.enabled;
    if (previous === undefined) return;
    setCases((rows) => rows.map((row) => row.id === id ? { ...row, enabled: value } : row));
    setPendingCases((ids) => new Set(ids).add(id));
    try { await setDocumentCaseEnabled(id, value); }
    catch {
      setCases((rows) => rows.map((row) => row.id === id ? { ...row, enabled: previous } : row));
      toast.error("Could not update this example.");
    } finally { setPendingCases((ids) => { const next = new Set(ids); next.delete(id); return next; }); }
  }

  async function remove(id: string) {
    if (pendingCases.has(id)) return;
    if (!(await confirmDialog("Remove this reviewed example? It will no longer guide future intake.", { destructive: true }))) return;
    const index = cases.findIndex((row) => row.id === id);
    const previous = cases[index];
    if (!previous) return;
    setCases((rows) => rows.filter((row) => row.id !== id));
    try { await removeDocumentCase(id); }
    catch {
      setCases((rows) => {
        if (rows.some((row) => row.id === id)) return rows;
        const restored = [...rows]; restored.splice(index, 0, previous); return restored;
      });
      toast.error("Could not remove this example.");
    }
  }

  return <div className="space-y-5">
    <header className="space-y-1">
      <h2 className="font-heading text-xl font-medium">Document learning</h2>
      <p className="text-sm text-muted-foreground">Reviewed documents can guide the next extraction of the same kind. Every result still needs your review.</p>
    </header>
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Workspace learning</h3>
          <p className="text-sm text-muted-foreground">{enabled ? "Active examples are used for new document reads." : "Paused. Existing examples are kept but not used."}</p>
        </div>
        {canPause ? <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={enabled} disabled={workspacePending} onCheckedChange={(value) => changeWorkspace(value === true)} /> Enabled</label> : <span className="text-sm text-muted-foreground">{enabled ? "Enabled" : "Paused by an admin"}</span>}
      </div>
    </section>
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="font-medium">Reviewed examples</h3><p className="text-sm text-muted-foreground">Only reviews approved after learning was enabled appear here.</p></div>
        <Button nativeButton={false} render={<Link href="/projects/import" />} variant="outline" size="sm">Upload an example</Button>
      </div>
      {cases.length ? cases.map((item) => <article key={item.id} className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="font-medium">{LABELS[item.workflow] ?? item.workflow}</p><p className="flex flex-wrap gap-x-1 text-sm text-muted-foreground"><span className="break-all">{item.sourceName ?? "Reviewed document"}</span><span>· {item.source.replaceAll("_", " ")} · {new Date(item.createdAt).toLocaleDateString()}</span></p></div>
          <div className="flex items-center gap-2"><label className="flex min-h-9 items-center gap-2 text-sm"><Checkbox checked={item.enabled} disabled={pendingCases.has(item.id)} onCheckedChange={(value) => changeCase(item.id, value === true)} /> Active</label><Button type="button" size="icon" variant="ghost" aria-label="Remove example" disabled={pendingCases.has(item.id)} onClick={() => remove(item.id)}><Trash2 className="size-4" /></Button></div>
        </div>
        <details className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-sm"><summary className="cursor-pointer">Corrected fields</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(item.corrected, null, 2)}</pre></details>
        {canShare ? <CloudContribution item={item} /> : null}
      </article>) : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground"><BookOpenCheck className="mx-auto mb-2 size-6" />No reviewed examples yet. Upload a document and save it as a teaching example, or approve a regular import.</div>}
    </section>
  </div>;
}

function CloudContribution({ item }: { item: Case }) {
  const workflow = item.workflow as SharedDocumentRule["workflow"];
  const cues = SHARED_FIELDS[workflow] ? suggestedSharedCues(workflow, `${item.sourceName ?? ""}\n${item.sourceText ?? ""}`) : [];
  const fields = SHARED_FIELDS[workflow] ?? [];
  const [cue, setCue] = useState<string>(cues[0] ?? "");
  const [field, setField] = useState<string>(fields[0] ?? "");
  const [interpretation, setInterpretation] = useState<SharedDocumentRule["interpretation"]>("read_value_after_cue");
  const [submitted, setSubmitted] = useState(!!item.cloudSubmittedAt);
  const [sending, setSending] = useState(false);
  if (submitted) return <p className="mt-3 text-xs text-muted-foreground">Submitted for Sastra Cloud review. Local learning is unchanged.</p>;
  if (!item.enabled || !cues.length) return null;
  const payload: SharedDocumentRule = { schemaVersion: 1, workflow, cue, field, interpretation };
  return <details className="mt-3 rounded-md border px-3 py-2 text-sm">
    <summary className="cursor-pointer">Share a generalized lesson with Sastra Cloud</summary>
    <p className="mt-2 text-xs text-muted-foreground">Choose a cue and field. The exact JSON below is the complete submission; your file, passages, names, dates, amounts, and workspace identity are excluded.</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <label className="space-y-1 text-xs">Cue<select className="w-full rounded-md border bg-background p-2" value={cue} onChange={(event) => setCue(event.target.value)}>{cues.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="space-y-1 text-xs">Field<select className="w-full rounded-md border bg-background p-2" value={field} onChange={(event) => setField(event.target.value)}>{fields.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="space-y-1 text-xs">Interpretation<select className="w-full rounded-md border bg-background p-2" value={interpretation} onChange={(event) => setInterpretation(event.target.value as SharedDocumentRule["interpretation"])}>{SHARED_INTERPRETATIONS.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
    </div>
    <pre className="mt-3 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(payload, null, 2)}</pre>
    <Button className="mt-3" size="sm" disabled={sending} onClick={async () => {
      setSending(true);
      try {
        const result = await contributeDocumentCase(item.id, payload);
        if (result.error) throw new Error(result.error);
        setSubmitted(true); toast.success("Lesson submitted for Cloud review.");
      } catch (error) { toast.error(error instanceof Error ? error.message : "Could not submit this lesson."); }
      finally { setSending(false); }
    }}>{sending ? "Submitting…" : "Submit this payload"}</Button>
  </details>;
}
