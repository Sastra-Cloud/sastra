"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createPrintEstimateFromText } from "@/lib/print/estimate-intake-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Remains mounted when closed so pasted notes survive toggling either form. */
export function PrintEstimateIntake({ id, open, projectId, contacts, onSaved }: {
  id: string;
  open: boolean;
  projectId: string;
  contacts: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const prefix = useId();
  const router = useRouter();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [text, setText] = useState("");
  const [contactId, setContactId] = useState("");
  const [reused, setReused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const newRequest = () => setRequestId(crypto.randomUUID());

  return <section id={id} hidden={!open} aria-label="Add printing quote with AI" className="rounded-lg border p-4">
    <form className="space-y-3" onSubmit={event => {
      event.preventDefault();
      if (pending || !text.trim()) return;
      setError(null);
      start(async () => {
        try {
          const result = await createPrintEstimateFromText(projectId, { requestId, text, contactId: contactId || null, reused });
          if ("error" in result) { setError(result.error); return; }
          toast.success(`${result.count} quote options ready for review`, { description: "Choose an option below to use it in the budget." });
          setText(""); setReused(false); newRequest();
          onSaved();
          router.refresh();
        } catch {
          setError("Could not read the quote. Your text is still here. Try again.");
        }
      });
    }}>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-text`}>Quote or planning note</Label>
        <p className="text-xs text-muted-foreground">Paste an email, printer quote, or prices reused from a similar book. Review the extracted options before using them.</p>
      </div>
      <Textarea id={`${prefix}-text`} rows={6} maxLength={20000} value={text} disabled={pending}
        placeholder="Include copy quantities, prices, and any book specifications."
        onChange={event => { setText(event.target.value); newRequest(); }} />
      <div className="grid items-end gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${prefix}-printer`}>Printer (optional)</Label>
          <select id={`${prefix}-printer`} value={contactId} disabled={pending}
            className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm pointer-coarse:min-h-11"
            onChange={event => { setContactId(event.target.value); newRequest(); }}>
            <option value="">Not specified</option>
            {contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
          </select>
        </div>
        <Label className="flex min-h-10 items-center gap-2 text-sm font-normal pointer-coarse:min-h-11">
          <Checkbox checked={reused} disabled={pending} onCheckedChange={value => { setReused(value === true); newRequest(); }} />
          Reused from another book
        </Label>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="pointer-coarse:min-h-11" disabled={pending || !text.trim()} aria-busy={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {pending ? "Reading quote…" : "Read quote with AI"}
        </Button>
        <span className="text-xs text-muted-foreground">Adds planning options only. No email or payment is created.</span>
      </div>
      {pending ? <p role="status" className="text-sm text-muted-foreground">Reading prices and specifications. Your text stays here while Sastra prepares the review.</p> : null}
    </form>
  </section>;
}
