"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestLectioSourceImport } from "@/lib/lectio/source-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
export function SourceImport({ projectId, files, operations }: { projectId: string;
  files: { id: string; name: string; size: number }[];
  operations: { id: string; name: string; state: string; result: Record<string, unknown> | null; error: string | null }[];
}) {
  const router = useRouter(), [fileId, setFileId] = useState(""), [pending, setPending] = useState(false), [error, setError] = useState(""), [queued, setQueued] = useState(false);
  return <section className="max-w-3xl space-y-3 rounded-xl border bg-card p-5">
    <h3 className="font-semibold">Send a source document</h3>
    <p className="text-sm text-muted-foreground">Share a selected project attachment with this Lectio team. Lectio imports its text and workflow without spending preparation credits. A translator chooses when to prepare it.</p>
    <form className="space-y-3" onSubmit={async e => {
      e.preventDefault(); if (!fileId || pending) return; setPending(true); setError(""); setQueued(false);
      try { const result = await requestLectioSourceImport(projectId, fileId); if ("error" in result) setError(result.error!); else { setQueued(true); router.refresh(); } }
      catch { setError("Could not share this document. Please retry."); } finally { setPending(false); }
    }}>
      <Label htmlFor="lectio-source">Project attachment</Label><select id="lectio-source" required value={fileId} className="min-h-11 w-full rounded-md border bg-background px-3 text-sm" onChange={e => { setFileId(e.target.value); setQueued(false); }}>
        <option value="">Choose a DOCX, ODT, or IDML file</option>{files.map(f => <option key={f.id} value={f.id}>{f.name} · {(f.size / 1048576).toFixed(1)} MB</option>)}
      </select>
      {!files.length ? <p className="text-sm text-muted-foreground">Add a supported file to this project’s attachments first. Source files must be 50 MB or smaller.</p> : null}
      <Button type="submit" className="min-h-11" disabled={!fileId || pending || queued}>{pending ? "Verifying and sharing…" : queued ? "Import queued" : "Share and import in Lectio"}</Button>
    </form>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {queued ? <p role="status" className="text-sm">The import is saved. Repeating this request renews file access without creating a duplicate document.</p> : null}
    {operations.length ? <ul className="space-y-2 border-t pt-3 text-sm">{operations.map(op => <li key={op.id}><span className="font-medium">{op.name}</span><p className="text-muted-foreground">{op.result?.status === "imported" ? "Imported in Lectio · awaiting preparation" : op.state === "parked" ? "Import stopped. Review the connection and account matches before sharing again." : op.error ? "Import needs attention. Open Lectio for details, or share this file again to renew access." : "Transfer and import pending. You can keep working."}</p></li>)}</ul> : null}
  </section>;
}
