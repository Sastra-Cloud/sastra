"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { listLectioAudit, reapproveLectioConnection } from "@/lib/lectio/ownership-actions";

export function ConnectionOwnership({ connectionId, approvedBy }: { connectionId: string; approvedBy: string | null }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<Awaited<ReturnType<typeof listLectioAudit>> | null>(null);
  return <div className="mt-4 space-y-3 border-t pt-4">
    <p className="text-sm text-muted-foreground">Connection administrator: {approvedBy || "Approval needs review"}. Reapproval keeps project links and records the current administrator. It does not change team or project ownership.</p>
    {confirm ? <div className="space-y-3 rounded-lg border p-3"><p className="text-sm">Approve this existing team connection using your administrator account?</p><div className="flex flex-wrap gap-2"><Button disabled={pending} onClick={async () => {
      if (pending) return; setPending(true); setError(null);
      try { const result = await reapproveLectioConnection(connectionId); if ("error" in result) throw new Error(result.error); setConfirm(false); setEvents(null); router.refresh(); }
      catch (error) { setError(error instanceof Error ? error.message : "Could not approve connection."); } finally { setPending(false); }
    }}>{pending ? "Approving connection…" : "Approve connection as me"}</Button><Button variant="outline" disabled={pending} onClick={() => setConfirm(false)}>Cancel</Button></div></div> : <Button variant="outline" onClick={() => setConfirm(true)}>Review administrator approval</Button>}
    <div><Button variant="ghost" disabled={pending} onClick={async () => {
      setPending(true); setError(null);
      try { setEvents(await listLectioAudit(connectionId)); } catch { setError("Could not load connection history. Try again."); } finally { setPending(false); }
    }}>View connection history</Button></div>
    {events ? <ol className="space-y-2 text-sm">{events.length ? events.map(event => <li key={event.id} className="rounded-lg border p-3"><p>{event.action.replace(/^lectio_/, "").replaceAll("_", " ")} · {event.actorName || "Former teammate"} · {new Date(event.createdAt).toLocaleString()}</p><details className="mt-1 text-xs text-muted-foreground"><summary>Change details</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify({ actorId: event.actorId, changes: event.data }, null, 2)}</pre></details></li>) : <li>No connection changes recorded yet.</li>}</ol> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </div>;
}
