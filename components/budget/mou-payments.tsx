"use client";

import { FileLink } from "@/components/files/file-link";

import { invoiceEmailFallback, type DraftIdentity } from "@/lib/email/operational-drafts";
import { confirmDialog } from "@/lib/dialog-requests";

import { useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileSignature,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
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
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format";
import { usePropState } from "@/hooks/use-prop-state";
import { useSettle, useSuccessBeat } from "@/hooks/use-settle";
import { DoneCheck } from "@/components/ui/done-check";
import { InvoiceImportButton } from "@/components/budget/invoice-import-button";
import { expectedNetCents } from "@/lib/budget/compute";
import {
  basisForFundingPath,
  EXPECTED_PAYMENT_BASIS_LABELS,
  expectedPaymentTriggerLabel,
  type ExpectedPaymentBasis,
} from "@/lib/budget/funding-path";
import { HelpTip } from "@/components/ui/help-tip";
import { PaymentAmountField } from "./payment-amount-field";
import { isOutgoingPaymentTerms, suggestPercentagePayments, type PaymentPercentageCalculation } from "@/lib/budget/payment-percentage";
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
  /** Whether an MoU backs this promise; null on older payments. */
  fundingBasis?: ExpectedPaymentBasis | null;
  partnerName?: string | null;
  proposalId?: string | null;
  dueDate: string | null;
  notes: string | null;
  publicDescription: string | null;
  invoiceAssigneeId: string | null;
  invoiceTaskId: string | null;
  invoiceRequestedAt: string | Date | null;
  paidAt: string | Date | null;
  receivedAmount?: string | null;
  donationLinked?: boolean;
  invoice: {
    id: string;
    invoiceNumber: string;
    recipientName?: string | null;
    recipientEmail: string | null;
    description?: string;
    issueDate?: string;
    dueDate?: string | null;
    status?: string;
    /** Made by Sastra, not an uploaded invoice file. */
    generated?: boolean;
    file: {
      id?: string;
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

/** A sent proposal an expected payment can answer. */
export type PaymentProposalOption = {
  id: string;
  label: string;
  fundingPath: string | null;
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

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
  fundingBasis: ExpectedPaymentBasis | "";
  proposalId: string;
  invoiceIssueDate?: string;
  invoiceDueDate?: string;
};

/** Says whether an MoU backs the promise, and which proposal it answers. */
function AgreementFields({
  fundingBasis,
  proposalId,
  proposals,
  onChange,
}: {
  fundingBasis: ExpectedPaymentBasis | "";
  proposalId: string;
  proposals: PaymentProposalOption[];
  onChange: (patch: {
    fundingBasis?: ExpectedPaymentBasis | "";
    proposalId?: string;
  }) => void;
}) {
  const id = useId();
  return (
    <>
      <div className="grid gap-1">
        <Label htmlFor={`${id}-agreement`} className="flex items-center gap-1">
          Agreement
          <HelpTip title="Agreement">
            Choose MoU when a signed MoU promises this money. Choose No MoU
            when the partner agreed by email or in conversation.
          </HelpTip>
        </Label>
        <select
          id={`${id}-agreement`}
          className={selectClass}
          value={fundingBasis}
          onChange={(event) =>
            onChange({
              fundingBasis: event.target.value as ExpectedPaymentBasis | "",
            })
          }
        >
          <option value="mou">MoU</option>
          <option value="no_mou">No MoU</option>
          <option value="">Not recorded</option>
        </select>
      </div>
      {proposals.length > 0 ? (
        <div className="grid gap-1">
          <Label htmlFor={`${id}-proposal`}>Proposal</Label>
          <select
            id={`${id}-proposal`}
            className={selectClass}
            value={proposalId}
            onChange={(event) => {
              const proposal = proposals.find(
                (option) => option.id === event.target.value
              );
              const basis = basisForFundingPath(proposal?.fundingPath);
              onChange({
                proposalId: event.target.value,
                ...(basis ? { fundingBasis: basis } : {}),
              });
            }}
          >
            <option value="">No proposal</option>
            {proposals.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </>
  );
}

function PaymentEditor({
  draft,
  currency,
  assignees,
  proposals,
  episodeMilestone,
  pending,
  onChange,
  onSave,
  onCancel,
  calculation,
  quotationTotal,
  onInvoice,
  error,
  invoiceNumber,
}: {
  draft: PaymentDraft;
  currency: string;
  assignees: Person[];
  proposals: PaymentProposalOption[];
  episodeMilestone: number | null;
  pending: boolean;
  onChange: (patch: Partial<PaymentDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  calculation?: PaymentPercentageCalculation;
  quotationTotal: number;
  onInvoice?: () => void;
  error: string | null;
  invoiceNumber?: string;
}) {
  const id = useId();

  return (
    <fieldset disabled={pending} aria-busy={pending} className="grid min-w-0 items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1 sm:col-span-2 lg:col-span-4">
        <p className="font-medium">Edit expected payment{invoiceNumber ? ` · Invoice ${invoiceNumber}` : ""}</p>
        {invoiceNumber ? <p className="text-xs text-muted-foreground">Save the payment and its unsent invoice together. The invoice number stays the same. Review the refreshed PDF before sending.</p> : null}
      </div>
      <PaymentAmountField value={draft.amount} currency={currency} calculation={calculation}
        quotationTotal={quotationTotal} disabled={pending} onChange={(amount) => onChange({ amount })} />
      <div className="grid gap-1">
        <Label htmlFor={`${id}-trigger`}>Trigger</Label>
        <select
          id={`${id}-trigger`}
          className={selectClass}
          value={draft.trigger}
          onChange={(event) =>
            onChange({ trigger: event.target.value as MouTrigger })
          }
        >
          <option value="on_signing">
            {expectedPaymentTriggerLabel("on_signing", draft.fundingBasis)}
          </option>
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
        <Label htmlFor={`${id}-date`}>Expected date</Label>
        <Input
          id={`${id}-date`}
          type="date"
          value={draft.dueDate}
          onChange={(event) => onChange({ dueDate: event.target.value })}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`${id}-owner`}>Invoice owner</Label>
        <select
          id={`${id}-owner`}
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
      <AgreementFields
        fundingBasis={draft.fundingBasis}
        proposalId={draft.proposalId}
        proposals={proposals}
        onChange={onChange}
      />
      {invoiceNumber ? <>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-invoice-date`}>Invoice date</Label>
          <Input id={`${id}-invoice-date`} type="date" value={draft.invoiceIssueDate ?? ""} onChange={(event) => onChange({ invoiceIssueDate: event.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-invoice-due`}>Invoice due date</Label>
          <Input id={`${id}-invoice-due`} type="date" value={draft.invoiceDueDate ?? ""} onChange={(event) => onChange({ invoiceDueDate: event.target.value })} />
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">The expected date is for planning. Invoice dates appear on the PDF.</p>
      </> : null}
      <div className="grid gap-1.5 sm:col-span-2 lg:col-span-4">
        <Label htmlFor={`${id}-description`}>{invoiceNumber ? "Invoice description" : "Partner invoice description"}</Label>
        <textarea id={`${id}-description`} rows={invoiceNumber ? 4 : 2} value={draft.publicDescription} maxLength={2000}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => onChange({ publicDescription: event.target.value })}
          placeholder="Describe what this payment covers" />
      </div>
      <div className="grid gap-1.5 sm:col-span-2 lg:col-span-4">
        <Label htmlFor={`${id}-notes`}>Internal scheduling note</Label>
        <textarea rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          id={`${id}-notes`}
          value={draft.notes}
          maxLength={500}
          onChange={(event) => onChange({ notes: event.target.value })}
          placeholder="e.g. first invoice after the partner agreed"
        />
      </div>
      {error ? <p role="alert" className="text-sm text-destructive sm:col-span-2 lg:col-span-4">{error}</p> : null}
      {onInvoice ? <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">Review the amount and description. Generating an invoice creates a PDF for review.</p> : null}
      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2 lg:col-span-4">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          <X className="size-4" />
          Cancel
        </Button>
        <Button size="sm" variant={onInvoice ? "outline" : "default"} onClick={onSave} disabled={pending}>
          <Save className="size-4" />
          {pending ? invoiceNumber ? "Updating payment & invoice…" : "Saving…" : invoiceNumber ? "Save payment & refresh invoice" : "Save changes"}
        </Button>
        {onInvoice ? <Button size="sm" onClick={onInvoice} disabled={pending || Number(draft.amount) <= 0 || !Number.isFinite(Number(draft.amount))}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
          {pending ? "Preparing invoice…" : "Save & generate invoice"}
        </Button> : null}
      </div>
    </fieldset>
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

function PaymentStatus({ payment, saving, waitingForCompletion, waitingForEpisodes }: {
  payment: Payment; saving: boolean; waitingForCompletion: boolean; waitingForEpisodes: boolean;
}) {
  const status = saving ? { label: "Updating…", tone: "bg-info/10 text-info" }
    : payment.paidAt || payment.invoice?.status === "received" ? { label: "Received", tone: "bg-success/10 text-success" }
    : payment.invoice?.status === "sent" ? { label: "Sent", tone: "bg-info/10 text-info" }
    : payment.invoice?.status === "sending" ? { label: "Sending", tone: "bg-info/10 text-info" }
    : payment.invoice ? { label: payment.invoice.status === "issued" ? "Ready to send" : "Invoice saved", tone: "bg-primary/10 text-primary" }
    : isOutgoingPaymentTerms(payment.notes) ? { label: "Review fee", tone: "bg-warning/10 text-warning-text" }
    : waitingForCompletion ? { label: "Awaiting completion", tone: "bg-muted text-muted-foreground" }
    : waitingForEpisodes ? { label: "Awaiting episodes", tone: "bg-muted text-muted-foreground" }
    : { label: Number(payment.amount) > 0 ? "Invoice needed" : "Amount needed", tone: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.tone}`}>
    {saving ? <Loader2 className="size-3 animate-spin" /> : payment.paidAt ? <CheckCircle2 className="size-3" /> : null}{status.label}
  </span>;
}

function canEditPaymentInvoice(payment: Payment) {
  return !payment.paidAt && payment.invoice?.status === "issued" &&
    payment.invoice.generated && Boolean(payment.invoice.file?.id);
}

export function MouPayments({
  hasSharedSchedule = false,
  projectId,
  projectTitle,
  emailIdentity,
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
  proposals = [],
  defaultBasis = "mou",
  unlinkedReceivedAmount = 0,
  rightsHref,
  fundingPartner,
}: {
  /** The project's funding partner, when one is known. */
  fundingPartner?: { name: string | null; email: string | null };
  /** Sent proposals in this budget scope that a payment can answer. */
  proposals?: PaymentProposalOption[];
  /** Agreement preselected for a new payment, from the project's MoU status. */
  defaultBasis?: ExpectedPaymentBasis;
  projectId: string;
  projectTitle: string;
  emailIdentity: DraftIdentity;
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
  /** Received funding in this currency/scope that is not linked to this schedule. */
  unlinkedReceivedAmount?: number;
  rightsHref?: string;
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
  const [fundingBasis, setFundingBasis] = useState<ExpectedPaymentBasis | "">(
    defaultBasis
  );
  const [proposalId, setProposalId] = useState("");
  const proposalLabel = (id: string | null | undefined) =>
    proposals.find((option) => option.id === id)?.label ?? null;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<PaymentDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editingInvoiceVersion, setEditingInvoiceVersion] = useState<{ invoiceId: string; fileId: string } | null>(null);
  const [editingCalculation, setEditingCalculation] = useState<PaymentPercentageCalculation | undefined>(undefined);
  const savingPayments = useRef(new Set<string>());
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);
  const [generatingInvoiceId, setGeneratingInvoiceId] = useState<string | null>(null);
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
  const [reviewedInvoiceFile, setReviewedInvoiceFile] = useState<string | null>(null);
  const currentInvoiceFile = visiblePayments.find((payment) => payment.invoice?.id === emailingInvoiceId)?.invoice?.file?.id ?? null;
  const invoiceReviewed = Boolean(currentInvoiceFile) && reviewedInvoiceFile === currentInvoiceFile;
  function setInvoiceReviewed(reviewed: boolean) { setReviewedInvoiceFile(reviewed ? currentInvoiceFile : null); }
  const [invoiceDraftPending, startInvoiceDraftMutation] = useTransition();
  const [discardingInvoiceDraft, setDiscardingInvoiceDraft] = useState(false);
  const [invoiceDrafts, setInvoiceDrafts] = usePropState(initialEmailDrafts);
  const { settle } = useSettle();
  const sentBeat = useSuccessBeat();
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
  const percentageSuggestions = useMemo(
    () => suggestPercentagePayments(visiblePayments, { total: fundingTarget, currency }),
    [visiblePayments, fundingTarget, currency]
  );
  const received = visiblePayments
    .filter((p) => p.paidAt)
    .reduce((s, p) => s + Number(p.receivedAmount ?? p.amount), 0);
  const awaitingReceipt = visiblePayments.filter((p) => !p.paidAt).length;
  const amountsToReview = visiblePayments.filter((p) => !p.paidAt && Number(p.amount) <= 0).length;
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
      // An invoice issued before the partner was known has no recipient of its own.
      saved?.toAddresses[0] || payment.invoice.recipientEmail || fundingPartner?.email || ""
    );
    setInvoiceCc(
      saved ? saved.ccAddresses.join(", ") : defaultCcEmails.join(", ")
    );
    const initial = invoiceEmailFallback({
      ...emailIdentity,
      invoiceNumber: payment.invoice.invoiceNumber,
      projectTitles: [projectTitle],
      amountLabel: new Intl.NumberFormat(undefined, { style: "currency", currency: payment.currency, currencyDisplay: "code" }).format(Number(payment.amount)),
      paymentTrigger: payment.trigger,
    });
    setInvoiceSubject(saved?.subject ?? initial.subject);
    setInvoiceBody(saved?.body ?? initial.body);
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
          fundingBasis: defaultBasis,
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
      fundingBasis: fundingBasis || null,
      proposalId: proposalId || null,
      partnerName: proposalLabel(proposalId),
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
      fundingBasis,
      proposalId,
    };
    setVisiblePayments((current) => [...current, optimistic]);
    setAmount("");
    setDueDate("");
    setNotes("");
    setPublicDescription("");
    setTrigger("on_signing");
    setInvoiceAssigneeId("");
    setFundingBasis(defaultBasis);
    setProposalId("");
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
          fundingBasis: draft.fundingBasis || null,
          proposalId: draft.proposalId || null,
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
        setFundingBasis(draft.fundingBasis);
        setProposalId(draft.proposalId);
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
    if (payment.paidAt || savingPayments.current.size > 0) return;
    if (payment.invoice && !canEditPaymentInvoice(payment)) {
      toast.error("Only unsent, generated invoices can be edited. Sent or uploaded invoices keep their original PDF.");
      return;
    }
    setEditingInvoiceVersion(payment.invoice ? { invoiceId: payment.invoice.id, fileId: payment.invoice.file!.id! } : null);
    setEditError(null);
    setEditingId(payment.id);
    const calculation = payment.invoice ? undefined : percentageSuggestions.get(payment.id);
    setEditingCalculation(calculation);
    setEditDraft({
      amount: calculation ? (calculation.amountCents / 100).toFixed(2) : payment.amount,
      trigger: payment.trigger as MouTrigger,
      dueDate: payment.dueDate ?? "",
      notes: payment.notes ?? "",
      publicDescription: payment.invoice?.description ?? payment.publicDescription ?? "",
      invoiceAssigneeId: payment.invoiceAssigneeId ?? "",
      fundingBasis: payment.fundingBasis ?? "",
      proposalId: payment.proposalId ?? "",
      ...(payment.invoice ? { invoiceIssueDate: payment.invoice.issueDate ?? "", invoiceDueDate: payment.invoice.dueDate ?? "" } : {}),
    });
  }

  function saveEditing(payment: Payment, generateInvoice = false) {
    if (!editDraft || editingId !== payment.id || savingPayments.current.has(payment.id)) return;
    const value = Number(editDraft.amount);
    const refreshInvoice = Boolean(payment.invoice);
    if (refreshInvoice && (!editingInvoiceVersion || !editDraft.publicDescription.trim() || !editDraft.invoiceIssueDate)) {
      setEditError("Enter an invoice date and description before saving."); return;
    }
    if (!Number.isFinite(value) || value < 0 || ((generateInvoice || refreshInvoice) && value === 0)) {
      const message = generateInvoice || refreshInvoice ? "Enter an amount greater than zero for the invoice." : "Enter an amount of zero or more.";
      setEditError(message);
      toast.error(message);
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
      fundingBasis: draft.fundingBasis || null,
      proposalId: draft.proposalId || null,
      partnerName:
        draft.proposalId === (payment.proposalId ?? "")
          ? payment.partnerName
          : proposalLabel(draft.proposalId),
    };
    setEditError(null);
    if (!generateInvoice && !refreshInvoice) {
      setVisiblePayments((current) =>
        current.map((item) => (item.id === payment.id ? optimistic : item))
      );
      setEditingId(null);
      setEditDraft(null);
    }
    savingPayments.current.add(payment.id);
    setSavingPaymentId(payment.id);
    startEditTransition(async () => {
      let amountSaved = false;
      try {
        const result = await updatePayment(payment.id, {
          amount: value,
          trigger: draft.trigger,
          dueDate: draft.dueDate,
          notes: draft.notes,
          publicDescription: draft.publicDescription,
          invoiceAssigneeId: draft.invoiceAssigneeId || null,
          fundingBasis: draft.fundingBasis || null,
          proposalId: draft.proposalId || null,
          ...(refreshInvoice ? { invoiceVersion: editingInvoiceVersion!, invoiceIssueDate: draft.invoiceIssueDate, invoiceDueDate: draft.invoiceDueDate } : {}),
        });
        if (result.error) throw new Error(result.error);
        if (refreshInvoice && !result.invoice?.file) throw new Error("The invoice could not be refreshed. Your edits are still here. Try again.");
        amountSaved = true;
        if (refreshInvoice && result.invoice?.file) {
          const invoice = result.invoice;
          setVisiblePayments((rows) => rows.map((row) => row.id === payment.id && row.invoice ? {
            ...optimistic, invoice: { ...row.invoice, description: invoice.description, file: invoice.file!, issueDate: draft.invoiceIssueDate, dueDate: draft.invoiceDueDate || null },
          } : row));
          setInvoiceReviewed(false);
          setEditingId(null); setEditDraft(null); setEditingInvoiceVersion(null);
          toast.success(`Payment and invoice ${invoice.invoiceNumber} updated. Review the PDF before sending.`);
        } else if (generateInvoice) {
          const invoice = await generateMouInvoice(payment.id);
          if (invoice.error) throw new Error(invoice.error);
          setVisiblePayments((current) => current.map((item) => item.id === payment.id ? optimistic : item));
          setEditingId(null);
          setEditDraft(null);
          toast.success(`Invoice ${invoice.invoiceNumber} generated.`);
        } else toast.success("Expected payment updated.");
        router.refresh();
      } catch (error) {
        setVisiblePayments(amountSaved ? previous.map((item) => item.id === payment.id ? optimistic : item) : previous);
        setEditingId(payment.id);
        setEditDraft(draft);
        const message = error instanceof Error ? error.message : "Try saving the payment again.";
        const detail = amountSaved && generateInvoice ? `Payment saved. Invoice could not be generated. ${message}` : message;
        setEditError(detail);
        toast.error(detail);
        if (amountSaved) router.refresh();
      } finally {
        savingPayments.current.delete(payment.id);
        setSavingPaymentId(null);
      }
    });
  }

  function prepareSavedInvoice(payment: Payment) {
    if (savingPayments.current.has(payment.id)) return;
    savingPayments.current.add(payment.id);
    setGeneratingInvoiceId(payment.id);
    start(async () => {
      try {
        const result = await generateMouInvoice(payment.id);
        if (result.error) throw new Error(result.error);
        toast.success(`Invoice ${result.invoiceNumber} generated.`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not generate the invoice. Try again.");
      } finally {
        savingPayments.current.delete(payment.id);
        setGeneratingInvoiceId(null);
      }
    });
  }

  function beginReceiving(payment: Payment) {
    setReceivingId(payment.id);
    setReceivedDate(new Date().toISOString().slice(0, 10));
    setActualNetAmount((expectedNetCents(Math.round(Number(payment.amount) * 100), deductionBps) / 100).toFixed(2));
  }

  function refreshSavedInvoice(payment: Payment) {
    if (savingPayments.current.has(payment.id)) return;
    savingPayments.current.add(payment.id); setGeneratingInvoiceId(payment.id);
    start(async () => {
      try {
        const result = await generateMouInvoice(payment.id, { regenerate: true });
        if (result.error) throw new Error(result.error);
        setInvoiceReviewed(false); router.refresh();
        toast.success(`Invoice ${result.invoiceNumber} refreshed. Review it before sending.`);
      } catch (error) { toast.error(error instanceof Error ? error.message : "Could not refresh the invoice."); }
      finally { savingPayments.current.delete(payment.id); setGeneratingInvoiceId(null); }
    });
  }

  async function voidSavedInvoice(payment: Payment) {
    if (!payment.invoice || !(await confirmDialog(`Void invoice ${payment.invoice.invoiceNumber}? The PDF will remain in history.`))) return;
    const invoiceId = payment.invoice.id;
    start(async () => {
      try { const result = await voidMouInvoice(invoiceId); if (result.error) throw new Error(result.error); toast.success("Invoice voided."); router.refresh(); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Could not void the invoice."); }
    });
  }

  async function removePayment(payment: Payment) {
    if (!(await confirmDialog("Delete this expected payment?"))) return;
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
            {printRunId ? "Reprint expected payments" : "Expected payments"}
          </h2>
          <HelpTip title="Expected payments">
            Money a partner has promised for a set amount. The promise can come
            from an MoU or from an agreement without an MoU. Donations with no
            set amount arrive through Donations instead.
          </HelpTip>
        </div>
        {visiblePayments.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">
            <p>{hasSharedSchedule ? "Shared installments are shown on the agreement above." : "No expected payments yet. Add one when a partner promises a set amount, with or without an MoU."}</p>
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {visiblePayments.map((p) => (
              <li
                key={p.id}
                id={`mou-payment-${p.id}`}
                className={
                  editingId === p.id
                    ? "bg-muted/20 px-3 py-3 text-sm"
                    : "space-y-4 px-4 py-4 text-sm"
                }
              >
                {editingId === p.id && editDraft ? (
                  <>
                  {!p.invoice && unlinkedReceivedAmount > 0 ? <p className="mb-3 text-sm text-muted-foreground">
                    {money(unlinkedReceivedAmount, currency)} is already recorded outside this payment schedule.
                    {" "}Check received funding before invoicing it again.
                    {" "}<a href="#cash-reconciliation" className="font-medium text-primary underline underline-offset-4">Review received funding</a>
                  </p> : null}
                  {!p.invoice && isOutgoingPaymentTerms(editDraft.notes) ? <p className="mb-3 text-sm text-warning-text">This term describes a payment to the licensor. {rightsHref ? <a className="font-medium underline underline-offset-4" href={rightsHref}>Review it under Rights & MOUs</a> : "Review it under Rights & MOUs"} before creating an incoming invoice.</p> : null}
                  <PaymentEditor
                    key={p.id}
                    invoiceNumber={p.invoice?.invoiceNumber}
                    draft={editDraft}
                    currency={p.currency}
                    assignees={assignees}
                    proposals={proposals}
                    episodeMilestone={episodeMilestone}
                    pending={savingPaymentId === p.id}
                    calculation={editingCalculation}
                    quotationTotal={p.currency === currency ? fundingTarget : 0}
                    error={editError}
                    onInvoice={!p.invoice && !isOutgoingPaymentTerms(editDraft.notes) ? () => saveEditing(p, true) : undefined}
                    onChange={(patch) =>
                      setEditDraft((current) =>
                        current ? { ...current, ...patch } : current
                      )
                    }
                    onSave={() => saveEditing(p)}
                    onCancel={() => {
                      setEditingId(null);
                      setEditingInvoiceVersion(null);
                      setEditDraft(null);
                      setEditError(null);
                    }}
                  />
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {p.invoice ? <FileLink intent="preview" href={`/api/invoices/${p.invoice.id}`} className="inline-flex min-h-8 items-center gap-1.5 font-semibold text-foreground underline-offset-4 hover:underline">
                            <FileText className="size-4 shrink-0 text-muted-foreground" />Invoice {p.invoice.invoiceNumber}
                          </FileLink> : <p className="font-semibold">{expectedPaymentTriggerLabel(p.trigger, p.fundingBasis)}</p>}
                          <PaymentStatus payment={p} saving={savingPaymentId === p.id || generatingInvoiceId === p.id}
                            waitingForCompletion={p.trigger === "on_completion" && projectStatus !== "completed"}
                            waitingForEpisodes={p.trigger === "on_52_episodes" && !episodeGateMet(p)} />
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {p.invoice ? <span>{expectedPaymentTriggerLabel(p.trigger, p.fundingBasis)}</span> : null}
                          <span>{p.dueDate ? `Expected ${formatDate(p.dueDate)}` : "No expected date"}</span>
                          {p.invoiceAssigneeId ? <span>Owner: {assignees.find((person) => person.id === p.invoiceAssigneeId)?.name ?? "Assigned"}</span> : null}
                          {p.invoiceTaskId ? <span>Invoice task assigned</span> : null}
                          {p.fundingBasis ? <span>{EXPECTED_PAYMENT_BASIS_LABELS[p.fundingBasis]}</span> : null}
                          {p.partnerName ? <span>{p.partnerName}</span> : null}
                          {p.paidAt && p.donationLinked ? <span>Linked from Donations</span> : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-semibold tabular-nums sm:text-lg">{percentageSuggestions.has(p.id) && !p.paidAt
                          ? money(percentageSuggestions.get(p.id)!.amountCents / 100, p.currency) : money(p.amount, p.currency)}</p>
                        {percentageSuggestions.has(p.id) && !p.paidAt ? <p className="mt-1 text-xs text-muted-foreground">Suggested · {percentageSuggestions.get(p.id)!.percentage}%</p> : null}
                        {p.paidAt && p.receivedAmount && Number(p.receivedAmount) !== Number(p.amount) ? <p className="mt-1 text-xs tabular-nums text-muted-foreground">{money(p.receivedAmount, p.currency)} received</p> : null}
                      </div>
                    </div>
                    {p.notes ? <p className="max-w-prose whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground">{p.notes}</p> : null}
                    {p.invoiceHistory.some((invoice) => invoice.status === "void") ? <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Previous invoices</summary>
                      <div className="mt-2 flex flex-wrap gap-3">{p.invoiceHistory.filter((invoice) => invoice.status === "void").map((invoice) => <FileLink key={invoice.id} intent="preview" href={`/api/invoices/${invoice.id}`} className="underline underline-offset-4">Invoice {invoice.invoiceNumber} · void</FileLink>)}</div>
                    </details> : null}
                    {canEdit ? <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
                      {!p.paidAt && !p.invoice ? <Button size="sm" disabled={pending || savingPaymentId === p.id || generatingInvoiceId === p.id}
                        onClick={() => Number(p.amount) <= 0 || isOutgoingPaymentTerms(p.notes) ? beginEditing(p) : prepareSavedInvoice(p)}>
                        {generatingInvoiceId === p.id ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                        {isOutgoingPaymentTerms(p.notes) ? "Review fee" : Number(p.amount) <= 0 ? "Review & invoice" : generatingInvoiceId === p.id ? "Generating invoice…" : "Generate invoice"}
                      </Button> : null}
                      {p.invoice?.status === "issued" && !p.paidAt ? <Button size="sm" onClick={() => openInvoiceComposer(p)} disabled={pending || savingPaymentId === p.id}>
                        <Send className="size-4" />{invoiceDrafts.some((draft) => draft.kind === "mou_invoice" && draft.contextId === p.invoice!.id) ? "Resume email" : "Review & send"}
                      </Button> : p.invoice ? <Button size="sm" variant="outline" nativeButton={false} render={<FileLink intent="preview" href={`/api/invoices/${p.invoice.id}`} />}><FileText className="size-4" />View invoice</Button> : null}
                      {!p.paidAt && (!p.invoice || canEditPaymentInvoice(p)) ? <Button type="button" size="sm" variant="ghost" onClick={() => beginEditing(p)} disabled={pending || savingPaymentId !== null}>
                        <Pencil className="size-4" />Edit payment
                      </Button> : null}
                      {!p.paidAt && Number(p.amount) > 0 && !isOutgoingPaymentTerms(p.notes) ? <Button size="sm" variant="outline" disabled={pending || savingPaymentId === p.id} onClick={() => beginReceiving(p)}>
                        <CheckCircle2 className="size-4" />Mark received
                      </Button> : null}
                      {!(p.paidAt && p.donationLinked) ? <DropdownMenu>
                        <DropdownMenuTrigger render={<Button type="button" size="sm" variant="outline" aria-label={`More actions for ${p.invoice ? `invoice ${p.invoice.invoiceNumber}` : "expected payment"}`} disabled={pending || savingPaymentId === p.id} />}>
                          <MoreHorizontal className="size-4" />More
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                          {!p.paidAt && !p.invoice && !p.invoiceTaskId && Number(p.amount) > 0 && !isOutgoingPaymentTerms(p.notes) ? <DropdownMenuItem className="min-h-11" disabled={(p.trigger === "on_completion" && projectStatus !== "completed") || (p.trigger === "on_52_episodes" && !episodeGateMet(p))} onClick={() => start(async () => {
                            try { const result = await requestMouInvoice(p.id); if (result.error) throw new Error(result.error); toast.success("Invoice task assigned."); router.refresh(); }
                            catch (error) { toast.error(error instanceof Error ? error.message : "Could not assign the invoice task."); }
                          })}><Send className="size-4" />Request invoice task</DropdownMenuItem> : null}
                          {!p.paidAt && p.invoice?.status === "issued" && p.invoice.generated && fundingPartner?.name ? <DropdownMenuItem className="min-h-11" onClick={() => refreshSavedInvoice(p)}><FileText className="size-4" />Refresh invoice</DropdownMenuItem> : null}
                          {!p.paidAt && !isOutgoingPaymentTerms(p.notes) ? <InvoiceImportButton paymentId={p.id} asMenuItem disabled={pending || savingPaymentId === p.id} /> : null}
                          {p.paidAt && !p.donationLinked ? <DropdownMenuItem className="min-h-11" onClick={() => setPaid(p, false)}><RotateCcw className="size-4" />Undo received payment</DropdownMenuItem> : null}
                          {p.invoice && !p.paidAt && ["issued", "sent"].includes(p.invoice.status ?? "") ? <><DropdownMenuSeparator /><DropdownMenuItem className="min-h-11" variant="destructive" onClick={() => voidSavedInvoice(p)}><X className="size-4" />Void invoice</DropdownMenuItem></> : null}
                          {!p.invoice ? <><DropdownMenuSeparator /><DropdownMenuItem className="min-h-11" variant="destructive" disabled={Boolean(p.paidAt)} onClick={() => removePayment(p)}><Trash2 className="size-4" />Delete expected payment</DropdownMenuItem></> : null}
                        </DropdownMenuContent>
                      </DropdownMenu> : null}
                    </div> : null}
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
                            current PDF. Nothing is sent until you confirm.
                          </p>
                          {canEdit && canEditPaymentInvoice(p) ? <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => beginEditing(p)}>
                            <Pencil className="size-3.5" />Edit payment
                          </Button> : null}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="grid gap-1">
                            <Label htmlFor={`invoice-email-to-${p.invoice.id}`}>To</Label>
                            <Input
                              id={`invoice-email-to-${p.invoice.id}`}
                              type="email"
                              value={invoiceRecipient}
                              onChange={(event) =>
                                setInvoiceRecipient(event.target.value)
                              }
                            />
                            {!invoiceRecipient.trim() ? (
                              <p className="text-xs text-warning-text">
                                Type the partner’s email. To fill it in next time,{" "}
                                <a href="#funding-partner" className="underline underline-offset-4">add it to the funding partner</a>.
                              </p>
                            ) : null}
                          </div>
                          <div className="grid gap-1">
                            <Label htmlFor={`invoice-email-cc-${p.invoice.id}`}>Cc</Label>
                            <Input
                              id={`invoice-email-cc-${p.invoice.id}`}
                              value={invoiceCc}
                              placeholder="Separate emails with commas"
                              onChange={(event) =>
                                setInvoiceCc(event.target.value)
                              }
                            />
                          </div>
                          <div className="grid gap-1 sm:col-span-2">
                            <Label htmlFor={`invoice-email-subject-${p.invoice.id}`}>Subject</Label>
                            <Input
                              id={`invoice-email-subject-${p.invoice.id}`}
                              value={invoiceSubject}
                              onChange={(event) =>
                                setInvoiceSubject(event.target.value)
                              }
                            />
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor={`invoice-email-message-${p.invoice.id}`}>Message</Label>
                          <textarea
                            id={`invoice-email-message-${p.invoice.id}`}
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
                              previewUrl: `/api/invoices/${p.invoice.id}?inline=1&version=${p.invoice.file?.id ?? ""}`,
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
                                      reviewedFileId: p.invoice?.file?.id,
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
                                  // Confirm on the button, then close the
                                  // email and show the sent confirmation.
                                  await sentBeat.play();
                                  settle(() => {
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
                                  }, '[data-email-status="sent"]');
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
                            {sentBeat.done ? (
                              <DoneCheck />
                            ) : invoiceDelivery?.invoiceId === p.invoice.id &&
                              invoiceDelivery.status === "sending" ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Send className="size-4" />
                            )}
                            {sentBeat.done
                              ? "Sent"
                              : invoiceDelivery?.invoiceId === p.invoice.id &&
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
              {amountsToReview > 0 ? <>
                {amountsToReview} payment amount{amountsToReview === 1 ? " needs" : "s need"} review.
                {" "}{scheduled > 0 ? `Saved amounts total ${money(scheduled, currency)}.` : "No payment amounts saved yet."}
              </> : <>
                {received > 0 ? money(received, currency) : "Nothing"} received of{" "}
                {money(scheduled, currency)} expected
              </>}
            </span>
            {awaitingReceipt > 0 ? (
              <span className="text-xs text-muted-foreground">
                {awaitingReceipt} expected payment
                {awaitingReceipt === 1 ? "" : "s"} not received yet.
              </span>
            ) : null}
          </div>
        ) : null}

        {canEdit ? (
          adding ? (
            <div className="grid items-start gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <PaymentAmountField value={amount} currency={currency} quotationTotal={fundingTarget} disabled={pending} onChange={setAmount} />
              <div className="grid gap-1">
                <Label>Trigger</Label>
                <select
                  className={selectClass}
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                >
                  <option value="on_signing">
                    {expectedPaymentTriggerLabel("on_signing", fundingBasis)}
                  </option>
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
              <AgreementFields
                fundingBasis={fundingBasis}
                proposalId={proposalId}
                proposals={proposals}
                onChange={(patch) => {
                  if (patch.fundingBasis !== undefined) setFundingBasis(patch.fundingBasis);
                  if (patch.proposalId !== undefined) setProposalId(patch.proposalId);
                }}
              />
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
                  placeholder="e.g. first invoice after the partner agreed"
                />
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setTrigger("on_signing");
                    setNotes(
                      fundingBasis === "no_mou"
                        ? "Initial invoice after the partner agreed"
                        : "Initial invoice on MoU signing"
                    );
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
                  Add expected payment
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
                Add expected payment
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
