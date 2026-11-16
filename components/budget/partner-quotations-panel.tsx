"use client";

import { useState, type ComponentProps } from "react";
import { GuidedSteps, type GuidedStep } from "@/components/guidance/guided-steps";
import { useRouter } from "next/navigation";
import { Download, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileLink } from "@/components/files/file-link";
import { BudgetApprovalPanel } from "./budget-approval-panel";
import {
  partnerBaseItems,
  type PartnerPrintOption,
} from "@/lib/budget/print-options";
import { ProposalPanel, type ProposalDTO } from "./proposal-panel";
import type { PartnerOption } from "./budget-manager";
import type { EmailDraftDTO } from "@/lib/email/draft-types";
import type { PartnerQuoteLine } from "@/lib/budget/partner-line-state";
import {
  partnerQuotationVersion,
  assignedLineCents,
  publicLineCents,
  quotationTotalCents,
  type PartnerQuotationDTO,
  type PartnerQuotationInput,
} from "@/lib/budget/partner-quotations";
import {
  deletePartnerQuotation,
  savePartnerQuotation,
} from "@/lib/budget/partner-quotation-actions";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { confirmDialog } from "@/lib/dialog-requests";

const selectClass =
  "h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm";
type Draft = Omit<PartnerQuotationInput, "lines"> & {
  amounts: Record<string, string>;
};
type Mutation =
  { type: "save"; quote: PartnerQuotationDTO } | { type: "delete"; id: string };
function updateQuotes(current: PartnerQuotationDTO[], mutation: Mutation) {
  if (mutation.type === "delete")
    return current.filter((q) => q.id !== mutation.id);
  return current.some((q) => q.id === mutation.quote.id)
    ? current.map((q) => (q.id === mutation.quote.id ? mutation.quote : q))
    : [...current, mutation.quote];
}

