"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  addSharedMouMember,
  removeSharedMouMember,
  replaceSharedMouMember,
  updateSharedMouAllocation,
  updateSharedMouNotes,
  updateSharedMouPayment,
} from "@/lib/agreements/actions";
import {
  generateMouInvoice,
  markPaymentPaid,
  markPaymentUnpaid,
} from "@/lib/budget/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring";

export type AgreementProjectOption = {
  id: string;
  title: string;
};

export function MembershipManager({
  groupId,
  members,
  projects,
}: {
  groupId: string;
  members: Array<{
    id: string;
    projectId: string;
    title: string;
    allocationAmount: string;
  }>;
  projects: AgreementProjectOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [projectId, setProjectId] = useState("");
  const [allocation, setAllocation] = useState("");
  const available = projects.filter(
    (project) => !members.some((member) => member.projectId === project.id)
  );
  const run = (work: () => Promise<{ error?: string }>, success: string) =>
    start(async () => {
      const result = await work();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      setReason("");
      setProjectId("");
      setAllocation("");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[1fr_9rem_1.4fr_auto] sm:items-end">
        <div className="grid gap-1">
          <Label>Add project</Label>
          <select
            className={selectClass}
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">Choose project</option>
            {available.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label>Allocation</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={allocation}
            onChange={(event) => setAllocation(event.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label>Required reason</Label>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why the agreement roster is changing"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={pending || !projectId || !allocation || reason.trim().length < 5}
          onClick={() =>
            run(
              () =>
                addSharedMouMember({
                  groupId,
                  projectId,
                  allocationAmount: allocation,
                  reason,
                }),
              "Project added."
            )
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add
        </Button>
      </div>

      <div className="space-y-2">
        {members.map((member) => (
          <MemberMutationRow
            key={member.id}
            member={member}
            available={available}
            disabled={pending}
            run={run}
          />
        ))}
      </div>
    </div>
  );
}

function MemberMutationRow({
  member,
  available,
  disabled,
  run,
}: {
  member: { id: string; title: string; allocationAmount: string };
  available: AgreementProjectOption[];
  disabled: boolean;
  run: (work: () => Promise<{ error?: string }>, success: string) => void;
}) {
  const [amount, setAmount] = useState(member.allocationAmount);
  const [replacement, setReplacement] = useState("");
  const [reason, setReason] = useState("");
  const validReason = reason.trim().length >= 5;
  return (
    <div className="grid gap-2 rounded-lg border p-3 lg:grid-cols-[minmax(12rem,1fr)_8rem_minmax(13rem,1.2fr)_minmax(12rem,1fr)_auto] lg:items-end">
      <div>
        <p className="text-sm font-medium">{member.title}</p>
        <p className="text-xs text-muted-foreground">Audited membership</p>
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Allocation</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Replace with</Label>
        <select
          className={selectClass}
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
        >
          <option value="">No replacement</option>
          {available.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Required reason</Label>
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason for this change"
        />
      </div>
      <div className="flex flex-wrap gap-1 lg:justify-end">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`Save ${member.title} allocation`}
          disabled={disabled || !validReason || amount === member.allocationAmount}
          onClick={() =>
            run(
              () =>
                updateSharedMouAllocation({
                  membershipId: member.id,
                  allocationAmount: amount,
                  reason,
                }),
              "Allocation updated."
            )
          }
        >
          <Save className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`Replace ${member.title}`}
          disabled={disabled || !validReason || !replacement}
          onClick={() =>
            run(
              () =>
                replaceSharedMouMember({
                  membershipId: member.id,
                  projectId: replacement,
                  reason,
                }),
              "Project replaced."
            )
          }
        >
          <ArrowRightLeft className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${member.title}`}
          disabled={disabled || !validReason}
          onClick={() =>
            run(
              () => removeSharedMouMember({ membershipId: member.id, reason }),
              "Project removed."
            )
          }
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function AgreementNotes({
  groupId,
  initial,
}: {
  groupId: string;
  initial: string | null;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initial ?? "");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={4}
        placeholder="Manager-only context, exceptions, or follow-up notes"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || notes === (initial ?? "")}
        onClick={() =>
          start(async () => {
            const result = await updateSharedMouNotes(groupId, notes);
            if (result.error) toast.error(result.error);
            else toast.success("Notes saved.");
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Save notes
      </Button>
    </div>
  );
}

export function SharedPaymentControls({
  payment,
  assignees,
  issuerReady = true,
  invoiceDefaults,
}: {
  issuerReady?: boolean;
  invoiceDefaults?: { recipientName: string | null; billingAddress: string; description: string };
  payment: {
    id: string;
    dueDate: string | null;
    notes: string | null;
    invoiceAssigneeId: string | null;
    readinessStatus: string;
    paidAt: Date | null;
    invoiceId: string | null;
    invoiceNumber: string | null;
    invoiceStatus?: string | null;
    invoiceSourceFileId?: string | null;
  };
  assignees: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [regenerating, setRegenerating] = useState(false);
  const canRegenerate = !!payment.invoiceId && payment.invoiceStatus === "issued" && !payment.invoiceSourceFileId && !payment.paidAt;
  const [billingAddress, setBillingAddress] = useState(invoiceDefaults?.billingAddress ?? "");
  const [invoiceDescription, setInvoiceDescription] = useState(invoiceDefaults?.description ?? "");
  const [dueDate, setDueDate] = useState(payment.dueDate ?? "");
  const [assignee, setAssignee] = useState(payment.invoiceAssigneeId ?? "");
  const [notes, setNotes] = useState(payment.notes ?? "");
  const act = (work: () => Promise<{ error?: string }>, success: string) =>
    start(async () => {
      try {
        const result = await work();
        if (result.error) toast.error(result.error);
        else { toast.success(success); router.refresh(); }
      } catch {
        toast.error("The request did not finish. Your changes are still here. Refresh the agreement to check its latest status before retrying.");
      }
    });
  return (
    <div className="space-y-3 border-t pt-3">
      <div className="grid gap-2 sm:grid-cols-[10rem_12rem_1fr_auto] sm:items-end">
        <div className="grid gap-1">
          <Label className="text-xs">Earliest invoice date</Label>
          <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Invoice owner</Label>
          <select className={selectClass} value={assignee} onChange={(event) => setAssignee(event.target.value)}>
            <option value="">Unassigned</option>
            {assignees.map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Schedule notes</Label>
          <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            act(
              () =>
                updateSharedMouPayment({
                  paymentId: payment.id,
                  dueDate: dueDate || null,
                  invoiceAssigneeId: assignee || null,
                  notes,
                }),
              "Payment schedule updated."
            )
          }
        >
          <Save className="size-4" /> Save
        </Button>
      </div>
      {(!payment.invoiceId || canRegenerate) && invoiceDefaults && <div className="space-y-2">
        <p className="text-sm">Bill To: {invoiceDefaults.recipientName || "Funding partner"}</p>
        <label className="grid gap-1 text-xs">Invoice description
          <Textarea value={invoiceDescription} onChange={(event) => setInvoiceDescription(event.target.value)} maxLength={2000} rows={5} />
        </label>
        <p className="text-xs text-muted-foreground">Review the covered work from the MoU before generating. Save reusable billing addresses in <Link href="/settings/partners" className="text-primary underline">Partners</Link>.</p>
      </div>}
      {(!payment.invoiceId || canRegenerate) && <label className="grid gap-1 text-xs">Bill To address (optional)
        <Textarea value={billingAddress} onChange={(event) => setBillingAddress(event.target.value)} maxLength={1000}
          placeholder="Partner’s billing address, printed below their name on this invoice" />
      </label>}
      <div className="flex flex-wrap items-center gap-2">
        {payment.invoiceId ? (
          <Link
            href={`/api/invoices/${payment.invoiceId}`}
            target="_blank"
            className="inline-flex min-h-8 items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <FileText className="size-4" /> Invoice {payment.invoiceNumber}
          </Link>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !issuerReady || payment.readinessStatus !== "ready"}
            onClick={() =>
              act(
                () => generateMouInvoice(payment.id, { billingAddress, description: invoiceDefaults ? invoiceDescription : undefined }),
                "Invoice generated."
              )
            }
          >
            <FileText className="size-4" /> Generate invoice
          </Button>
        )}
        {canRegenerate && <Button type="button" variant="outline" size="sm"
          disabled={pending || !issuerReady || payment.readinessStatus !== "invoiced"}
          onClick={() => act(async () => {
            setRegenerating(true);
            try { return await generateMouInvoice(payment.id, { regenerate: true, billingAddress, description: invoiceDescription }); }
            finally { setRegenerating(false); }
          }, "Invoice PDF regenerated. Review it before sending.")}>
          <RotateCcw className="size-4" /> {regenerating ? "Regenerating…" : "Regenerate PDF"}
        </Button>}
        {payment.paidAt ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await markPaymentUnpaid(payment.id);
                toast.success("Received payment reversed.");
                router.refresh();
              })
            }
          >
            <RotateCcw className="size-4" /> Undo received
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => act(() => markPaymentPaid(payment.id), "Payment recorded and allocated.")}
          >
            <CheckCircle2 className="size-4" /> Mark received
          </Button>
        )}
        {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </div>
    </div>
  );
}
