"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { configureLectioSharedSignIn } from "@/lib/lectio/sso-actions";

export function SharedSignInSetup({ connectionId, enabled }: { connectionId: string; enabled: boolean }) {
  const router = useRouter(), [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  return <section className="space-y-3 rounded-xl border bg-card p-5"><h3 className="font-semibold">Shared sign-in</h3>
    <p className="text-sm text-muted-foreground">{enabled ? "Enabled. Teammates can link their existing accounts in Profile settings." : "Let existing teammates sign in to Sastra with their Lectio account after linking both accounts."} Your usual Sastra sign-in stays available.</p>
    <Button variant="outline" disabled={pending} onClick={async () => { setPending(true); setError(null);
      try { const result = await configureLectioSharedSignIn(connectionId, !enabled);
        if ("error" in result) setError(result.error ?? "Could not update sign-in."); else router.refresh();
      } catch { setError("Could not update shared sign-in. Try again."); } finally { setPending(false); }
    }}>{pending ? "Updating sign-in…" : enabled ? "Disable shared sign-in" : "Enable shared sign-in"}</Button>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </section>;
}

export function LectioSignInButtons({ connections, link = false, linked = false }: { connections: { id: string; name: string }[]; link?: boolean; linked?: boolean }) {
  const search = useSearchParams(), router = useRouter();
  const [pending, setPending] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const [unlinkReview, setUnlinkReview] = useState(false);
  async function start(id: string) {
    setPending(id); setError(null);
    try { const response = await fetch("/api/auth/lectio/start", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: id, mode: link ? "link" : "login", next: link ? "/settings/profile" : search.get("redirect") ?? search.get("next") ?? "/dashboard" }) });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.message ?? result.error ?? "Could not start shared sign-in.");
      window.location.assign(result.url);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not start shared sign-in."); setPending(null); }
  }
  return <div className="space-y-3">
    {link ? <><h3 className="text-sm font-medium">Lectio sign-in</h3><p className="text-sm text-muted-foreground">{linked ? "Your accounts are linked. Use Lectio to sign in to this Sastra workspace." : "Link your existing accounts once. This confirms your identity in both apps without changing your role or adding a paid seat."}</p></> : null}
    {connections.map(con => <Button key={con.id} variant="outline" className={link ? "" : "w-full"} disabled={pending !== null} onClick={() => start(con.id)}>
      {pending === con.id ? "Opening Lectio…" : link ? `Link Lectio · ${con.name}` : `Continue with Lectio · ${con.name}`}</Button>)}
    {link && linked && !unlinkReview ? <Button variant="ghost" disabled={pending !== null} onClick={() => setUnlinkReview(true)}>Unlink shared sign-in</Button> : null}
    {link && linked && unlinkReview ? <div className="space-y-3 rounded-lg border p-3"><p className="text-sm">Unlink Lectio sign-in and end its shared sessions? Your usual Sastra login and teammate matches stay available.</p><div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={pending !== null} onClick={async () => {
      setPending("unlink"); setError(null);
      try { const response = await fetch("/api/auth/lectio/unlink", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const result = await response.json(); if (!response.ok) throw new Error(result.message ?? result.error ?? "Could not unlink."); setUnlinkReview(false); router.refresh();
      } catch (error) { setError(error instanceof Error ? error.message : "Could not unlink."); } finally { setPending(null); }
    }}>{pending === "unlink" ? "Unlinking sign-in…" : "Confirm unlink"}</Button><Button variant="outline" disabled={pending !== null} onClick={() => setUnlinkReview(false)}>Cancel</Button></div></div> : null}
    {error || search.get("lectio") === "failed" ? <p role="alert" className="text-sm text-destructive">{error ?? "Lectio sign-in could not be completed. Use your usual Sastra sign-in, then link your accounts in Profile settings if needed."}</p> : null}
  </div>;
}
