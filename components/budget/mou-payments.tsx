"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileSignature,
  FileText,
  Loader2,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  addPayment,
  deletePayment,
  generateMouInvoice,
  markPaymentPaid,
  markPaymentUnpaid,
  requestMouInvoice,
  splitFundingIntoTwoPayments,
  sendInvoiceEmail,
  updatePayment,
  voidMouInvoice,
} from "@/lib/budget/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePropState } from "@/hooks/use-prop-state";
import { InvoiceImportButton } from "@/components/budget/invoice-import-button";
import { expectedNetCents } from "@/lib/budget/compute";
import { OutgoingAttachmentReview } from "@/components/email/outgoing-attachment-review";
import {
  OutgoingEmailStatus,
  type OutgoingEmailDelivery,
} from "@/components/email/outgoing-email-status";
import { EmailDraftControls } from "@/components/email/email-draft-controls";
import {
  discardEmailDraft,
  saveEmailDraft,
} from "@/lib/email/draft-actions";
import {
  emailDraftValueEqual,
  type EmailDraftDTO,
  type EmailDraftValue,
} from "@/lib/email/draft-types";

export type Payment = {
  id: string;
  printRunId: string | null;
  amount: string;
  currency: string;
  trigger: string;
  dueDate: string | null;
  notes: string | null;
  publicDescription: string | null;
  invoiceAssigneeId: string | null;
  invoiceTaskId: string | null;
  invoiceRequestedAt: string | Date | null;
  paidAt: string | Date | null;
  invoice: {
    id: string;
    invoiceNumber: string;
    recipientEmail: string | null;
    file: {
      originalName: string;
      mimeType: string;
      sizeBytes: number;
    } | null;
  } | null;
  invoiceHistory: {
    id: string;
    invoiceNumber: string;
    status: string;
  }[];
};

type Person = { id: string; name: string; email: string | null };

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const TRIGGER_LABELS: Record<string, string> = {
  on_signing: "On signing",
  on_completion: "On completion",
  on_52_episodes: "Episode milestone",
  custom: "Custom date",
};

type MouTrigger =
  | "on_signing"
  | "on_completion"
  | "on_52_episodes"
  | "custom";

type PaymentDraft = {
  amount: string;
  trigger: MouTrigger;
  dueDate: string;
  notes: string;
  publicDescription: string;
  invoiceAssigneeId: string;
};

