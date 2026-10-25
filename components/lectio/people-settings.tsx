"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { confirmLectioPerson, listLectioPeople, removeLectioPerson } from "@/lib/lectio/actions";
type Person = { id: string; name: string; email: string };
export function PeopleSettings({ connectionId }: { connectionId: string }) {
  const [data, setData] = useState<{ remote: Person[]; local: Person[]; linked: { remoteId: string; localId: string }[] } | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({}), [pending, setPending] = useState<Set<string>>(new Set()), [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{ remoteId: string; localId: string; remove: boolean } | null>(null);
  const inFlight = useRef(new Set<string>());
  function start(key: string) { if (inFlight.current.has(key)) return false; inFlight.current.add(key); setPending(new Set(inFlight.current)); setError(null); return true; }
  function finish(key: string) { inFlight.current.delete(key); setPending(new Set(inFlight.current)); }
  async function load() {
    if (!start("load")) return;
    try { const result = await listLectioPeople(connectionId); if ("error" in result) throw new Error(result.error); setData(result); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not load teammates."); } finally { finish("load"); }
  }
  async function confirmPerson() {
    if (!review || !start(review.remoteId)) return;
    const { remoteId, localId, remove } = review;
    if (remove) setData(previous => previous ? { ...previous, linked: previous.linked.filter(match => match.remoteId !== remoteId) } : previous);
    try {
      const result = remove ? await removeLectioPerson(connectionId, remoteId, localId) : await confirmLectioPerson(connectionId, remoteId, localId);
      if ("error" in result) throw new Error(result.error);
      if (!remove) setData(previous => previous ? { ...previous, linked: [...previous.linked.filter(match => match.remoteId !== remoteId), { remoteId, localId }] } : previous);
      setReview(null);
    } catch (error) {
      if (remove) setData(previous => previous ? { ...previous, linked: [...previous.linked.filter(match => match.remoteId !== remoteId), { remoteId, localId }] } : previous);
      setError(error instanceof Error ? error.message : "Could not confirm teammate.");
    } finally { finish(remoteId); }
  }
  return <div className="mt-4 border-t pt-4">
    {!data ? <Button variant="outline" size="sm" disabled={pending.has("load")} onClick={load}>{pending.has("load") ? "Loading teammates…" : "Match teammates"}</Button> : <div className="space-y-3">
      <h4 className="text-sm font-medium">Match the same person in both apps</h4><p className="text-sm text-muted-foreground">Emails can be different. Check both accounts before matching assignments. This does not enable sign-in. Each person links sign-in in Profile before managing work across apps.</p>
      {data.remote.map(person => {
        const linked = data.linked.find(p => p.remoteId === person.id);
        return <div className="grid items-center gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]" key={person.id}>
          <label className="min-w-0 text-sm font-medium" htmlFor={`person-${connectionId}-${person.id}`}>{person.name}<span className="block break-all font-normal text-muted-foreground">{person.email}</span></label>
          {linked ? <><p className="min-w-0 text-sm text-muted-foreground">Matched to {data.local.find(p => p.id === linked.localId)?.name || "a Sastra teammate"}<span className="block break-all">{data.local.find(p => p.id === linked.localId)?.email}</span></p><Button size="sm" variant="ghost" disabled={pending.has(person.id)} onClick={() => setReview({ remoteId: person.id, localId: linked.localId, remove: true })}>Remove match</Button></> : <>
            <select id={`person-${connectionId}-${person.id}`} value={selection[person.id] || ""} disabled={pending.has(person.id)} onChange={e => setSelection(s => ({ ...s, [person.id]: e.target.value }))} className="min-h-11 min-w-0 rounded-md border bg-background px-2 text-base">
              <option value="">Choose Sastra teammate</option>{data.local.filter(p => !data.linked.some(l => l.localId === p.id)).map(p => <option value={p.id} key={p.id}>{p.name} · {p.email}</option>)}</select>
            <Button size="sm" variant="outline" disabled={!selection[person.id] || pending.has(person.id)} onClick={() => setReview({ remoteId: person.id, localId: selection[person.id], remove: false })}>{pending.has(person.id) ? "Updating…" : "Review match"}</Button></>}
        </div>;
      })}
      {review ? <div className="space-y-3 rounded-lg border p-4" role="group" aria-label="Review teammate match">
        <p className="text-sm font-medium">{review.remove ? "Remove this teammate match?" : "Confirm these accounts belong to the same person"}</p>
        <p className="break-all text-sm">Lectio: {data.remote.find(person => person.id === review.remoteId)?.email}<br />Sastra: {data.local.find(person => person.id === review.localId)?.email}</p>
        {review.remove ? <p className="text-sm text-muted-foreground">Assignments in Sastra are refreshed and pending requests using this match stop. No account or history is deleted. A verified sign-in link must first be removed by its owner in Profile.</p> : null}
        <div className="flex flex-wrap gap-2"><Button variant={review.remove ? "destructive" : "default"} disabled={pending.has(review.remoteId)} onClick={() => void confirmPerson()}>{pending.has(review.remoteId) ? "Updating match…" : review.remove ? "Confirm remove match" : "Confirm teammate match"}</Button><Button variant="outline" disabled={pending.has(review.remoteId)} onClick={() => setReview(null)}>Cancel</Button></div>
      </div> : null}
    </div>}
    {error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
  </div>;
}
