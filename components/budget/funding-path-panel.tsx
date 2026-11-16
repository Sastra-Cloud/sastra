"use client";

import { useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MessageSquareReply } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpTip } from "@/components/ui/help-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePropState } from "@/hooks/use-prop-state";
import { useSettle } from "@/hooks/use-settle";
import {
  buildFundingPath,
  PROPOSAL_ANSWER_LABELS,
  type FundingPathRow,
  type ProposalAnswer,
} from "@/lib/budget/funding-path";
import { formatDate } from "@/lib/format";
import { setProposalAnswer } from "@/lib/proposals/answer-actions";
import { cn } from "@/lib/utils";

export type FundingPathProposalDTO = {
  id: string;
  /** Partner organization, or the contact when no organization was saved. */
  partnerLabel: string;
  recipientEmail: string;
  /** Partner quotation title, when the proposal covered one share. */
  scopeLabel: string | null;
  currency: string;
  totalAmount: string;
  status: string;
  fundingPath: string | null;
  agreedAmount: string | null;
  answeredOn: string | null;
  answerNote: string | null;
  sentAt: string;
};

export type FundingPathPaymentDTO = {
  id: string;
  proposalId: string | null;
  amount: string;
  paidAt: string | Date | null;
  receiptId: string | null;
};

export type FundingPathReceiptDTO = {
  id: string;
  proposalId: string | null;
  amount: string;
  currency: string;
  source: string | null;
  receivedDate: string | null;
  /** Money that settled an expected payment is linked through that payment. */
  onExpectedPayment: boolean;
};

type AnswerChoice = "mou" | "no_mou" | "donation" | "declined";
type AnswerDraft = {
  proposalId: string;
  answer: AnswerChoice | "";
  agreedAmount: string;
  answeredOn: string;
  note: string;
  schedule: "two" | "one" | "later";
  receiptIds: string[];
};

const CHOICES: { value: AnswerChoice; title: string; detail: string }[] = [
  {
    value: "mou",
    title: "They will sign an MoU",
    detail: "Payments follow the MoU. You send invoices.",
  },
  {
    value: "no_mou",
    title: "They agreed without an MoU",
    detail: "You expect a set amount. You can send an invoice.",
  },
  {
    value: "donation",
    title: "They will give a donation",
    detail: "No MoU and no invoice. The money arrives through Donations.",
  },
  {
    value: "declined",
    title: "They declined",
    detail: "No funding from this proposal.",
  },
];

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

function answerVariant(answer: ProposalAnswer): "default" | "secondary" | "outline" {
  if (answer === "waiting") return "secondary";
  if (answer === "declined") return "outline";
  return "default";
}

function nextStepText(
  row: FundingPathRow,
  currency: string
): { text: string; tone: "muted" | "warning" | "success" } {
  switch (row.nextStep) {
    case "record_answer":
      if (row.answer === "accepted") {
        return { text: "Accepted. Record how the partner will fund it.", tone: "muted" };
      }
      if (row.receivedCents > 0) {
        return { text: "Money has arrived. Record the partner’s answer.", tone: "muted" };
      }
      return {
        text:
          row.waitingDays === 0
            ? "Sent today. Waiting for an answer."
            : `Waiting ${row.waitingDays} day${row.waitingDays === 1 ? "" : "s"} for an answer.`,
        tone: "muted",
      };
    case "add_payments":
      return {
        text: "The partner agreed. Add expected payments so the funding gap is correct.",
        tone: "warning",
      };
    case "open_payments":
      return {
        text: `${row.unpaidPaymentCount} of ${row.expectedPaymentCount} expected payment${
          row.expectedPaymentCount === 1 ? "" : "s"
        } not received yet.`,
        tone: "muted",
      };
    case "wait_donation":
      return {
        text:
          row.promisedCents != null
            ? `${money(Math.max(0, row.promisedCents - row.receivedCents), currency)} still to come. It shows here after the next Donations import.`
            : "The money shows here after the next Donations import.",
        tone: "muted",
      };
    case "done":
      return { text: "All received.", tone: "success" };
    default:
      return { text: "No funding from this proposal.", tone: "muted" };
  }
}

