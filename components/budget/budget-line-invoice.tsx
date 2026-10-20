"use client";

import { FileLink } from "@/components/files/file-link";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2 } from "lucide-react";

import { createBudgetLineInvoice, previewBudgetLineInvoice } from "@/lib/budget/line-invoice-actions";
import { lineAmountCents } from "@/lib/budget/compute";
import type { BudgetLineInvoiceInput, BudgetLineInvoicePlan } from "@/lib/budget/line-invoice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Line = {
  id: string;
  label: string;
  quantity: string;
  unitPrice: string;
  alreadyInvoiced: boolean;
};

export function BudgetLineInvoice({
  projectId, printRunId, currency, lines, partnerName, partnerEmail,
}: {
  projectId: string;
  printRunId: string | null;
  currency: string;
  lines: Line[];
  partnerName: string | null;
  partnerEmail: string | null;
}) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [name, setName] = useState(partnerName ?? "");
  const [email, setEmail] = useState(partnerEmail ?? "");
  const [address, setAddress] = useState("");
  const [date, setDate] = useState("");
  const [plan, setPlan] = useState<BudgetLineInvoicePlan | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [result, setResult] = useState<{ invoiceId: string; invoiceNumber: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const total = lines.filter((line) => selected.includes(line.id))
    .reduce((sum, line) => sum + lineAmountCents(line.quantity, line.unitPrice), 0);
  const money = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  const input: BudgetLineInvoiceInput = {
    projectId, printRunId, budgetItemIds: selected,
    ...(amount ? { amount: Number(amount) } : {}),
    ...(name.trim() ? { recipientName: name.trim() } : {}),
    ...(email.trim() ? { recipientEmail: email.trim() } : {}),
    ...(address.trim() ? { recipientAddress: address.trim() } : {}),
    ...(date ? { dueDate: date } : {}),
  };

  function review() {
    setError(null);
    startTransition(async () => {
      try {
        const response = await previewBudgetLineInvoice(input);
        if (!response.plan) throw new Error(response.error);
        setPlan(response.plan);
        setConfirmed(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not prepare the invoice. Try again.");
      }
    });
  }

  function create() {
    if (!plan || !confirmed || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const response = await createBudgetLineInvoice({ ...input, requestId, reviewedFingerprint: plan.fingerprint });
        if (response.paymentId) setPaymentId(response.paymentId);
        if (response.error || !response.invoiceId || !response.invoiceNumber) {
          throw new Error(response.error || "Could not create the invoice. Try again.");
        }
        setResult({ invoiceId: response.invoiceId, invoiceNumber: response.invoiceNumber });
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not create the invoice. Try again.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice selected budget lines</CardTitle>
        <CardDescription>
          Request funding for one part of this project, such as audiobook production.
          The invoice uses the partner prices saved in the budget.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!open ? (
          <Button variant="outline" onClick={() => setOpen(true)} disabled={!lines.length}>
            <FileText className="size-4" /> Choose budget lines
          </Button>
        ) : result ? (
          <div role="status" className="space-y-3">
            <p>Invoice {result.invoiceNumber} created. It has not been emailed.</p>
            <FileLink intent="preview" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline" href={`/api/invoices/${result.invoiceId}`}>
              <FileText className="size-4" /> Open invoice {result.invoiceNumber}
            </FileLink>
            <p className="text-sm text-muted-foreground">Use Email invoice on the payment below to review and send it.</p>
            <Button variant="outline" onClick={() => {
              setOpen(false); setPlan(null); setSelected([]); setAmount("");
              setResult(null); setConfirmed(false); setPaymentId(null); setRequestId(crypto.randomUUID());
            }}>Close</Button>
          </div>
        ) : plan ? (
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p className="whitespace-pre-line">{plan.description}</p>
              <p className="font-semibold tabular-nums">{money(Number(plan.amount))}</p>
              <p>Partner: {plan.recipientName}</p>
              <p className="break-words">Email: {plan.recipientEmail || "Not set"}</p>
              <p className="whitespace-pre-line">Billing address: {plan.recipientAddress || "Not set"}</p>
              <p>Payment due: {plan.dueDate || "On issue"}</p>
            </div>
            <Label className="flex min-h-11 items-start gap-2 font-normal">
              <Checkbox checked={confirmed} disabled={pending} onCheckedChange={(checked) => setConfirmed(checked === true)} />
              I reviewed the covered work, amount, and partner details.
            </Label>
            <p className="text-xs text-muted-foreground">Creates an invoice and scheduled payment. Review and send the email separately.</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending || !confirmed} onClick={create}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                {pending ? "Creating invoice…" : paymentId ? "Retry invoice" : "Create invoice"}
              </Button>
              <Button variant="ghost" disabled={pending || Boolean(paymentId)} onClick={() => { setPlan(null); setConfirmed(false); setError(null); }}>
                Edit selection
              </Button>
            </div>
            {paymentId && error ? <p className="text-sm text-muted-foreground">The scheduled payment is saved. Retry here to finish the same invoice.</p> : null}
          </div>
        ) : (
          <div className="space-y-4">
            <fieldset className="space-y-2" disabled={pending}>
              <legend className="mb-2 text-sm font-medium">Covered work</legend>
              {lines.map((line) => (
                <Label key={line.id} className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 font-normal">
                  <Checkbox checked={selected.includes(line.id)} onCheckedChange={(checked) => {
                    setSelected((current) => checked ? [...current, line.id] : current.filter((key) => key !== line.id));
                  }} />
                  <span className="min-w-0 flex-1 break-words">{line.label}{line.alreadyInvoiced ? <span className="block text-xs text-muted-foreground">Has an invoice. Check existing payments before adding another.</span> : null}</span>
                  <span className="shrink-0 tabular-nums">{money(lineAmountCents(line.quantity, line.unitPrice) / 100)}</span>
                </Label>
              ))}
            </fieldset>
            <p className="text-sm">Selected costs: <strong className="tabular-nums">{money(total / 100)}</strong></p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-amount`}>Invoice amount ({currency}, optional)</Label>
                <Input id={`${id}-amount`} type="number" min="0.01" max={total / 100} step="0.01" disabled={pending} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={(total / 100).toFixed(2)} />
                <p className="text-xs text-muted-foreground">Leave blank for the full amount, or enter a smaller contribution.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-date`}>Payment due (optional)</Label>
                <Input id={`${id}-date`} type="date" disabled={pending} value={date} onChange={(event) => setDate(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-name`}>Partner name</Label>
                <Input id={`${id}-name`} disabled={pending} value={name} onChange={(event) => {
                  setName(event.target.value);
                  if (name === partnerName) { setEmail(""); setAddress(""); }
                }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-email`}>Partner email (optional)</Label>
                <Input id={`${id}-email`} type="email" disabled={pending} value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`${id}-address`}>Billing address (optional)</Label>
                <Textarea id={`${id}-address`} rows={2} disabled={pending} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Uses the saved partner address when left blank" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Existing funding is kept as recorded. Check which costs it covers before requesting more.</p>
            <div className="flex gap-2">
              <Button disabled={pending || !selected.length || !name.trim()} onClick={review}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}{pending ? "Preparing…" : "Review invoice"}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>Close</Button>
            </div>
          </div>
        )}
        {!lines.length ? <p className="text-sm text-muted-foreground">Add a budget line and make it visible to the partner first.</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
