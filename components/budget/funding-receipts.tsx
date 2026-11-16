"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { addReceipt, deleteReceipt, updateReceipt } from "@/lib/budget/actions";
import { linkReceiptToProposal } from "@/lib/proposals/answer-actions";
import { DonationMouLink } from "@/components/budget/donation-mou-link";
import type { DonationMouLinkOption } from "@/lib/donations/mou-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { usePropState } from "@/hooks/use-prop-state";

export type Receipt = {
  id: string;
  printRunId: string | null;
  amount: string;
  deductionBps: number | null;
  expectedNetAmount: string | null;
  actualNetAmount: string | null;
  currency: string;
  receivedDate: string | null;
  source: string | null;
  note: string | null;
  locked?: boolean;
  lockLabel?: "Expected payment" | "Donation";
  mouPaymentLabel?: string;
  /** The proposal this money answers, when it is not an expected payment. */
  proposalId?: string | null;
  mouLink?: {
    allocationId: string;
    options: DonationMouLinkOption[];
  };
};

type ReceiptDraft = {
  amount: string;
  date: string;
  source: string;
  note: string;
  actualNetAmount: string;
};

function money(value: string | number, currency: string) {
  const n = Number(value) || 0;
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

const emptyDraft: ReceiptDraft = {
  amount: "",
  date: "",
  source: "",
  note: "",
  actualNetAmount: "",
};

function draftFromReceipt(receipt: Receipt): ReceiptDraft {
  return {
    amount: receipt.amount,
    date: receipt.receivedDate ?? "",
    source: receipt.source ?? "",
    note: receipt.note ?? "",
    actualNetAmount: receipt.actualNetAmount ?? "",
  };
}

function receiptInput(
  draft: ReceiptDraft,
  currency: string,
  printRunId?: string | null
) {
  return {
    printRunId: printRunId ?? undefined,
    amount: Number(draft.amount),
    currency,
    receivedDate: draft.date || undefined,
    source: draft.source || undefined,
    note: draft.note || undefined,
    actualNetAmount:
      draft.actualNetAmount === "" ? undefined : Number(draft.actualNetAmount),
  };
}

function validAmount(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

export function FundingReceipts({
  projectId,
  printRunId = null,
  currency,
  canEdit,
  canReconcileDonation = false,
  receipts,
  proposals = [],
}: {
  projectId: string;
  printRunId?: string | null;
  currency: string;
  canEdit: boolean;
  canReconcileDonation?: boolean;
  receipts: Receipt[];
  /** Sent proposals in this budget scope that received money can answer. */
  proposals?: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [visibleReceipts, setVisibleReceipts] = usePropState(receipts);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [, startLink] = useTransition();

  function linkProposal(receipt: Receipt, proposalId: string | null) {
    const previous = visibleReceipts;
    setVisibleReceipts((current) =>
      current.map((item) =>
        item.id === receipt.id ? { ...item, proposalId } : item
      )
    );
    setLinkingId(receipt.id);
    startLink(async () => {
      try {
        const result = await linkReceiptToProposal({
          receiptId: receipt.id,
          proposalId,
        });
        if (result.error) throw new Error(result.error);
        router.refresh();
      } catch (error) {
        setVisibleReceipts(previous);
        toast.error(
          error instanceof Error
            ? error.message
            : "Couldn’t save the link. Check your internet and try again."
        );
      } finally {
        setLinkingId(null);
      }
    });
  }
  const total = visibleReceipts.reduce((s, r) => s + Number(r.amount), 0);
  const available = visibleReceipts.reduce(
    (sum, receipt) =>
      sum +
      Number(
        receipt.actualNetAmount ??
          receipt.expectedNetAmount ??
          receipt.amount
      ),
    0
  );
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ReceiptDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ReceiptDraft>(emptyDraft);

  function patchDraft(
    setter: (value: ReceiptDraft) => void,
    current: ReceiptDraft,
    key: keyof ReceiptDraft,
    value: string
  ) {
    setter({ ...current, [key]: value });
  }

  function submit() {
    if (!validAmount(draft.amount)) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    const previous = visibleReceipts;
    const temporaryId = `pending-${crypto.randomUUID()}`;
    const optimistic: Receipt = {
      id: temporaryId,
      printRunId,
      amount: Number(draft.amount).toFixed(2),
      deductionBps: null,
      expectedNetAmount: null,
      actualNetAmount:
        draft.actualNetAmount === ""
          ? null
          : Number(draft.actualNetAmount).toFixed(2),
      currency,
      receivedDate: draft.date || null,
      source: draft.source || null,
      note: draft.note || null,
    };
    const previousDraft = draft;
    setVisibleReceipts((current) => [...current, optimistic]);
    setDraft(emptyDraft);
    setAdding(false);
    start(async () => {
      try {
        const res = await addReceipt(
          projectId,
          receiptInput(previousDraft, currency, printRunId)
        );
        if (res?.error) throw new Error(res.error);
        if (res.id) {
          setVisibleReceipts((current) =>
            current.map((receipt) =>
              receipt.id === temporaryId ? { ...receipt, id: res.id as string } : receipt
            )
          );
        }
        router.refresh();
      } catch (error) {
        setVisibleReceipts(previous);
        setDraft(previousDraft);
        setAdding(true);
        toast.error(error instanceof Error ? error.message : "Could not record the funding.");
      }
    });
  }

  function saveEdit(id: string) {
    if (!validAmount(editDraft.amount)) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    start(async () => {
      const receipt = visibleReceipts.find((item) => item.id === id);
      const previous = visibleReceipts;
      const optimistic = receipt
        ? {
            ...receipt,
            amount: Number(editDraft.amount).toFixed(2),
            actualNetAmount:
              editDraft.actualNetAmount === ""
                ? null
                : Number(editDraft.actualNetAmount).toFixed(2),
            currency,
            receivedDate: editDraft.date || null,
            source: editDraft.source || null,
            note: editDraft.note || null,
          }
        : null;
      if (optimistic) {
        setVisibleReceipts((current) =>
          current.map((item) => (item.id === id ? optimistic : item))
        );
      }
      const previousDraft = editDraft;
      setEditingId(null);
      setEditDraft(emptyDraft);
      try {
        const res = await updateReceipt(
          id,
          receiptInput(previousDraft, currency, receipt?.printRunId ?? printRunId)
        );
        if (res?.error) throw new Error(res.error);
        router.refresh();
      } catch (error) {
        setVisibleReceipts(previous);
        setEditingId(id);
        setEditDraft(previousDraft);
        toast.error(error instanceof Error ? error.message : "Could not update the receipt.");
      }
    });
  }

  async function remove(id: string) {
    if (!(await confirmDialog("Delete this funding receipt?"))) return;
    const previous = visibleReceipts;
    setVisibleReceipts((current) => current.filter((receipt) => receipt.id !== id));
    start(async () => {
      try {
        const res = await deleteReceipt(id);
        if (res?.error) throw new Error(res.error);
        router.refresh();
      } catch (error) {
        setVisibleReceipts(previous);
        toast.error(error instanceof Error ? error.message : "Could not delete the receipt.");
      }
    });
  }


  return (
    <section
      className="space-y-4 border-t pt-5"
      aria-labelledby="funding-received-heading"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-muted-foreground" />
            <h2 id="funding-received-heading" className="text-sm font-semibold">
              Donations and funding received
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Posted money in, including reviewed donation allocations.
          </p>
        </div>

        {visibleReceipts.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-6 text-sm sm:text-right">
            <div>
              <dt className="text-xs text-muted-foreground">Gross received</dt>
              <dd className="font-semibold tabular-nums">
                {money(total, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Available</dt>
              <dd className="font-semibold tabular-nums">
                {money(available, currency)}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>

      {visibleReceipts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No payments or donations recorded yet.
        </p>
      ) : (
        <ul className="divide-y border-y">
            {visibleReceipts.map((receipt) => {
              const editing = editingId === receipt.id;
              return (
                <li
                  key={receipt.id}
                  className={cn(
                    "px-3 py-2 text-sm",
                    receipt.id.startsWith("pending-") && "optimistic-item-in"
                  )}
                >
                  {editing ? (
                    <ReceiptForm
                      draft={editDraft}
                      currency={currency}
                      pending={pending}
                      onChange={(key, value) =>
                        patchDraft(setEditDraft, editDraft, key, value)
                      }
                      actions={
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft(emptyDraft);
                            }}
                            disabled={pending}
                          >
                            <X className="size-3.5" />
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => saveEdit(receipt.id)}
                            disabled={pending || !validAmount(editDraft.amount)}
                          >
                            <Check className="size-3.5" />
                            Save
                          </Button>
                        </>
                      }
                    />
                  ) : (
                    <div>
                      <div className="grid gap-2 sm:grid-cols-[6rem_minmax(0,1fr)_auto_auto_auto] sm:items-center">
                      <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                        {receipt.receivedDate ?? "-"}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {receipt.source || "Funding"}
                        {receipt.note ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {receipt.note}
                          </span>
                        ) : null}
                      </span>
                      {receipt.locked ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground">
                          <Lock className="size-3" />
                          {receipt.lockLabel ?? "Expected payment"}
                        </span>
                      ) : null}
                      <span className="shrink-0 text-right font-medium tabular-nums">
                        <span className="block">{money(receipt.amount, receipt.currency)}</span>
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          {money(
                            receipt.actualNetAmount ??
                              receipt.expectedNetAmount ??
                              receipt.amount,
                            receipt.currency
                          )}{" "}
                          available
                        </span>
                      </span>
                      {canEdit && !receipt.locked ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Edit receipt"
                            disabled={pending}
                            onClick={() => {
                              setEditingId(receipt.id);
                              setEditDraft(draftFromReceipt(receipt));
                              setAdding(false);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Delete receipt"
                            disabled={pending}
                            onClick={() => remove(receipt.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ) : null}
                      </div>
                      {receipt.mouPaymentLabel ? (
                        <p className="mt-2 text-xs text-muted-foreground">Linked to expected payment: {receipt.mouPaymentLabel}</p>
                      ) : null}
                      {receipt.proposalId ? (
                        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            Answers the proposal to{" "}
                            {proposals.find((option) => option.id === receipt.proposalId)
                              ?.label ?? "a partner"}
                          </span>
                          {canEdit ? (
                            <Button
                              variant="ghost"
                              size="xs"
                              disabled={linkingId === receipt.id}
                              onClick={() => linkProposal(receipt, null)}
                            >
                              Remove link
                            </Button>
                          ) : null}
                        </p>
                      ) : canEdit &&
                        proposals.length > 0 &&
                        !receipt.mouPaymentLabel &&
                        Number(receipt.amount) > 0 ? (
                        <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>Link to proposal</span>
                          <select
                            className="h-8 max-w-full rounded-md border bg-background px-2 text-xs text-foreground"
                            value=""
                            disabled={linkingId === receipt.id}
                            onChange={(event) => {
                              if (event.target.value) linkProposal(receipt, event.target.value);
                            }}
                          >
                            <option value="">Choose proposal</option>
                            {proposals.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {canReconcileDonation && receipt.mouLink ? (
                        <DonationMouLink
                          allocationId={receipt.mouLink.allocationId}
                          receiptAmount={receipt.amount}
                          currency={receipt.currency}
                          options={receipt.mouLink.options}
                          onLinked={(payment) => setVisibleReceipts((current) => current.map((item) =>
                            item.id === receipt.id ? { ...item, mouLink: undefined, mouPaymentLabel: payment.label } : item
                          ))}
                        />
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
        </ul>
      )}

      {canEdit ? (
        adding ? (
            <div className="rounded-md border bg-muted/30 p-3">
              <ReceiptForm
                draft={draft}
                currency={currency}
                pending={pending}
                autoFocus
                onChange={(key, value) => patchDraft(setDraft, draft, key, value)}
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAdding(false);
                        setDraft(emptyDraft);
                      }}
                      disabled={pending}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={submit}
                      disabled={pending || !validAmount(draft.amount)}
                    >
                      Record donation
                    </Button>
                  </>
                }
              />
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAdding(true);
                setEditingId(null);
              }}
              disabled={pending}
            >
              <Plus className="size-4" />
              Record donation
            </Button>
        )
      ) : null}
    </section>
  );
}

function ReceiptForm({
  draft,
  currency,
  pending,
  actions,
  autoFocus,
  onChange,
}: {
  draft: ReceiptDraft;
  currency: string;
  pending: boolean;
  actions: ReactNode;
  autoFocus?: boolean;
  onChange: (key: keyof ReceiptDraft, value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1">
        <Label>Amount ({currency})</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={draft.amount}
          onChange={(event) => onChange("amount", event.target.value)}
          placeholder="0.00"
          autoFocus={autoFocus}
          disabled={pending}
          className="tabular-nums"
        />
      </div>
      <div className="grid gap-1">
        <Label>Actual available ({currency})</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={draft.actualNetAmount}
          onChange={(event) =>
            onChange("actualNetAmount", event.target.value)
          }
          placeholder="Leave blank to use expected net"
          disabled={pending}
          className="tabular-nums"
        />
      </div>
      <div className="grid gap-1">
        <Label>Date received</Label>
        <Input
          type="date"
          value={draft.date}
          onChange={(event) => onChange("date", event.target.value)}
          disabled={pending}
        />
      </div>
      <div className="grid gap-1">
        <Label>Source / donor</Label>
        <Input
          value={draft.source}
          onChange={(event) => onChange("source", event.target.value)}
          placeholder="e.g. church, individual, 9Marks"
          disabled={pending}
        />
      </div>
      <div className="grid gap-1">
        <Label>Note (optional)</Label>
        <Input
          value={draft.note}
          onChange={(event) => onChange("note", event.target.value)}
          placeholder="e.g. first installment"
          disabled={pending}
        />
      </div>
      <div
        className={cn(
          "flex justify-end gap-2 sm:col-span-2",
          pending && "opacity-70"
        )}
      >
        {actions}
      </div>
    </div>
  );
}
