"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createSponsorship } from "@/lib/sponsorships/actions";
import { SponsorshipForm, type SponsorshipOptions } from "./sponsorship-form";
import type { SponsorshipInput } from "@/lib/sponsorships/compute";

export function CreateSponsorship({ options, currency }: { options: SponsorshipOptions; currency: string }) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const initial: SponsorshipInput = { title: "", partnerId: null, recipientName: "", recipientEmail: "", recipientAddress: "", currency,
    dueDate: "", notes: "", lines: [{ projectId: "", description: "", quantity: 1, unitPrice: "" }] };
  return <div className="space-y-4">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <SponsorshipForm initial={initial} options={options} pending={pending} label="Create sponsorship" onSave={input => {
      const requestId = id ?? crypto.randomUUID(); setId(requestId); setError(null);
      start(async () => {
        try {
          const result = await createSponsorship(requestId, input);
          if (result.error || !result.id) { setError(result.error ?? "Couldn't create sponsorship. Try again."); return; }
          toast.success("Sponsorship draft created."); router.push(`/sponsorships/${result.id}`); router.refresh();
        } catch { setError("Couldn't create sponsorship. Your entries are kept. Try again."); }
      });
    }} />
  </div>;
}
