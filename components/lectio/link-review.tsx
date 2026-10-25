"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Review = { sastra: { name: string; email: string }; lectio: { name: string | null; email: string }; teamName: string; origin: string };
export function LectioLinkReview() {
  const [review, setReview] = useState<Review | null>(null), [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false), [pending, setPending] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/lectio/link-review", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) }).then(async response => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Could not load account review. Start again from Profile settings.");
      setReview(result);
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error && !(error instanceof TypeError) && error.name !== "TimeoutError" ? error.message : "Could not load account review. Check your connection and start again from Profile settings."); });
    return () => controller.abort();
  }, []);
  async function decide(decision: "confirm" | "cancel" | "switch") {
    if (submitting.current || (decision === "confirm" && !confirmed)) return;
    submitting.current = true; setPending(true); setError(null);
    try {
      const response = await fetch("/api/auth/lectio/confirm-link", { method: "POST", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.url !== "string") throw new Error(result.message || "Could not finish account linking. Start again from Profile settings.");
      window.location.assign(result.url);
    } catch (error) { setError(error instanceof Error && !(error instanceof TypeError) && error.name !== "TimeoutError" ? error.message : "Could not confirm the link. Check Profile settings before starting again."); submitting.current = false; setPending(false); }
  }
  return <section className="max-w-2xl space-y-5 rounded-xl border bg-card p-5">
    <div className="space-y-2"><h2 className="text-2xl font-semibold">Confirm your accounts</h2><p className="text-sm text-muted-foreground">Check both accounts before linking sign-in. Their email addresses can be different.</p></div>
    {review ? <>
      <div className="grid gap-3 sm:grid-cols-2">{([ ["Sastra account", review.sastra], ["Lectio account", review.lectio] ] as const).map(([label, person]) => <div key={label} className="min-w-0 space-y-1 rounded-lg border p-4"><p className="text-sm font-medium">{label}</p><p className="break-words">{person.name || "Teammate"}</p><p className="break-all text-sm text-muted-foreground">{person.email}</p></div>)}</div>
      <p className="text-sm text-muted-foreground">Lectio team: {review.teamName}<br /><span className="break-all">{review.origin}</span></p>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={confirmed} disabled={pending} onChange={event => setConfirmed(event.target.checked)} />These accounts are mine. Link them for sign-in.</label>
      <p className="text-sm text-muted-foreground">Wrong Lectio account? Choose another account, sign out in Lectio, then restart linking from Sastra Profile settings.</p>
      <div className="flex flex-wrap gap-2"><Button className="min-h-11" disabled={pending || !confirmed} onClick={() => void decide("confirm")}>{pending ? "Finishing…" : "Link these accounts"}</Button><Button className="min-h-11" variant="outline" disabled={pending} onClick={() => void decide("cancel")}>Cancel linking</Button><Button className="min-h-11" variant="ghost" disabled={pending} onClick={() => void decide("switch")}>Use another Lectio account</Button></div>
    </> : !error ? <p role="status">Loading account review…</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error} <Link href="/settings/profile" className="underline">Return to Profile settings</Link></p> : null}
  </section>;
}
