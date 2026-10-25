"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestLectioAssignment } from "@/lib/lectio/assignment-actions";
import type { ProjectSnapshot } from "@/lib/lectio/protocol/contract";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
export function AssignmentRequest({ projectId, snapshot, people, operations }: {
  projectId: string; snapshot: ProjectSnapshot; people: { id: string; name: string }[];
  operations: { id: string; state: string; result: Record<string, unknown> | null; error: string | null }[];
}) {
  const router = useRouter();
  const [documentId, setDocumentId] = useState(""), [stepKey, setStepKey] = useState(""), [personId, setPersonId] = useState("");
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [queued, setQueued] = useState(false);
  const doc = snapshot.documents.find(d => d.id === documentId);
  const selectClass = "min-h-11 w-full rounded-md border bg-background px-3 text-sm";
  return <section className="max-w-3xl space-y-3 rounded-xl border bg-card p-5">
    <h3 className="font-semibold">Assign translation work</h3>
    <p className="text-sm text-muted-foreground">Choose a matched project teammate. Lectio applies routine assignments to unstarted work; conflicts stay unchanged and go to its project manager for review.</p>
    {people.length ? <form className="space-y-3" onSubmit={async e => {
      e.preventDefault(); if (pending) return; setPending(true); setError(""); setQueued(false);
      try {
        const result = await requestLectioAssignment(projectId, documentId, stepKey, personId, snapshot.version);
        if ("error" in result) setError(result.error!); else { setQueued(true); router.refresh(); }
      } catch { setError("Could not queue this assignment. Please retry."); }
      finally { setPending(false); }
    }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label htmlFor="assign-document">Document</Label><select id="assign-document" required className={selectClass} value={documentId} onChange={e => { setDocumentId(e.target.value); setStepKey(""); setQueued(false); }}><option value="">Choose document</option>{snapshot.documents.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="assign-step">Step</Label><select id="assign-step" required className={selectClass} value={stepKey} onChange={e => { setStepKey(e.target.value); setQueued(false); }}><option value="">Choose step</option>{snapshot.steps.filter(s => doc?.steps.some(d => d.key === s.key)).map(s => <option key={s.key} value={s.key}>{s.name}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="assign-person">Teammate</Label><select id="assign-person" required className={selectClass} value={personId} onChange={e => { setPersonId(e.target.value); setQueued(false); }}><option value="">Choose teammate</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      </div>
      <Button type="submit" className="min-h-11" disabled={pending || queued || !documentId || !stepKey || !personId}>{pending ? "Queuing assignment…" : queued ? "Assignment queued" : "Request assignment"}</Button>
    </form> : <p className="text-sm text-muted-foreground">Add project members and match their Lectio accounts in Settings → Lectio to assign work here.</p>}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {queued ? <p role="status" className="text-sm">The request is saved and will retry automatically if Lectio is unavailable. Sync now after delivery to see its assignment.</p> : null}
    {operations.length ? <ul className="space-y-1 border-t pt-3 text-sm text-muted-foreground">{operations.map(op => <li key={op.id}>{op.state === "pending" ? op.error ? "Assignment delivery is retrying." : "Assignment awaiting delivery." : op.result?.status === "review_required" ? "Assignment needs review in Lectio." : op.state === "done" ? "Assignment applied in Lectio." : "Assignment stopped. Review account matches and request it again."}</li>)}</ul> : null}
  </section>;
}