function PaymentEditor({
  draft,
  currency,
  assignees,
  episodeMilestone,
  pending,
  onChange,
  onSave,
  onCancel,
}: {
  draft: PaymentDraft;
  currency: string;
  assignees: Person[];
  episodeMilestone: number | null;
  pending: boolean;
  onChange: (patch: Partial<PaymentDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="grid gap-1">
        <Label>Expected amount ({currency})</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={draft.amount}
          onChange={(event) => onChange({ amount: event.target.value })}
          autoFocus
        />
      </div>
      <div className="grid gap-1">
        <Label>Trigger</Label>
        <select
          className={selectClass}
          value={draft.trigger}
          onChange={(event) =>
            onChange({ trigger: event.target.value as MouTrigger })
          }
        >
          <option value="on_signing">On signing</option>
          <option value="on_completion">On completion</option>
          {episodeMilestone != null ? (
            <option value="on_52_episodes">
              After {episodeMilestone} episodes
            </option>
          ) : null}
          <option value="custom">Custom date</option>
        </select>
      </div>
      <div className="grid gap-1">
        <Label>Expected date</Label>
        <Input
          type="date"
          value={draft.dueDate}
          onChange={(event) => onChange({ dueDate: event.target.value })}
        />
      </div>
      <div className="grid gap-1">
        <Label>Invoice owner</Label>
        <select
          className={selectClass}
          value={draft.invoiceAssigneeId}
          onChange={(event) =>
            onChange({ invoiceAssigneeId: event.target.value })
          }
        >
          <option value="">Unassigned</option>
          {assignees.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1 sm:col-span-2 lg:col-span-4">
        <Label>Partner invoice description</Label>
        <Input
          value={draft.publicDescription}
          maxLength={500}
          onChange={(event) =>
            onChange({ publicDescription: event.target.value })
          }
          placeholder="e.g. Second installment for 25,000 printed copies"
        />
      </div>
      <div className="grid gap-1 sm:col-span-2 lg:col-span-4">
        <Label>Internal scheduling note</Label>
        <Input
          value={draft.notes}
          maxLength={500}
          onChange={(event) => onChange({ notes: event.target.value })}
          placeholder="e.g. initial invoice on signing"
        />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-4">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          <X className="size-4" />
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={pending}>
          <Save className="size-4" />
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function money(value: string | number, currency: string) {
  const n = Number(value) || 0;
  if (n <= 0) return "Amount TBD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function MouPayments({
  hasSharedSchedule = false,
  projectId,
  printRunId = null,
  currency,
  canEdit,
  payments,
  assignees,
  projectStatus,
  publishedEpisodeCount = 0,
  episodeMilestone = null,
  deductionBps = 0,
  fundingTarget = 0,
  defaultCcEmails,
  initialEmailDrafts,
}: {
  projectId: string;
  printRunId?: string | null;
  currency: string;
  canEdit: boolean;
  hasSharedSchedule?: boolean;
  payments: Payment[];
  assignees: Person[];
  projectStatus: string;
  /** Published episodes so far (podcast projects) — gates the milestone tranche. */
  publishedEpisodeCount?: number;
  /** Episode count that unlocks the milestone tranche, e.g. 52. Null = not a podcast. */
  episodeMilestone?: number | null;
  deductionBps?: number;
  fundingTarget?: number;
  defaultCcEmails: string[];
  initialEmailDrafts: EmailDraftDTO[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [, startEditTransition] = useTransition();
  const [visiblePayments, setVisiblePayments] = usePropState(payments);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [publicDescription, setPublicDescription] = useState("");
  const [trigger, setTrigger] = useState("on_signing");
  const [invoiceAssigneeId, setInvoiceAssigneeId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<PaymentDraft | null>(null);
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [receivedDate, setReceivedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [actualNetAmount, setActualNetAmount] = useState("");
  const [emailingInvoiceId, setEmailingInvoiceId] = useState<string | null>(null);
  const [invoiceRecipient, setInvoiceRecipient] = useState("");
  const [invoiceCc, setInvoiceCc] = useState("");
  const [invoiceSubject, setInvoiceSubject] = useState("");
  const [invoiceBody, setInvoiceBody] = useState("");
  const [invoiceReviewed, setInvoiceReviewed] = useState(false);
  const [invoiceDraftPending, startInvoiceDraftMutation] = useTransition();
  const [discardingInvoiceDraft, setDiscardingInvoiceDraft] = useState(false);
  const [invoiceDrafts, setInvoiceDrafts] = usePropState(initialEmailDrafts);
  const [invoiceDelivery, setInvoiceDelivery] =
    useState<(OutgoingEmailDelivery & { invoiceId: string }) | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const milestoneReached =
    episodeMilestone != null && publishedEpisodeCount >= episodeMilestone;
  // The milestone tranche unlocks only once enough episodes are published AND
  // the payment's scheduled date has arrived (the MoU's "no earlier than" floor).
  const episodeGateMet = (p: Payment) =>
    milestoneReached && (!p.dueDate || today >= p.dueDate);

  const scheduled = visiblePayments.reduce((s, p) => s + Number(p.amount), 0);
  const received = visiblePayments
    .filter((p) => p.paidAt)
    .reduce((s, p) => s + Number(p.amount), 0);
  const awaitingReceipt = visiblePayments.filter((p) => !p.paidAt).length;
  const savedInvoiceDraft = emailingInvoiceId
    ? invoiceDrafts.find(
        (draft) =>
          draft.kind === "mou_invoice" &&
          draft.contextId === emailingInvoiceId
      ) ?? null
    : null;
  const currentInvoiceDraftValue: EmailDraftValue | null = emailingInvoiceId
    ? {
        toAddresses: invoiceRecipient.trim() ? [invoiceRecipient.trim()] : [],
        ccAddresses: invoiceCc
          .split(/[,\n;]/)
          .map((email) => email.trim())
          .filter(Boolean),
        subject: invoiceSubject,
        body: invoiceBody,
        baselineSubject: null,
        baselineBody: null,
      }
    : null;
  const invoiceHasUnsavedChanges = currentInvoiceDraftValue
    ? !savedInvoiceDraft ||
      !emailDraftValueEqual(currentInvoiceDraftValue, savedInvoiceDraft)
    : false;

  function openInvoiceComposer(payment: Payment) {
    if (!payment.invoice) return;
    const saved = invoiceDrafts.find(
      (draft) =>
        draft.kind === "mou_invoice" &&
        draft.contextId === payment.invoice!.id
    );
    setEmailingInvoiceId(payment.invoice.id);
    setInvoiceRecipient(
      saved?.toAddresses[0] ?? payment.invoice.recipientEmail ?? ""
    );
    setInvoiceCc(
      saved ? saved.ccAddresses.join(", ") : defaultCcEmails.join(", ")
    );
    setInvoiceSubject(
      saved?.subject ?? `Invoice ${payment.invoice.invoiceNumber}`
    );
    setInvoiceBody(
      saved?.body ??
        `Hello,\n\nPlease find invoice ${payment.invoice.invoiceNumber} attached for your review.\n\nThank you.`
    );
    setInvoiceReviewed(false);
    setInvoiceDelivery(null);
    if (saved) toast.success("Saved draft restored");
  }

  async function closeInvoiceComposer() {
    if (
      invoiceHasUnsavedChanges &&
      !(await confirmDialog("Close without saving your latest changes?"))
    ) {
      return;
    }
    setEmailingInvoiceId(null);
  }

  function saveInvoiceDraft() {
    if (!emailingInvoiceId || !currentInvoiceDraftValue) return;
    startInvoiceDraftMutation(async () => {
      try {
        const result = await saveEmailDraft({
          projectId,
          kind: "mou_invoice",
          contextId: emailingInvoiceId,
          ...currentInvoiceDraftValue,
        });
        if (result.error || !result.draft) {
          toast.error(result.error || "Could not save the draft.");
          return;
        }
        setInvoiceDrafts((current) => [
          ...current.filter(
            (draft) =>
              !(
                draft.kind === "mou_invoice" &&
                draft.contextId === emailingInvoiceId
              )
          ),
          result.draft!,
        ]);
        toast.success("Draft saved");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not save the draft."
        );
      }
    });
  }

  async function discardInvoiceDraft() {
    if (
      !emailingInvoiceId ||
      !(await confirmDialog("Discard this saved invoice email and close the composer?"))
    ) {
      return;
    }
    const contextId = emailingInvoiceId;
    setDiscardingInvoiceDraft(true);
    startInvoiceDraftMutation(async () => {
      try {
        const result = await discardEmailDraft("mou_invoice", contextId);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setInvoiceDrafts((current) =>
          current.filter(
            (draft) =>
              !(
                draft.kind === "mou_invoice" && draft.contextId === contextId
              )
          )
        );
        setEmailingInvoiceId(null);
        toast.success("Draft discarded");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not discard the draft."
        );
      } finally {
        setDiscardingInvoiceDraft(false);
      }
    });
  }

  function splitIntoTwo() {
    if (fundingTarget <= 0) return;
    const previous = visiblePayments;
    const totalCents = Math.round(fundingTarget * 100);
    const amounts = [
      Math.floor(totalCents / 2),
      totalCents - Math.floor(totalCents / 2),
    ];
    setVisiblePayments(
      amounts.map((cents, index) => ({
        id: `pending-split-${crypto.randomUUID()}`,
        printRunId,
        amount: (cents / 100).toFixed(2),
        currency,
        trigger: index === 0 ? "on_signing" : "on_completion",
        dueDate: null,
        notes:
          index === 0
            ? "First of two funding installments"
            : "Final funding installment on project completion",
        publicDescription:
          index === 0
            ? "Initial project funding installment"
            : "Final project funding installment",
        invoiceAssigneeId: null,
        invoiceTaskId: null,
        invoiceRequestedAt: null,
        paidAt: null,
        invoice: null,
        invoiceHistory: [],
      }))
    );
    start(async () => {
      try {
        const result = await splitFundingIntoTwoPayments(projectId, {
          printRunId,
          total: fundingTarget,
        });
        if (result.error) throw new Error(result.error);
        router.refresh();
      } catch (error) {
        setVisiblePayments(previous);
        toast.error(
          error instanceof Error ? error.message : "Could not split the funding."
        );
      }
    });
  }

  function submit() {
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    const previous = visiblePayments;
    const temporaryId = `pending-${crypto.randomUUID()}`;
    const optimistic: Payment = {
      id: temporaryId,
      printRunId,
      amount: value.toFixed(2),
      currency,
      trigger,
      dueDate: dueDate || null,
      notes: notes || null,
      publicDescription: publicDescription || null,
      invoiceAssigneeId: invoiceAssigneeId || null,
      invoiceTaskId: null,
      invoiceRequestedAt: null,
      paidAt: null,
      invoice: null,
      invoiceHistory: [],
    };
    const draft = {
      amount,
      dueDate,
      notes,
      publicDescription,
      trigger,
      invoiceAssigneeId,
    };
    setVisiblePayments((current) => [...current, optimistic]);
    setAmount("");
    setDueDate("");
    setNotes("");
    setPublicDescription("");
    setTrigger("on_signing");
    setInvoiceAssigneeId("");
    setAdding(false);
    start(async () => {
      try {
        const res = await addPayment(projectId, {
          printRunId,
          amount: value,
          dueDate: draft.dueDate || undefined,
          notes: draft.notes || undefined,
          publicDescription: draft.publicDescription || undefined,
          trigger: draft.trigger as MouTrigger,
          invoiceAssigneeId: draft.invoiceAssigneeId || null,
        });
        if (res?.error) throw new Error(res.error);
        if (res.id) {
          setVisiblePayments((current) =>
            current.map((payment) =>
              payment.id === temporaryId ? { ...payment, id: res.id as string } : payment
            )
          );
        }
        router.refresh();
      } catch (error) {
        setVisiblePayments(previous);
        setAmount(draft.amount);
        setDueDate(draft.dueDate);
        setNotes(draft.notes);
        setPublicDescription(draft.publicDescription);
        setTrigger(draft.trigger);
        setInvoiceAssigneeId(draft.invoiceAssigneeId);
        setAdding(true);
        toast.error(error instanceof Error ? error.message : "Could not add the payment.");
      }
    });
  }

  function setPaid(payment: Payment, paid: boolean) {
    const previous = visiblePayments;
    setVisiblePayments((current) =>
      current.map((item) =>
        item.id === payment.id ? { ...item, paidAt: paid ? new Date() : null } : item
      )
    );
    start(async () => {
      try {
        const result = paid
          ? await markPaymentPaid(payment.id, {
              receivedDate,
              actualNetAmount:
                actualNetAmount === "" ? undefined : Number(actualNetAmount),
            })
          : await markPaymentUnpaid(payment.id);
        if (result && "error" in result && result.error) throw new Error(result.error);
        router.refresh();
        setReceivingId(null);
        setActualNetAmount("");
      } catch (error) {
        setVisiblePayments(previous);
        toast.error(error instanceof Error ? error.message : "Could not update the payment.");
      }
    });
  }

  function beginEditing(payment: Payment) {
    if (payment.paidAt) return;
    setEditingId(payment.id);
    setEditDraft({
      amount: payment.amount,
      trigger: payment.trigger as MouTrigger,
      dueDate: payment.dueDate ?? "",
      notes: payment.notes ?? "",
      publicDescription: payment.publicDescription ?? "",
      invoiceAssigneeId: payment.invoiceAssigneeId ?? "",
    });
  }

  function saveEditing(payment: Payment) {
    if (!editDraft || editingId !== payment.id) return;
    const value = Number(editDraft.amount);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Enter an amount of zero or more.");
      return;
    }
    const draft = { ...editDraft };
    const previous = visiblePayments;
    const optimistic: Payment = {
      ...payment,
      amount: value.toFixed(2),
      trigger: draft.trigger,
      dueDate: draft.dueDate || null,
      notes: draft.notes.trim() || null,
      publicDescription: draft.publicDescription.trim() || null,
      invoiceAssigneeId: draft.invoiceAssigneeId || null,
    };
    setVisiblePayments((current) =>
      current.map((item) => (item.id === payment.id ? optimistic : item))
    );
    setEditingId(null);
    setEditDraft(null);
    setSavingPaymentId(payment.id);
    startEditTransition(async () => {
      try {
        const result = await updatePayment(payment.id, {
          amount: value,
          trigger: draft.trigger,
          dueDate: draft.dueDate,
          notes: draft.notes,
          publicDescription: draft.publicDescription,
          invoiceAssigneeId: draft.invoiceAssigneeId || null,
        });
        if (result.error) throw new Error(result.error);
        toast.success("Payment schedule updated.");
        router.refresh();
      } catch (error) {
        setVisiblePayments(previous);
        setEditingId(payment.id);
        setEditDraft(draft);
        toast.error(
          error instanceof Error ? error.message : "Could not update the payment."
        );
      } finally {
        setSavingPaymentId(null);
      }
    });
  }

  async function removePayment(payment: Payment) {
    if (!(await confirmDialog("Delete this scheduled MoU payment?"))) return;
    const previous = visiblePayments;
    setVisiblePayments((current) => current.filter((item) => item.id !== payment.id));
    start(async () => {
      try {
        await deletePayment(payment.id);
        router.refresh();
      } catch (error) {
        setVisiblePayments(previous);
        toast.error(error instanceof Error ? error.message : "Could not delete the payment.");
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center gap-2">
          <FileSignature className="size-4 text-muted-foreground" />
          <h2 className="font-display text-base font-semibold">
            {printRunId ? "Reprint MoU Payment Schedule" : "MoU Payment Schedule"}
          </h2>
        </div>
        {visiblePayments.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">
            <p>{hasSharedSchedule ? "Shared installments are shown on the agreement above." : "No MoU payments scheduled yet."}</p>
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {visiblePayments.map((p) => (
              <li
                key={p.id}
                className={
                  editingId === p.id
                    ? "bg-muted/20 px-3 py-3 text-sm"
                    : "flex flex-wrap items-center gap-3 px-3 py-3 text-sm"
                }
              >
                {editingId === p.id && editDraft ? (
                  <PaymentEditor
                    draft={editDraft}
                    currency={p.currency}
                    assignees={assignees}
                    episodeMilestone={episodeMilestone}
                    pending={savingPaymentId === p.id}
                    onChange={(patch) =>
                      setEditDraft((current) =>
                        current ? { ...current, ...patch } : current
                      )
                    }
                    onSave={() => saveEditing(p)}
                    onCancel={() => {
                      setEditingId(null);
                      setEditDraft(null);
                    }}
                  />
                ) : (
                  <>
                    <div className="grid min-w-0 flex-1 gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                          {TRIGGER_LABELS[p.trigger] ?? TRIGGER_LABELS.custom}
                        </span>
                        <span className="font-medium">
                          {p.notes || "MoU payment"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{p.dueDate ?? "No scheduled date"}</span>
                        {p.invoiceAssigneeId ? (
                          <span>
                            Owner:{" "}
                            {assignees.find(
                              (person) => person.id === p.invoiceAssigneeId
                            )?.name ?? "Assigned"}
                          </span>
                        ) : null}
                        {p.invoice ? (
                          <Link
                            href={`/api/invoices/${p.invoice.id}`}
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                            target="_blank"
                          >
                            <FileText className="size-3.5" />
                            Invoice {p.invoice.invoiceNumber}
                          </Link>
                        ) : null}
                        {p.invoiceHistory
                          .filter((invoice) => invoice.status === "void")
                          .map((invoice) => (
                            <Link
                              key={invoice.id}
                              href={`/api/invoices/${invoice.id}`}
                              className="inline-flex items-center gap-1 hover:underline"
                              target="_blank"
                            >
                              <FileText className="size-3.5" />
                              Invoice {invoice.invoiceNumber} · void
                            </Link>
                          ))}
                        {p.invoice && canEdit ? (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => openInvoiceComposer(p)}
                          >
                            <Send className="size-3.5" />
                            {invoiceDrafts.some(
                              (draft) =>
                                draft.kind === "mou_invoice" &&
                                draft.contextId === p.invoice!.id
                            )
                              ? "Resume email"
                              : "Email invoice"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <span className="shrink-0 font-medium tabular-nums">
                      {money(p.amount, p.currency)}
                    </span>
                    {savingPaymentId === p.id ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
                        <Loader2 className="size-3.5 animate-spin" /> saving
                      </span>
                    ) : p.paidAt ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-success">
                        <CheckCircle2 className="size-3.5" /> received
                      </span>
                    ) : p.invoiceTaskId ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        <ReceiptText className="size-3.5" /> task assigned
                      </span>
                    ) : p.trigger === "on_52_episodes" && !episodeGateMet(p) ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        <ReceiptText className="size-3.5" /> waits for{" "}
                        {episodeMilestone ?? 52} episodes
                      </span>
                    ) : p.trigger === "on_completion" &&
                      projectStatus !== "completed" ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        <ReceiptText className="size-3.5" /> waits for completion
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                        <ReceiptText className="size-3.5" /> invoice needed
                      </span>
                    )}
                    {canEdit ? (
                      <div className="flex shrink-0 flex-wrap items-center gap-1">
                        {!p.paidAt ? (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Edit scheduled MoU payment"
                            title="Edit payment schedule"
                            disabled={pending || savingPaymentId === p.id}
                            onClick={() => beginEditing(p)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        ) : null}
                        {!p.paidAt && !p.invoiceTaskId ? (
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={
                              pending ||
                              savingPaymentId === p.id ||
                              (p.trigger === "on_completion" &&
                                projectStatus !== "completed") ||
                              (p.trigger === "on_52_episodes" &&
                                !episodeGateMet(p))
                            }
                            onClick={() =>
                              start(async () => {
                                const res = await requestMouInvoice(p.id);
                                if (res?.error) {
                                  toast.error(res.error);
                                  return;
                                }
                                toast.success("Invoice task assigned.");
                                router.refresh();
                              })
                            }
                          >
                            <Send className="size-3.5" />
                            Request invoice
                          </Button>
                        ) : null}
                        {!p.paidAt && !p.invoice ? (
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={
                              pending ||
                              savingPaymentId === p.id ||
                              Number(p.amount) <= 0
                            }
                            onClick={() =>
                              start(async () => {
                                const res = await generateMouInvoice(p.id);
                                if (res?.error) {
                                  toast.error(res.error);
                                  return;
                                }
                                toast.success(
                                  `Invoice ${res.invoiceNumber} generated.`
                                );
                                router.refresh();
                              })
                            }
                          >
                            <FileText className="size-3.5" />
                            Generate invoice
                          </Button>
                        ) : null}
                        {!p.paidAt && p.invoice ? (
                          <Button
                            variant="ghost"
                            size="xs"
                            disabled={pending || savingPaymentId === p.id}
                            onClick={async () => {
                              if (
                                !(await confirmDialog(`Void invoice ${p.invoice?.invoiceNumber}? The PDF will remain in history.`))
                              ) {
                                return;
                              }
                              start(async () => {
                                const result = await voidMouInvoice(p.invoice!.id);
                                if (result.error) {
                                  toast.error(result.error);
                                  return;
                                }
                                toast.success("Invoice voided.");
                                router.refresh();
                              });
                            }}
                          >
                            Void invoice
                          </Button>
                        ) : null}
                        {!p.paidAt ? (
                          <InvoiceImportButton
                            paymentId={p.id}
                            disabled={pending || savingPaymentId === p.id}
                          />
                        ) : null}
                        {p.paidAt ? (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Undo received payment"
                            disabled={pending || savingPaymentId === p.id}
                            onClick={() => setPaid(p, false)}
                          >
                            <RotateCcw className="size-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={pending || savingPaymentId === p.id}
                            onClick={() => {
                              setReceivingId(p.id);
                              setReceivedDate(new Date().toISOString().slice(0, 10));
                              setActualNetAmount(
                                (
                                  expectedNetCents(
                                    Math.round(Number(p.amount) * 100),
                                    deductionBps
                                  ) / 100
                                ).toFixed(2)
                              );
                            }}
                          >
                            Mark received
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Delete scheduled MoU payment"
                          disabled={pending || savingPaymentId === p.id}
                          onClick={() => removePayment(p)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ) : null}
                    {canEdit && receivingId === p.id ? (
                      <div className="basis-full rounded-lg border bg-muted/25 p-3">
                        <p className="mb-3 text-sm font-medium">
                          Review received funding
                        </p>
                        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
                          <div>
                            <Label>Gross received</Label>
                            <Input value={p.amount} disabled className="mt-1 tabular-nums" />
                          </div>
                          <div>
                            <Label>
                              Actual available after organization fee
                            </Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              className="mt-1 tabular-nums"
                              value={actualNetAmount}
                              onChange={(event) =>
                                setActualNetAmount(event.target.value)
                              }
                            />
                          </div>
                          <div>
                            <Label>Date received</Label>
                            <Input
                              type="date"
                              className="mt-1"
                              value={receivedDate}
                              onChange={(event) =>
                                setReceivedDate(event.target.value)
                              }
                            />
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setReceivingId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setPaid(p, true)}
                            disabled={!receivedDate || actualNetAmount === ""}
                          >
                            Confirm received
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {p.invoice && emailingInvoiceId === p.invoice.id ? (
                      <div className="basis-full space-y-3 rounded-lg border bg-muted/25 p-3">
                        <div>
                          <p className="font-medium">
                            Review invoice email
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Invoice {p.invoice.invoiceNumber} is attached as the
                            immutable PDF. Nothing is sent until you confirm.
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="grid gap-1">
                            <Label>To</Label>
                            <Input
                              type="email"
                              value={invoiceRecipient}
                              onChange={(event) =>
                                setInvoiceRecipient(event.target.value)
                              }
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label>Cc</Label>
                            <Input
                              value={invoiceCc}
                              placeholder="Separate emails with commas"
                              onChange={(event) =>
                                setInvoiceCc(event.target.value)
                              }
                            />
                          </div>
                          <div className="grid gap-1 sm:col-span-2">
                            <Label>Subject</Label>
                            <Input
                              value={invoiceSubject}
                              onChange={(event) =>
                                setInvoiceSubject(event.target.value)
                              }
                            />
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <Label>Message</Label>
                          <textarea
                            className="min-h-32 rounded-md border border-input bg-background p-3 text-sm"
                            value={invoiceBody}
                            onChange={(event) =>
                              setInvoiceBody(event.target.value)
                            }
                          />
                        </div>
                        <OutgoingAttachmentReview
                          attachments={[
                            {
                              name:
                                p.invoice.file?.originalName ||
                                `invoice-${p.invoice.invoiceNumber}.pdf`,
                              mimeType:
                                p.invoice.file?.mimeType || "application/pdf",
                              sizeBytes: p.invoice.file?.sizeBytes,
                              previewUrl: `/api/invoices/${p.invoice.id}?inline=1`,
                              description: `Invoice ${p.invoice.invoiceNumber}`,
                            },
                          ]}
                        />
                        <EmailDraftControls
                          hasSavedDraft={Boolean(savedInvoiceDraft)}
                          hasUnsavedChanges={invoiceHasUnsavedChanges}
                          saving={
                            invoiceDraftPending && !discardingInvoiceDraft
                          }
                          discarding={discardingInvoiceDraft}
                          updatedAt={savedInvoiceDraft?.updatedAt ?? null}
                          onSave={saveInvoiceDraft}
                          onDiscard={discardInvoiceDraft}
                        />
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={invoiceReviewed}
                            onChange={(event) =>
                              setInvoiceReviewed(event.target.checked)
                            }
                          />
                          I reviewed the recipient, message, and attached
                          invoice.
                        </label>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending || invoiceDraftPending}
                            onClick={closeInvoiceComposer}
                          >
                            Close
                          </Button>
                          <Button
                            size="sm"
                            disabled={
                              pending ||
                              invoiceDraftPending ||
                              !invoiceReviewed ||
                              !invoiceRecipient ||
                              !invoiceSubject ||
                              !invoiceBody
                            }
                            onClick={() => {
                              const invoiceId = p.invoice!.id;
                              const recipient = invoiceRecipient;
                              setInvoiceDelivery({
                                invoiceId,
                                status: "sending",
                                label: "Invoice email",
                                recipient,
                              });
                              start(async () => {
                                try {
                                  const result = await sendInvoiceEmail(
                                    invoiceId,
                                    {
                                      confirmed: true,
                                      recipientEmail: recipient,
                                      ccEmails: invoiceCc
                                        .split(/[,\n;]/)
                                        .map((email) => email.trim())
                                        .filter(Boolean),
                                      subject: invoiceSubject,
                                      body: invoiceBody,
                                    }
                                  );
                                  if (result.error) {
                                    setInvoiceDelivery(null);
                                    toast.error(result.error);
                                    return;
                                  }
                                  toast.success("Invoice email sent.");
                                  setInvoiceDrafts((current) =>
                                    current.filter(
                                      (draft) =>
                                        !(
                                          draft.kind === "mou_invoice" &&
                                          draft.contextId === invoiceId
                                        )
                                    )
                                  );
                                  setEmailingInvoiceId(null);
                                  setInvoiceDelivery({
                                    invoiceId,
                                    status: "sent",
                                    label: "Invoice email",
                                    recipient,
                                    sentAt: new Date().toISOString(),
                                  });
                                  router.refresh();
                                } catch (error) {
                                  setInvoiceDelivery(null);
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : "Could not send the invoice."
                                  );
                                }
                              });
                            }}
                          >
                            {invoiceDelivery?.invoiceId === p.invoice.id &&
                            invoiceDelivery.status === "sending" ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Send className="size-4" />
                            )}
                            {invoiceDelivery?.invoiceId === p.invoice.id &&
                            invoiceDelivery.status === "sending"
                              ? "Sending…"
                              : "Send invoice"}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {invoiceDelivery &&
                    invoiceDelivery.invoiceId === p.invoice?.id ? (
                      <OutgoingEmailStatus
                        delivery={invoiceDelivery}
                        className="basis-full"
                      />
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {visiblePayments.length > 0 ? (
          <div className="flex flex-col gap-1 border-t pt-2 text-sm">
            <span className="text-muted-foreground">
              {money(received, currency)} received of {money(scheduled, currency)}{" "}
              scheduled
            </span>
            {awaitingReceipt > 0 ? (
              <span className="text-xs text-muted-foreground">
                {awaitingReceipt} scheduled item
                {awaitingReceipt === 1 ? "" : "s"} awaiting receipt.
              </span>
            ) : null}
          </div>
        ) : null}

        {canEdit ? (
          adding ? (
            <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-1">
                <Label>Expected amount ({currency})</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div className="grid gap-1">
                <Label>Trigger</Label>
                <select
                  className={selectClass}
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                >
                  <option value="on_signing">On signing</option>
                  <option value="on_completion">On completion</option>
                  {episodeMilestone != null ? (
                    <option value="on_52_episodes">
                      After {episodeMilestone} episodes
                    </option>
                  ) : null}
                  <option value="custom">Custom date</option>
                </select>
              </div>
              <div className="grid gap-1">
                <Label>Expected date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label>Invoice owner</Label>
                <select
                  className={selectClass}
                  value={invoiceAssigneeId}
                  onChange={(e) => setInvoiceAssigneeId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {assignees.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1 lg:col-span-4">
                <Label>Partner invoice description</Label>
                <Input
                  value={publicDescription}
                  onChange={(e) => setPublicDescription(e.target.value)}
                  placeholder="e.g. First of two installments for project funding"
                />
              </div>
              <div className="grid gap-1 lg:col-span-4">
                <Label>Internal scheduling note</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. initial invoice on signing"
                />
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setTrigger("on_signing");
                    setNotes("Initial invoice on MoU signing");
                    setPublicDescription("Initial project funding installment");
                  }}
                >
                  Initial invoice
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setTrigger("on_completion");
                    setDueDate("");
                    setNotes("Final invoice when project is complete");
                    setPublicDescription("Final project funding installment");
                  }}
                >
                  Completion invoice
                </Button>
                {episodeMilestone != null ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setTrigger("on_52_episodes");
                      setNotes(
                        `Second payment after ${episodeMilestone} episodes published`
                      );
                      setPublicDescription(
                        `Project funding installment after ${episodeMilestone} published episodes`
                      );
                    }}
                  >
                    Episode milestone invoice
                  </Button>
                ) : null}
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAdding(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={submit} disabled={pending}>
                  Add MoU payment
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAdding(true)}
                disabled={pending}
              >
                <Plus className="size-4" />
                Schedule MoU payment
              </Button>
              {visiblePayments.length === 0 && fundingTarget > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={splitIntoTwo}
                  disabled={pending}
                >
                  Split partner total into 2
                </Button>
              ) : null}
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
