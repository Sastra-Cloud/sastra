"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { confirmDonationMouPaymentMatch } from "@/lib/donations/actions";
import type { DonationMouLinkOption } from "@/lib/donations/mou-link";

function money(amount: string | number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(amount));
}

export function DonationMouLink({
  allocationId,
  receiptAmount,
  currency,
  options,
  onLinked,
}: {
  allocationId: string;
  receiptAmount: string;
  currency: string;
  options: DonationMouLinkOption[];
  onLinked: (payment: DonationMouLinkOption) => void;
}) {
  const router = useRouter();
  const id = useId();
  const exact = options.filter((option) => Math.round(Number(option.amount) * 100) === Math.round(Number(receiptAmount) * 100));
  const [open, setOpen] = useState(false);
  const [paymentId, setPaymentId] = useState(exact.length === 1 ? exact[0].paymentId : "");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const selected = options.find((option) => option.paymentId === paymentId);
  const differenceCents = selected
    ? Math.round(Number(receiptAmount) * 100) - Math.round(Number(selected.amount) * 100)
    : 0;

  function confirm() {
    if (!selected || pending || (differenceCents !== 0 && reason.trim().length < 3)) return;
    start(async () => {
      try {
        const result = await confirmDonationMouPaymentMatch({
          allocationId,
          paymentId: selected.paymentId,
          expectedPaymentAmount: Number(selected.amount),
          expectedReceiptAmount: Number(receiptAmount),
          differenceReason: reason.trim() || undefined,
        });
        if (result.error) throw new Error(result.error);
        onLinked(selected);
        toast.success("Donation linked. The scheduled payment is now received.");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not link the payment. Try again.");
      }
    });
  }

  if (!open) return (
    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setOpen(true)}>
      <Link2 className="size-3.5" />
      Link to MoU payment
    </Button>
  );

  return (
    <div className="mt-3 space-y-3 rounded-lg border bg-muted/25 p-3" aria-label="Review donation payment link">
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-payment`}>Scheduled MoU payment</Label>
        <select
          id={`${id}-payment`}
          value={paymentId}
          disabled={pending}
          onChange={(event) => { setPaymentId(event.target.value); setReason(""); }}
          className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Choose payment</option>
          {options.map((option) => (
            <option key={option.paymentId} value={option.paymentId}>
              {option.label} · {money(option.amount, option.currency)}
            </option>
          ))}
        </select>
      </div>
      {selected ? (
        <>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">Expected</dt><dd className="font-medium tabular-nums">{money(selected.amount, currency)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Already received</dt><dd className="font-medium tabular-nums">{money(receiptAmount, currency)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Difference</dt><dd className="font-medium tabular-nums">{money(Math.abs(differenceCents) / 100, currency)}{differenceCents > 0 ? " more" : differenceCents < 0 ? " less" : ""}</dd></div>
          </dl>
          {differenceCents !== 0 ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-reason`}>Reason for the difference</Label>
              <Textarea id={`${id}-reason`} value={reason} maxLength={500} disabled={pending} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this completes the scheduled payment." />
              <p className="text-xs text-muted-foreground">Confirm only if this completes the payment. Leave part payments open.</p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">This links the existing receipt and marks the payment received. The recorded amounts stay unchanged.</p>
        </>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="button" size="sm" disabled={pending || !selected || (differenceCents !== 0 && reason.trim().length < 3)} onClick={confirm}>
          {pending ? "Linking…" : "Confirm as received"}
        </Button>
      </div>
    </div>
  );
}