export function PartnerQuotationsPanel({
  projectId,
  projectSlug,
  printRunId,
  quotations,
  items,
  currency,
  sourceFingerprint,
  partners,
  printOptions: suppliedPrintOptions,
  approvalStates,
  approvalContext,
  proposals,
  emailDrafts,
  approvalRequired,
  approvalCanSend,
  approvalGateReason,
  proposedCompletionDate,
  realCompletionDeadline,
  defaultPartner = null,
}: {
  projectId: string;
  projectSlug: string;
  printRunId: string | null;
  quotations: PartnerQuotationDTO[];
  items: (PartnerQuoteLine & { category: string })[];
  currency: string;
  sourceFingerprint: string;
  partners: PartnerOption[];
  printOptions: PartnerPrintOption[];
  approvalStates: Record<
    string,
    Pick<
      ComponentProps<typeof BudgetApprovalPanel>,
      "active" | "history" | "synchronizedAfterChange"
    > & {
      canSend: boolean;
      gateReason: string | null;
      approvalRequired: boolean;
    }
  >;
  approvalContext: Pick<
    ComponentProps<typeof BudgetApprovalPanel>,
    "currentUserId" | "eligibleApprovers" | "todayIso" | "defaultDueDate"
  >;
  proposals: (ProposalDTO & { partnerQuotationId?: string | null })[];
  emailDrafts: EmailDraftDTO[];
  approvalRequired: boolean;
  approvalCanSend: boolean;
  approvalGateReason: string | null;
  proposedCompletionDate: string | null;
  realCompletionDeadline: string | null;
  /** The project's funding partner; a new proposal starts with it filled in. */
  defaultPartner?: {
    partnerId: string | null;
    partnerName: string;
    contactName: string;
    contactEmail: string;
  } | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [open, setOpen] = useState(false);
  // New proposals use guided steps with defaults; editing keeps the full form.
  const [guided, setGuided] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [titleTouched, setTitleTouched] = useState(true);
  const [prefilledPartner, setPrefilledPartner] = useState(false);
  // After a guided save, open that proposal's email draft for review.
  const [writeEmailFor, setWriteEmailFor] = useState<string | null>(null);
  const mutation = useOptimisticAction({
    state: quotations,
    update: updateQuotes,
    getKey: (m: Mutation) => (m.type === "save" ? m.quote.id : m.id),
  });
  const quotes = mutation.state;
  const printOptions = suppliedPrintOptions.filter(
    (option) => option.currency === currency,
  );
  const publicItems = [
    ...partnerBaseItems(items, suppliedPrintOptions),
    ...printOptions.map((option) => ({
      id: option.sourceQuoteId,
      category: "print_option",
      label: `${option.label} · ${option.quantity.toLocaleString()} copies`,
      partnerVisible: true,
      partnerLabel: null,
      partnerUnitPrice: null,
      quantity: "1",
      unit: "flat" as const,
      unitPrice: (option.partnerAmountCents / 100).toFixed(2),
      amount: (option.partnerAmountCents / 100).toFixed(2),
    })),
  ].filter((item) => item.partnerVisible && publicLineCents(item) > 0);
  const money = (cents: number) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
      cents / 100,
    );
  const planned = quotationTotalCents({
    lines: publicItems
      .filter((item) => item.category !== "print_option")
      .map((item) => ({
        budgetItemId: item.id,
        label: item.label,
        amountCents: publicLineCents(item),
      })),
    printOptions,
  });
  const currentQuotes = quotes.filter((q) => q.currency === currency);
  const baseAssigned = currentQuotes.reduce(
    (sum, q) =>
      sum + q.lines.reduce((subtotal, line) => subtotal + line.amountCents, 0),
    0,
  );
  const assignedPrinting = printOptions.map((option) =>
    currentQuotes.reduce(
      (sum, q) =>
        sum +
        (q.printOptions?.find(
          (saved) => saved.sourceQuoteId === option.sourceQuoteId,
        )?.partnerAmountCents ?? 0),
      0,
    ),
  );
  const assigned =
    baseAssigned +
    (assignedPrinting.length ? Math.min(...assignedPrinting) : 0);
  const stillToAssign =
    publicItems
      .filter((item) => item.category !== "print_option")
      .reduce(
        (sum, item) =>
          sum +
          Math.max(
            0,
            publicLineCents(item) - assignedLineCents(currentQuotes, item.id),
          ),
        0,
      ) +
    (printOptions.length
      ? Math.min(
          ...printOptions.map((option, index) =>
            Math.max(0, option.partnerAmountCents - assignedPrinting[index]),
          ),
        )
      : 0);
  const assignedCost = (list: PartnerQuotationDTO[], id: string) =>
    assignedLineCents(list, id) +
    list.reduce(
      (sum, quote) =>
        sum +
        (quote.printOptions?.find((option) => option.sourceQuoteId === id)
          ?.partnerAmountCents ?? 0),
      0,
    );
  const overAssigned = publicItems.some(
    (item) => assignedCost(quotes, item.id) > publicLineCents(item),
  );
  const others = quotes.filter((q) => q.id !== draft?.id);
  const remaining = (item: PartnerQuoteLine) =>
    Math.max(0, publicLineCents(item) - assignedCost(others, item.id));
  const draftPrintOptions = draft
    ? printOptions
        .filter((option) => Object.hasOwn(draft.amounts, option.sourceQuoteId))
        .map((option) => ({
          ...option,
          partnerAmountCents:
            Math.round(Number(draft.amounts[option.sourceQuoteId]) * 100) || 0,
        }))
    : [];
  const draftLines = draft
    ? Object.entries(draft.amounts)
        .filter(
          ([id]) => !printOptions.some((option) => option.sourceQuoteId === id),
        )
        .map(([budgetItemId, amount]) => ({
          budgetItemId,
          label: "",
          amountCents: Math.round(Number(amount) * 100) || 0,
        }))
    : [];
  const draftTotal = quotationTotalCents({
    lines: draftLines,
    printOptions: draftPrintOptions,
  });
  const invalidAmounts = Boolean(
    draft &&
    Object.entries(draft.amounts).some(([id, amount]) => {
      const item = publicItems.find((i) => i.id === id);
      return (
        !item ||
        !Number.isFinite(Number(amount)) ||
        Number(amount) <= 0 ||
        Math.round(Number(amount) * 100) > remaining(item)
      );
    }),
  );

  function edit(quote?: PartnerQuotationDTO) {
    // A new proposal starts with the project's funding partner (unless that
    // partner already has a quotation) and every amount still available to assign.
    const partner =
      !quote &&
      defaultPartner?.partnerName.trim() &&
      !quotes.some(
        (q) =>
          q.partnerName.trim().toLowerCase() ===
          defaultPartner.partnerName.trim().toLowerCase(),
      )
        ? defaultPartner
        : null;
    setDraft({
      id: quote?.id ?? crypto.randomUUID(),
      projectId,
      printRunId,
      title: quote?.title ?? "",
      partnerId: quote?.partnerId ?? partner?.partnerId ?? null,
      partnerName: quote?.partnerName ?? partner?.partnerName ?? "",
      contactName: quote?.contactName ?? partner?.contactName ?? "",
      contactEmail: quote?.contactEmail ?? partner?.contactEmail ?? "",
      description: quote?.description ?? "",
      amounts: quote
        ? Object.fromEntries(
            [
              ...quote.lines,
              ...(quote.printOptions ?? []).map((option) => ({
                budgetItemId: option.sourceQuoteId,
                amountCents: option.partnerAmountCents,
              })),
            ].map((line) => [
              line.budgetItemId,
              (line.amountCents / 100).toFixed(2),
            ]),
          )
        : Object.fromEntries(
            publicItems
              .map(
                (item) =>
                  [
                    item.id,
                    publicLineCents(item) - assignedCost(quotes, item.id),
                  ] as const,
              )
              .filter(([, cents]) => cents > 0)
              .map(([id, cents]) => [id, (cents / 100).toFixed(2)]),
          ),
    });
    setGuided(!quote);
    setGuideStep(0);
    setTitleTouched(Boolean(quote));
    setPrefilledPartner(Boolean(partner));
    setOpen(true);
  }
  // A title the person has not typed is written for them from the chosen costs.
  const autoTitle = (() => {
    if (!draft) return "";
    const ids = Object.keys(draft.amounts);
    const everything =
      publicItems.length > 0 &&
      others.length === 0 &&
      publicItems.every((item) => ids.includes(item.id));
    if (everything) return "Full project";
    const names = publicItems
      .filter((item) => ids.includes(item.id) && item.category !== "print_option")
      .map((item) => item.partnerLabel || item.label);
    if (!names.length) return ids.length ? "Printing" : "";
    if (names.length <= 2) return names.join(" and ");
    return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
  })();
  const draftTitle = titleTouched ? (draft?.title ?? "") : autoTitle;
  const draftEmailValid =
    !draft?.contactEmail.trim() ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail.trim());
  function setAmount(id: string, value: string | null) {
    setDraft((current) => {
      if (!current) return current;
      const amounts = { ...current.amounts };
      if (value === null) delete amounts[id];
      else amounts[id] = value;
      return { ...current, amounts };
    });
  }
  function save(writeEmail = false) {
    if (!draft || invalidAmounts || mutation.isPending(draft.id)) return;
    const input: PartnerQuotationInput = {
      ...draft,
      title: draftTitle.trim(),
      lines: draftLines.map(({ budgetItemId, amountCents }) => ({
        budgetItemId,
        amountCents,
      })),
      printOptions: draftPrintOptions,
    };
    const quote: PartnerQuotationDTO = {
      ...input,
      currency,
      sourceFingerprint,
      lines: input.lines.map((line) => ({
        ...line,
        label:
          publicItems.find((item) => item.id === line.budgetItemId)
            ?.partnerLabel ||
          publicItems.find((item) => item.id === line.budgetItemId)?.label ||
          "Cost",
      })),
    };
    mutation.run({ type: "save", quote }, () => savePartnerQuotation(input), {
      onError: () => {
        setDraft(draft);
        setOpen(true);
      },
      reconcile: (result, current) =>
        "quotation" in result && result.quotation
          ? updateQuotes(current, { type: "save", quote: result.quotation })
          : current,
      onSuccess: () => {
        toast.success("Partner quotation saved");
        if (writeEmail) setWriteEmailFor(input.id);
        router.refresh();
      },
    });
    setOpen(false);
  }
  async function remove(quote: PartnerQuotationDTO) {
    if (
      !(await confirmDialog(
        `Delete “${quote.title}” ${quote.partnerName ? `for ${quote.partnerName}` : "(partner needed)"}? Sent proposals and their files will stay in history.`,
      ))
    )
      return;
    mutation.run(
      { type: "delete", id: quote.id },
      () => deletePartnerQuotation(projectId, quote.id),
      { onSuccess: () => router.refresh() },
    );
  }
  async function editAssignedQuotation(quote: PartnerQuotationDTO) {
    if (
      await confirmDialog(
        `Open “${quote.title}”? This closes the current form without saving it.`,
        { title: "Edit saved quotation?", confirmLabel: "Open quotation" },
      )
    )
      edit(quote);
  }

  return (
    <div className="space-y-5">
      <div id="proposal-setup" tabIndex={-1} className="flex scroll-mt-32 flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-4 focus-visible:outline-none sm:p-5">
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 font-semibold">
            <Users className="size-4" />
            Share the project costs
          </h3>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Record the costs that need funding, then assign a partner when you
            are ready. Build a separate proposal for each share.
          </p>
          <p className="text-xs text-muted-foreground">
            Quotations are funding requests. Record agreed amounts in Payments
            after the partner commits.
          </p>
        </div>
        <div className="space-y-1 sm:text-right">
          <Button size="sm" onClick={() => edit()} disabled={!publicItems.length}>
            <Plus className="size-4" />
            Start a proposal
          </Button>
          {!publicItems.length ? (
            <p className="max-w-xs text-xs text-muted-foreground">
              Add costs in Quotation first. A proposal asks a partner to fund
              them.
            </p>
          ) : null}
        </div>
        <dl className="grid w-full grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-3">
          {[
            { label: "Costs to share", value: planned },
            { label: "Assigned to quotations", value: assigned },
            {
              label: "Still to assign",
              value: stillToAssign,
            },
          ].map((stat) => (
            <div key={stat.label}>
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {printOptions.length ? "From " : ""}
                {money(stat.value)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          {printOptions.length
            ? "Totals start at the lowest included printing option. Quantities are alternatives; the partner chooses one."
            : "These totals use visible itemized costs. Per-copy prices stay in the project quotation."}
        </p>
        {quotes.length ? (
          <p className="w-full text-sm text-muted-foreground">
            Saved quotations already use some of these costs, including drafts.
            Edit a quotation below to change its share or reuse its printing options.
          </p>
        ) : null}
        {suppliedPrintOptions.some((option) => option.currency !== currency) ? (
          <p role="alert" className="text-sm text-destructive">
            Review the printing options in the current budget currency in
            Quotation before assigning printing costs.
          </p>
        ) : null}
        {overAssigned ? (
          <p role="alert" className="text-sm text-destructive">
            A planned cost was reduced. Review the partner shares before
            sending.
          </p>
        ) : null}
      </div>
      {!quotes.length ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No proposals yet. Choose <strong>Start a proposal</strong>. Sastra
          fills in the partner and the amounts left to assign. Ask
          several partners by starting a proposal for each one.
        </div>
      ) : null}
      {quotes.map((quote) => {
        const stale =
          quote.sourceFingerprint !== sourceFingerprint ||
          quote.currency !== currency;
        const pending = mutation.isPending(quote.id);
        const sent = proposals.filter((p) => p.partnerQuotationId === quote.id);
        return (
          <article
            key={quote.id}
            id={`proposal-${quote.id}`}
            className="min-w-0 scroll-mt-32 overflow-hidden rounded-xl border bg-card"
            aria-busy={pending}
          >
            <div className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h3 className="break-words font-semibold">{quote.title}</h3>
                  <p className="break-words text-sm text-muted-foreground">
                    {quote.partnerName || "Partner needed"}
                  </p>
                  <p className="break-all text-xs text-muted-foreground">
                    {quote.partnerName
                      ? quote.contactEmail ||
                        "Add a contact email before sending"
                      : "Assign a partner when you are ready to send."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold tabular-nums">
                    {quote.printOptions?.length ? "From " : ""}
                    {new Intl.NumberFormat(undefined, {
                      style: "currency",
                      currency: quote.currency,
                    }).format(quotationTotalCents(quote) / 100)}
                  </span>
                  <Badge variant="outline">
                    {pending
                      ? "Saving…"
                      : stale
                        ? "Needs review"
                        : sent.length
                          ? `${sent.length} sent`
                          : "Draft"}
                  </Badge>
                </div>
              </div>
              <ul className="space-y-1 text-sm">
                {quote.lines.map((line) => (
                  <li
                    key={line.budgetItemId}
                    className="flex justify-between gap-4"
                  >
                    <span className="min-w-0 break-words text-muted-foreground">
                      {line.label}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {new Intl.NumberFormat(undefined, {
                        style: "currency",
                        currency: quote.currency,
                      }).format(line.amountCents / 100)}
                    </span>
                  </li>
                ))}
              </ul>
              {quote.printOptions?.length ? (
                <div className="space-y-2 border-t pt-3 text-sm">
                  <p className="font-medium">Printing options — choose one</p>
                  {quote.printOptions.map((option) => (
                    <div
                      key={option.sourceQuoteId}
                      className="flex flex-wrap justify-between gap-2"
                    >
                      <span className="text-muted-foreground">
                        {option.quantity.toLocaleString()} copies
                      </span>
                      <span className="tabular-nums">
                        {new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: quote.currency,
                        }).format(
                          (quote.lines.reduce(
                            (sum, line) => sum + line.amountCents,
                            0,
                          ) +
                            option.partnerAmountCents) /
                            100,
                        )}{" "}
                        total
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {stale ? (
                <p className="text-sm text-warning-text">
                  The project quotation changed. Edit and save this share to
                  review the new costs.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => edit(quote)}
                >
                  <Pencil className="size-3.5" />
                  Edit quotation
                </Button>
                {!stale && !pending ? (
                  <FileLink
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                    href={`/api/projects/${projectSlug}/budget/export?quotation=${quote.id}${printRunId ? `&run=${printRunId}` : ""}`}
                  >
                    <Download className="size-3.5" />
                    Download quotation
                  </FileLink>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  aria-label={`Delete quotation ${quote.title}`}
                  onClick={() => remove(quote)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            {!pending && !stale && approvalStates[quote.id] ? (
              <BudgetApprovalPanel
                {...approvalContext}
                {...approvalStates[quote.id]}
                projectId={projectId}
                printRunId={printRunId}
                quotationId={quote.id}
                quotationDownloadHref={`/api/projects/${projectSlug}/budget/export?quotation=${quote.id}${printRunId ? `&run=${printRunId}` : ""}`}
                hasPrintOptions={Boolean(quote.printOptions?.length)}
                canManage
              />
            ) : null}
            {!pending ? (
              <details
                className="border-t p-4 sm:p-5"
                open={writeEmailFor === quote.id ? true : undefined}
              >
                <summary className="cursor-pointer text-sm font-medium text-primary">
                  {sent.length
                    ? "Review proposal and send history"
                    : "Write the proposal email"}
                </summary>
                <div className="mt-4">
                  {stale ? (
                    <p className="mb-3 text-sm text-muted-foreground">
                      Edit and save this quotation before preparing a new
                      proposal.
                    </p>
                  ) : null}
                  <ProposalPanel
                    key={quote.id}
                    autoDraft={writeEmailFor === quote.id}
                    quotationId={quote.id}
                    quotationFingerprint={partnerQuotationVersion(quote)}
                    projectId={projectId}
                    projectSlug={projectSlug}
                    printRunId={printRunId}
                    partnerQuoteMode="itemized"
                    partnerQuoteTotal={quotationTotalCents(quote) / 100}
                    hasPrintOptions={Boolean(quote.printOptions?.length)}
                    currency={quote.currency}
                    canEdit={!stale && Boolean(quote.partnerName.trim())}
                    fundingEmail={quote.contactEmail}
                    approvalRequired={
                      approvalRequired ||
                      Boolean(approvalStates[quote.id]?.approvalRequired)
                    }
                    approvalCanSend={
                      !stale &&
                      approvalCanSend &&
                      (approvalStates[quote.id]?.canSend ?? true)
                    }
                    approvalGateReason={
                      approvalGateReason ||
                      approvalStates[quote.id]?.gateReason ||
                      null
                    }
                    proposedCompletionDate={proposedCompletionDate}
                    realCompletionDeadline={realCompletionDeadline}
                    initialEmailDraft={
                      emailDrafts.find(
                        (draft) =>
                          draft.kind === "funding_proposal" &&
                          draft.contextId === quote.id,
                      ) ?? null
                    }
                    proposals={sent}
                  />
                </div>
              </details>
            ) : null}
          </article>
        );
      })}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!draft || !mutation.isPending(draft.id)) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{guided ? "Start a proposal" : "Partner quotation"}</DialogTitle>
            <DialogDescription>
              {guided
                ? "Three short steps. Nothing is emailed until you review and send it."
                : "Choose the costs that need funding. You can save without a partner and assign one later."}
            </DialogDescription>
          </DialogHeader>
          {draft ? (() => {
            const partnerFields = (
              <>
                <div className="space-y-2">
                  <Label htmlFor="quotation-directory">
                    Choose a saved partner (optional)
                  </Label>
                  <select
                    id="quotation-directory"
                    className={selectClass}
                    value={partners.find((partner) =>
                      partner.id === draft.partnerId &&
                      partner.name.trim().toLowerCase() === draft.partnerName.trim().toLowerCase(),
                    )?.id ?? ""}
                    onChange={(event) => {
                      const partner = partners.find(
                        (p) => p.id === event.target.value,
                      );
                      const contact =
                        partner?.contacts.find((c) => c.isPrimary) ??
                        partner?.contacts[0];
                      setPrefilledPartner(false);
                      setDraft({
                        ...draft,
                        partnerId: partner?.id ?? null,
                        partnerName: partner?.name ?? "",
                        contactName: contact
                          ? [contact.firstName, contact.lastName]
                              .filter(Boolean)
                              .join(" ")
                          : "",
                        contactEmail: contact?.email ?? "",
                      });
                    }}
                  >
                    <option value="">
                      Partner needed / enter details below
                    </option>
                    {partners.map((partner) => (
                      <option key={partner.id} value={partner.id}>
                        {partner.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    New partners and contact details are added to Partners when
                    you save this quotation.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="quotation-partner">
                      Partner name (optional)
                    </Label>
                    <Input
                      id="quotation-partner"
                      placeholder="Partner needed"
                      maxLength={200}
                      value={draft.partnerName}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          partnerName: event.target.value,
                          partnerId: partners.find((partner) =>
                            partner.name.trim().toLowerCase() === event.target.value.trim().toLowerCase(),
                          )?.id ?? null,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quotation-contact">
                      Contact name (optional)
                    </Label>
                    <Input
                      id="quotation-contact"
                      maxLength={200}
                      value={draft.contactName}
                      onChange={(event) =>
                        setDraft({ ...draft, contactName: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quotation-email">
                      Contact email (needed to send)
                    </Label>
                    <Input
                      id="quotation-email"
                      type="email"
                      value={draft.contactEmail}
                      onChange={(event) =>
                        setDraft({ ...draft, contactEmail: event.target.value })
                      }
                    />
                  </div>
                </div>
              </>
            );
            const titleField = (
                  <div className="space-y-2">
                    <Label htmlFor="quotation-title">Quotation title</Label>
                    <Input
                      id="quotation-title"
                      required
                      maxLength={200}
                      placeholder="Translation and layout"
                      value={draftTitle}
                      onChange={(event) => {
                        setTitleTouched(true);
                        setDraft({ ...draft, title: event.target.value });
                      }}
                    />
                  </div>
            );
            const costFields = (
                <fieldset className="space-y-3">
                  <legend className="mb-2 text-sm font-medium">
                    Costs to include
                  </legend>
                  <p className="text-xs text-muted-foreground">
                    Select a cost, then adjust the amount to split it between
                    partners. Printing quantities are alternatives; choose any
                    you want the partner to compare.
                  </p>
                  {others.length ? (
                    <p className="text-xs text-muted-foreground">
                      Amounts in saved quotations are already assigned, including
                      drafts. Edit the quotation shown below a cost to change its
                      share. Assigned does not mean funded.
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        amounts: Object.fromEntries(
                          publicItems
                            .filter((item) => remaining(item) > 0)
                            .map((item) => [
                              item.id,
                              (remaining(item) / 100).toFixed(2),
                            ]),
                        ),
                      })
                    }
                  >
                    Select remaining costs
                  </Button>
                  <div className="divide-y rounded-lg border">
                    {publicItems.map((item) => {
                      const checked = Object.hasOwn(draft.amounts, item.id);
                      const available = remaining(item);
                      const allocations = others
                        .map((quote) => ({
                          quote,
                          cents: assignedCost([quote], item.id),
                        }))
                        .filter(({ cents }) => cents > 0);
                      return (
                        <div
                          key={item.id}
                          className="space-y-2 p-3"
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <Checkbox
                                id={`share-${item.id}`}
                                aria-describedby={allocations.length ? `assigned-${item.id}` : undefined}
                                checked={checked}
                                disabled={!available && !checked}
                                onCheckedChange={(value) =>
                                  setAmount(
                                    item.id,
                                    value ? (available / 100).toFixed(2) : null,
                                  )
                                }
                              />
                              <Label
                                htmlFor={`share-${item.id}`}
                                className="min-w-0 cursor-pointer font-normal"
                              >
                                <span className="min-w-0 break-words">
                                  {item.partnerLabel || item.label}
                                  <span className="mt-1 block text-xs text-muted-foreground">
                                    {!available && allocations.length
                                      ? "Fully assigned to saved quotations"
                                      : `${money(available)} left to assign`}
                                  </span>
                                </span>
                              </Label>
                            </div>
                            {checked ? (
                              <Input
                                className="w-32"
                                aria-label={`${item.partnerLabel || item.label} share (${currency})`}
                                type="number"
                                min="0.01"
                                max={available / 100}
                                step="0.01"
                                required
                                value={draft.amounts[item.id]}
                                onChange={(event) =>
                                  setAmount(item.id, event.target.value)
                                }
                              />
                            ) : null}
                          </div>
                          {allocations.length ? (
                            <div id={`assigned-${item.id}`} className="space-y-2 pl-7">
                              {allocations.map(({ quote, cents }) => (
                                <div key={quote.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                  <p className="min-w-0 flex-1 break-words text-xs text-muted-foreground">
                                    Assigned to <span className="font-medium text-foreground">“{quote.title}”</span>
                                    {quote.partnerName ? ` · ${quote.partnerName}` : " · Partner needed"}
                                    {" · "}
                                    {new Intl.NumberFormat(undefined, {
                                      style: "currency",
                                      currency: quote.currency,
                                    }).format(cents / 100)}
                                  </p>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={mutation.isPending(quote.id)}
                                    aria-label={`Edit quotation ${quote.title} for ${quote.partnerName || "Partner needed"}`}
                                    onClick={() => editAssignedQuotation(quote)}
                                  >
                                    Edit quotation
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  {Object.keys(draft.amounts).some(
                    (id) => !publicItems.some((item) => item.id === id),
                  ) ? (
                    <div role="alert" className="text-sm text-destructive">
                      A selected cost was deleted or hidden.{" "}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            amounts: Object.fromEntries(
                              Object.entries(draft.amounts).filter(([id]) =>
                                publicItems.some((item) => item.id === id),
                              ),
                            ),
                          })
                        }
                      >
                        Remove unavailable costs
                      </Button>
                    </div>
                  ) : null}
                </fieldset>
            );
            const descriptionField = (
                <div className="space-y-2">
                  <Label htmlFor="quotation-description">
                    Description for this partner (optional)
                  </Label>
                  <Textarea
                    id="quotation-description"
                    maxLength={2000}
                    value={draft.description}
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                  />
                </div>
            );
            const total = (
              <p className="font-semibold tabular-nums">
                Quotation total: {draftPrintOptions.length ? "from " : ""}
                {money(draftTotal)}
              </p>
            );
            const canSave = !invalidAmounts && draftTotal > 0 && draftTitle.trim().length > 0;
            const hasPartner = draft.partnerName.trim().length > 0;
            const guideSteps: GuidedStep[] = [
              {
                key: "partner",
                label: "Partner",
                hint: "Who you ask",
                canContinue: draftEmailValid,
                content: (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium">Who are you asking?</h4>
                      <p className="text-sm text-muted-foreground">
                        {prefilledPartner
                          ? "This is the project’s funding partner. Change it if this proposal is for someone else."
                          : "Choose a saved partner, or type a new one."}
                      </p>
                    </div>
                    {partnerFields}
                    <p className={draftEmailValid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
                      {!draftEmailValid
                        ? "Enter a full email address, for example name@example.org."
                        : draft.contactEmail.trim()
                          ? "Sastra sends the proposal to this address after you review it."
                          : "You need an email to send the proposal. You can save now and add it later."}
                    </p>
                  </div>
                ),
              },
              {
                key: "costs",
                label: "What to ask for",
                hint: "Costs and amounts",
                canContinue: canSave,
                content: (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium">What do you ask this partner to fund?</h4>
                      <p className="text-sm text-muted-foreground">
                        Every cost with an amount left to assign is selected.
                        Untick a cost, or lower an amount, to ask for less.
                      </p>
                    </div>
                    {costFields}
                    {total}
                    {titleField}
                    {descriptionField}
                  </div>
                ),
              },
              {
                key: "review",
                label: "Review",
                hint: "Check and save",
                nextLabel: hasPartner ? "Save and write the email" : "Save partner quotation",
                canContinue: canSave && draftEmailValid,
                content: (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium">Check the proposal</h4>
                      <p className="text-sm text-muted-foreground">
                        Saving does not email anyone.
                      </p>
                    </div>
                    <dl className="divide-y rounded-lg border text-sm">
                      <div className="px-3 py-2.5">
                        <dt className="text-xs text-muted-foreground">Partner</dt>
                        <dd className="break-words">{hasPartner ? draft.partnerName : "Partner needed"}</dd>
                        <dd className="break-all text-xs text-muted-foreground">
                          {[draft.contactName.trim(), draft.contactEmail.trim() || "No email yet"].filter(Boolean).join(" · ")}
                        </dd>
                      </div>
                      <div className="px-3 py-2.5">
                        <dt className="text-xs text-muted-foreground">{draftTitle || "Costs"}</dt>
                        <dd className="font-semibold tabular-nums">
                          {draftPrintOptions.length ? "From " : ""}
                          {money(draftTotal)}
                        </dd>
                        <dd className="text-xs text-muted-foreground">
                          {Object.keys(draft.amounts).length} {Object.keys(draft.amounts).length === 1 ? "cost" : "costs"} selected
                        </dd>
                      </div>
                    </dl>
                    <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">What happens next</p>
                      <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                        {hasPartner ? (
                          <li>Sastra writes the email and attaches the quotation. You can change every word.</li>
                        ) : (
                          <li>Add the partner later with the pencil button on the saved quotation.</li>
                        )}
                        {approvalRequired ? (
                          <li>Your team approves the amount before the email can be sent.</li>
                        ) : null}
                        <li>You review the email and choose Send proposal.</li>
                        <li>When the partner replies, choose Record answer.</li>
                      </ol>
                    </div>
                  </div>
                ),
              },
            ];
            return (
            <form
              aria-busy={mutation.pending}
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!guided) save();
              }}
            >
              {guided ? (
                <GuidedSteps
                  steps={guideSteps}
                  current={guideStep}
                  onCurrentChange={setGuideStep}
                  onFinish={() => save(hasPartner)}
                  finishing={mutation.pending}
                  onSkip={() => setGuided(false)}
                  skipLabel="Show the full form"
                  footerClassName="sticky -bottom-4 z-10 -mx-4 -mb-4 bg-popover px-4 pb-4"
                />
              ) : (
              <fieldset disabled={mutation.pending} className="space-y-5">
                {partnerFields}
                {titleField}
                {costFields}
                {descriptionField}
                <DialogFooter className="items-center gap-3">
                  <div className="mr-auto">{total}</div>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!canSave}
                  >
                    {mutation.pending ? "Saving…" : "Save quotation"}
                  </Button>
                </DialogFooter>
              </fieldset>
              )}
            </form>
            );
          })() : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
