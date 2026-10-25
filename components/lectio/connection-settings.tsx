"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PeopleSettings } from "./people-settings";
import { SetupSettings } from "./setup-settings";
import { ConnectionOwnership } from "./connection-ownership";
import { rotateLectioConnectionKeys, setLectioConnectionState } from "@/lib/lectio/actions";

type Connection = { id: string; origin: string; teamName: string; state: string; lastSuccessAt: string | null; approvedBy: string | null };
export function ConnectionSettings({ connections }: { connections: Connection[] }) {
  const router = useRouter();
  const [disconnect, setDisconnect] = useState<string | null>(null);
  const [origin, setOrigin] = useState(""), [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    setPending("connect"); setError(null);
    try {
      const response = await fetch("/api/integrations/lectio/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origin }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not begin connection setup.");
      window.location.assign(result.redirect);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not connect."); setPending(null); }
  }
  async function change(id: string, state: "paused" | "active" | "revoked") {
    if (pending) return; setPending(id);
    try {
      const result = await setLectioConnectionState(id, state);
      if ("error" in result) throw new Error(result.error);
      setDisconnect(null);
      toast.success(state === "revoked" ? "Disconnected. Existing projects and history are preserved." : state === "paused" ? "Synchronization paused" : "Synchronization resumed"); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update connection."); }
    finally { setPending(null); }
  }
  return <div className="max-w-3xl space-y-6">
    {connections.filter(c => c.state !== "revoked").map(c => <section key={c.id} className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 space-y-1">
        <h3 className="font-semibold">{c.teamName}</h3><p className="break-all text-sm text-muted-foreground">{c.origin}</p>
        <p className="text-sm">{c.state === "active" ? "Connected" : c.state === "paused" ? "Synchronization paused" : "Connection setup pending"}</p>
      </div>{["active", "paused"].includes(c.state) ? <Button variant="outline" disabled={pending === c.id} onClick={() => change(c.id, c.state === "active" ? "paused" : "active")}>
        {pending === c.id ? "Updating…" : c.state === "active" ? "Pause sync" : "Resume sync"}</Button> : null}</div>
      {["pending", "active", "paused"].includes(c.state) ? <div className="mt-3">
        {disconnect === c.id ? <div className="space-y-3 rounded-lg border border-destructive/30 p-3" role="alert"><p className="text-sm">Disconnect this team and all its linked projects? Files, tasks, dates, and history stay in Sastra. A future connection requires fresh approval in both apps.</p><div className="flex gap-2"><Button variant="destructive" disabled={pending === c.id} onClick={() => change(c.id, "revoked")}>{pending === c.id ? "Disconnecting…" : "Confirm disconnect"}</Button><Button variant="outline" onClick={() => setDisconnect(null)}>Cancel</Button></div></div> : <Button variant="ghost" onClick={() => setDisconnect(c.id)}>{c.state === "pending" ? "Cancel pending connection" : "Disconnect team"}</Button>}
      </div> : null}
      <p className="mt-3 text-sm text-muted-foreground">Open a Sastra project’s Translation tab to choose its Lectio project and review the workflow mapping.</p>
      {["active", "paused"].includes(c.state) ? <ConnectionOwnership connectionId={c.id} approvedBy={c.approvedBy} /> : null}
      {c.state === "active" ? <PeopleSettings connectionId={c.id} /> : null}
      {c.state === "active" ? <SetupSettings connectionId={c.id} /> : null}
      {c.state === "active" ? <div className="mt-4 border-t pt-4"><Button variant="outline" disabled={pending === `rotate-${c.id}`} onClick={async () => {
        if (pending) return; setPending(`rotate-${c.id}`);
        try { const result = await rotateLectioConnectionKeys(c.id); if ("error" in result) throw new Error(result.error); toast.success("Key rotation queued for both apps. Synchronization continues while they confirm the change."); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Could not rotate connection keys."); } finally { setPending(null); }
      }}>{pending === `rotate-${c.id}` ? "Queuing rotation…" : "Rotate connection keys"}</Button><p className="mt-2 text-xs text-muted-foreground">Replaces the signing keys without reconnecting projects. The previous key remains valid for up to 24 hours while pending deliveries finish.</p></div> : null}
    </section>)}
    <form onSubmit={connect} className="space-y-4 rounded-xl border bg-card p-5">
      <div><h3 className="font-semibold">Connect a Lectio team</h3><p className="mt-1 text-sm text-muted-foreground">A Lectio team administrator approves the connection in Lectio. You can connect several teams to this workspace.</p></div>
      <div className="space-y-2"><Label htmlFor="lectio-origin">Lectio address</Label><Input id="lectio-origin" type="url" required value={origin} onChange={e => setOrigin(e.target.value)} placeholder="https://your-lectio.example" autoComplete="url" /></div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending === "connect"}>{pending === "connect" ? "Opening Lectio…" : "Continue to Lectio"}</Button>
    </form>
  </div>;
}