export function FundingPathPanel({
  projectSlug,
  todayIso,
  canEdit,
  proposals,
  payments,
  receipts,
}: {
  projectSlug: string;
  todayIso: string;
  canEdit: boolean;
  proposals: FundingPathProposalDTO[];
  payments: FundingPathPaymentDTO[];
  receipts: FundingPathReceiptDTO[];
}) {
  const router = useRouter();
  const formId = useId();
  const [, start] = useTransition();
  const { flash } = useSettle();
  const [visibleProposals, setVisibleProposals] = usePropState(proposals);
  const [visibleReceipts, setVisibleReceipts] = usePropState(receipts);
  const [draft, setDraft] = useState<AnswerDraft | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      buildFundingPath({
        proposals: visibleProposals,
        payments,
        receipts: visibleReceipts,
        today: new Date(`${todayIso}T00:00:00Z`),
      }),
    [visibleProposals, payments, visibleReceipts, todayIso]
  );
  const rowById = new Map(rows.map((row) => [row.proposalId, row]));
  const draftProposal = draft
    ? visibleProposals.find((proposal) => proposal.id === draft.proposalId) ?? null
    : null;
  const draftRow = draft ? rowById.get(draft.proposalId) ?? null : null;
  const linkableReceipts = draftProposal
    ? visibleReceipts.filter(
        (receipt) =>
          !receipt.onExpectedPayment &&
          !receipt.proposalId &&
          Number(receipt.amount) > 0 &&
          receipt.currency === draftProposal.currency
      )
    : [];

  function openDialog(proposal: FundingPathProposalDTO, answer?: AnswerChoice) {
    const current = rowById.get(proposal.id)?.answer;
    setDraft({
      proposalId: proposal.id,
      answer:
        answer ??
        (current === "mou" ||
        current === "no_mou" ||
        current === "donation" ||
        current === "declined"
          ? current
          : ""),
      agreedAmount: proposal.agreedAmount ?? proposal.totalAmount,
      answeredOn: proposal.answeredOn ?? todayIso,
      note: proposal.answerNote ?? "",
      schedule: "two",
      receiptIds: [],
    });
  }

  function save(value: AnswerDraft, answer: AnswerChoice | "waiting") {
    const amount = value.agreedAmount.trim() === "" ? null : Number(value.agreedAmount);
    if (
      (answer === "mou" || answer === "no_mou") &&
      !(amount != null && Number.isFinite(amount) && amount > 0)
    ) {
      toast.error("Enter the amount the partner agreed to.");
      return;
    }
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
      toast.error("Enter an amount of zero or more.");
      return;
    }
    const previousProposals = visibleProposals;
    const previousReceipts = visibleReceipts;
    const answered = answer !== "waiting";
    const agreed =
      answer === "mou" || answer === "no_mou"
        ? amount!.toFixed(2)
        : answer === "donation" && amount
          ? amount.toFixed(2)
          : null;
    setVisibleProposals((current) =>
      current.map((proposal) =>
        proposal.id === value.proposalId
          ? {
              ...proposal,
              status: answer === "waiting" ? "sent" : answer === "declined" ? "declined" : "accepted",
              fundingPath: answer === "waiting" || answer === "declined" ? null : answer,
              agreedAmount: agreed,
              answeredOn: answered ? value.answeredOn : null,
              answerNote: value.note.trim() || null,
            }
          : proposal
      )
    );
    if (answer === "donation" && value.receiptIds.length > 0) {
      setVisibleReceipts((current) =>
        current.map((receipt) =>
          value.receiptIds.includes(receipt.id)
            ? { ...receipt, proposalId: value.proposalId }
            : receipt
        )
      );
    }
    setDraft(null);
    // The dialog closes over the list: show which proposal just changed.
    flash(`[data-funding-proposal="${value.proposalId}"]`);
    setSavingId(value.proposalId);
    start(async () => {
      try {
        const result = await setProposalAnswer({
          proposalId: value.proposalId,
          answer,
          agreedAmount: amount,
          answeredOn: value.answeredOn || undefined,
          note: value.note,
          schedule: value.schedule,
          receiptIds: value.receiptIds,
        });
        if (result.error) throw new Error(result.error);
        if (result.warning) toast.warning(result.warning);
        router.refresh();
      } catch (error) {
        setVisibleProposals(previousProposals);
        setVisibleReceipts(previousReceipts);
        setDraft(value);
        toast.error(
          error instanceof Error
            ? error.message
            : "Couldn’t save the answer. Check your internet and try again."
        );
      } finally {
        setSavingId(null);
      }
    });
  }

  const needsAmount = draft?.answer === "mou" || draft?.answer === "no_mou";

  return (
    <section
      id="funding-path"
      aria-labelledby={`${formId}-heading`}
      className="@container/funding scroll-mt-32 rounded-xl border bg-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h3 id={`${formId}-heading`} className="flex items-center gap-1.5 font-semibold">
            Proposals and answers
            <HelpTip title="Partner’s answer">
              After a partner replies, record what they decided: an MoU, an
              agreement without an MoU, a donation, or a decline. Sastra then
              shows the next step.
            </HelpTip>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            One row for each sent proposal: asked, answer, promised, received.
          </p>
        </div>
      </div>
      {visibleProposals.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">
          No proposals sent yet. Send a proposal below, then record the
          partner’s answer here.
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-b-xl">
          {visibleProposals.map((proposal) => {
            const row = rowById.get(proposal.id);
            if (!row) return null;
            const saving = savingId === proposal.id;
            const step = nextStepText(row, proposal.currency);
            const declined = row.answer === "declined";
            return (
              <li
                key={proposal.id}
                data-funding-proposal={proposal.id}
                aria-busy={saving}
                className={cn(
                  "grid gap-3 px-4 py-4 sm:px-5 @[52rem]/funding:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(17rem,1fr)] @[52rem]/funding:items-center",
                  declined && "text-muted-foreground"
                )}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words font-medium">
                      {proposal.partnerLabel}
                    </span>
                    <Badge variant={answerVariant(row.answer)}>
                      {PROPOSAL_ANSWER_LABELS[row.answer]}
                    </Badge>
                  </div>
                  <p className="break-words text-xs text-muted-foreground">
                    {proposal.scopeLabel ? `${proposal.scopeLabel} · ` : ""}
                    Sent {formatDate(proposal.sentAt.slice(0, 10))}
                    {proposal.answeredOn
                      ? ` · Answered ${formatDate(proposal.answeredOn)}`
                      : ""}
                  </p>
                  {proposal.answerNote ? (
                    <p className="break-words text-xs text-muted-foreground">
                      Note: {proposal.answerNote}
                    </p>
                  ) : null}
                </div>
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  {[
                    { label: "Asked", value: money(row.askedCents, proposal.currency) },
                    {
                      label: "Promised",
                      value:
                        row.promisedCents != null
                          ? money(row.promisedCents, proposal.currency)
                          : row.answer === "donation"
                            ? "Not fixed"
                            : "—",
                    },
                    {
                      label: "Received",
                      value:
                        row.receivedCents > 0
                          ? money(row.receivedCents, proposal.currency)
                          : "—",
                    },
                  ].map((item) => (
                    <div key={item.label} className="min-w-0">
                      <dt className="text-xs text-muted-foreground">{item.label}</dt>
                      <dd className="break-words font-medium tabular-nums">{item.value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex min-w-0 flex-col gap-2 @[52rem]/funding:items-end">
                  <p
                    className={cn(
                      "flex items-start gap-1.5 text-xs @[52rem]/funding:text-right",
                      step.tone === "warning" && "text-warning-text",
                      step.tone === "success" && "text-success",
                      step.tone === "muted" && "text-muted-foreground"
                    )}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        {step.tone === "success" ? (
                          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                        ) : null}
                        {step.text}
                      </>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2 @[52rem]/funding:justify-end">
                    {canEdit && row.nextStep === "record_answer" ? (
                      <Button size="sm" disabled={saving} onClick={() => openDialog(proposal)}>
                        <MessageSquareReply className="size-3.5" />
                        Record answer
                      </Button>
                    ) : null}
                    {canEdit && row.nextStep === "add_payments" ? (
                      <Button size="sm" disabled={saving} onClick={() => openDialog(proposal)}>
                        Add expected payments
                      </Button>
                    ) : null}
                    {row.nextStep === "open_payments" ? (
                      <a
                        href="#agreements-fees"
                        className="inline-flex h-9 items-center rounded-md border px-3 text-[0.8rem] font-medium hover:bg-muted"
                      >
                        Open payments
                      </a>
                    ) : null}
                    {row.answer === "mou" ? (
                      <Link
                        href={`/projects/${projectSlug}/rights`}
                        className="inline-flex h-9 items-center rounded-md px-2 text-[0.8rem] font-medium text-primary hover:underline"
                      >
                        Track MoU signing
                      </Link>
                    ) : null}
                    {canEdit && row.nextStep === "wait_donation" && visibleReceipts.some(
                      (receipt) =>
                        !receipt.onExpectedPayment &&
                        !receipt.proposalId &&
                        Number(receipt.amount) > 0 &&
                        receipt.currency === proposal.currency
                    ) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => openDialog(proposal, "donation")}
                      >
                        Link received money
                      </Button>
                    ) : null}
                    {canEdit &&
                    row.nextStep !== "record_answer" &&
                    row.nextStep !== "add_payments" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={saving}
                        onClick={() => openDialog(proposal)}
                      >
                        Change answer
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={Boolean(draft)} onOpenChange={(open) => (open ? null : setDraft(null))}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>What did the partner decide?</DialogTitle>
            <DialogDescription>
              {draftProposal
                ? `Proposal to ${draftProposal.partnerLabel} for ${money(
                    Math.round(Number(draftProposal.totalAmount) * 100),
                    draftProposal.currency
                  )}. Saving does not send an email or record money as received.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {draft && draftProposal ? (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (draft.answer) save(draft, draft.answer);
              }}
            >
              <fieldset className="space-y-2">
                <legend className="sr-only">Partner’s answer</legend>
                {CHOICES.map((choice) => {
                  const selected = draft.answer === choice.value;
                  return (
                    <label
                      key={choice.value}
                      className={cn(
                        "flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors",
                        selected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                      )}
                    >
                      <input
                        type="radio"
                        name={`${formId}-answer`}
                        className="mt-1 size-4 accent-primary"
                        checked={selected}
                        onChange={() => setDraft({ ...draft, answer: choice.value })}
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">{choice.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {choice.detail}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              {draft.answer && draft.answer !== "declined" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor={`${formId}-amount`}>
                    {needsAmount
                      ? `Agreed amount (${draftProposal.currency})`
                      : `Promised amount, if known (${draftProposal.currency})`}
                  </Label>
                  <Input
                    id={`${formId}-amount`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={draft.agreedAmount}
                    onChange={(event) =>
                      setDraft({ ...draft, agreedAmount: event.target.value })
                    }
                  />
                  {draft.answer === "donation" ? (
                    <p className="text-xs text-muted-foreground">
                      Leave blank if the amount is not fixed. A promised amount
                      counts as committed funding until the money arrives.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {needsAmount ? (
                draftRow && draftRow.expectedPaymentCount > 0 ? (
                  <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                    This proposal already has {draftRow.expectedPaymentCount} expected payment
                    {draftRow.expectedPaymentCount === 1 ? "" : "s"}. Change amounts
                    and dates in Payments.
                  </p>
                ) : (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${formId}-schedule`}>Expected payments</Label>
                    <select
                      id={`${formId}-schedule`}
                      className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
                      value={draft.schedule}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          schedule: event.target.value as AnswerDraft["schedule"],
                        })
                      }
                    >
                      <option value="two">
                        Two payments: half {draft.answer === "mou" ? "on signing" : "on agreement"}, half on completion
                      </option>
                      <option value="one">
                        One payment {draft.answer === "mou" ? "on signing" : "on agreement"}
                      </option>
                      <option value="later">Add later</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Expected payments count as committed funding. You can edit
                      them in Payments.
                    </p>
                  </div>
                )
              ) : null}

              {draft.answer === "donation" && linkableReceipts.length > 0 ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">
                    Has this money already arrived?
                  </legend>
                  <p className="text-xs text-muted-foreground">
                    Tick funding received on this project that came from this
                    proposal.
                  </p>
                  {linkableReceipts.map((receipt) => (
                    <Label
                      key={receipt.id}
                      className="flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-normal"
                    >
                      <Checkbox
                        checked={draft.receiptIds.includes(receipt.id)}
                        onCheckedChange={(checked) =>
                          setDraft({
                            ...draft,
                            receiptIds:
                              checked === true
                                ? [...draft.receiptIds, receipt.id]
                                : draft.receiptIds.filter((id) => id !== receipt.id),
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 break-words">
                        {receipt.source || "Funding"}
                        {receipt.receivedDate
                          ? ` · ${formatDate(receipt.receivedDate)}`
                          : ""}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {money(Math.round(Number(receipt.amount) * 100), receipt.currency)}
                      </span>
                    </Label>
                  ))}
                </fieldset>
              ) : null}

              {draft.answer ? (
                <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${formId}-date`}>Date of answer</Label>
                    <Input
                      id={`${formId}-date`}
                      type="date"
                      value={draft.answeredOn}
                      onChange={(event) =>
                        setDraft({ ...draft, answeredOn: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${formId}-note`}>Note (optional)</Label>
                    <Textarea
                      id={`${formId}-note`}
                      rows={2}
                      maxLength={500}
                      value={draft.note}
                      onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                      placeholder="e.g. Agreed by email on 3 November"
                    />
                  </div>
                </div>
              ) : null}

              <DialogFooter className="gap-2 sm:justify-between">
                {draftRow && draftRow.answer !== "waiting" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => save(draft, "waiting")}
                  >
                    Mark as waiting again
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!draft.answer}>
                    Save answer
                  </Button>
                </div>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
