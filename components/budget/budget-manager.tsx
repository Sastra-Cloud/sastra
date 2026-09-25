"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  Download,
  Handshake,
  LoaderCircle,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";

import {
  addAcceptedPrintQuoteBudgetLine,
  addCustomLine,
  deleteBudgetLine,
  resetBudgetLineRate,
  seedDefaultBudget,
  updateBudgetLine,
  updateBudgetSettings,
} from "@/lib/budget/actions";
import { addPartnerContact, createPartner } from "@/lib/partners/actions";
import {
  budgetGroupLabel,
  committedFundingTotal,
  expectedNetCents,
  grossTargetCents,
  lineAmount,
  lineQuantity,
  partnerQuoteTotalCents,
  type BudgetUnit,
} from "@/lib/budget/compute";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { usePropState } from "@/hooks/use-prop-state";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { PartnerQuotePanel } from "@/components/budget/partner-quote-panel";

// The print/ship line stores its status in the label, e.g. "Printing — 3,000
// copies (finalized)". Show that status as an in-app badge and keep the label
// itself clean (the Excel drops it entirely).
const PRINT_STATE_BADGE: Record<string, string> = {
  finalized: "quote",
  estimate: "estimate",
  "awaiting quote": "awaiting quote",
};
function splitPrintLabel(label: string): { text: string; badge: string | null } {
  const match = /^(.*?)\s*\((finalized|estimate|awaiting quote)\)\s*$/i.exec(
    label
  );
  if (!match) return { text: label, badge: null };
  return {
    text: match[1],
    badge: PRINT_STATE_BADGE[match[2].toLowerCase()] ?? match[2],
  };
}

export type BudgetLineDTO = {
  id: string;
  group: "book_publishing" | "additional_media";
  category: string;
  label: string;
  partnerLabel: string | null;
  partnerUnitPrice: string | null;
  partnerVisible: boolean;
  unit: BudgetUnit;
  quantity: string;
  unitPrice: string;
  amount: string;
  amountSecured: string;
  amountSpent: string;
  isAutoQuantity: boolean;
};

export type BudgetPresentationDTO = {
  mode: "itemized" | "per_copy";
  deductionBps: number;
  publicDescription: string | null;
  perCopyQuantity: number | null;
  perCopyUnitPrice: string | null;
};

export type BudgetSettingsDTO = {
  wordCount: number;
  sourcePageCount: number;
  wordsPerPage: number;
  languageExpansionFactor: string;
  currency: string;
  rateTranslation: string;
  rateProofreading: string;
  rateEditing: string;
  rateCoverDesign: string;
  rateTypesetting: string;
  rateProjectManagement: string;
  ratePrintShip: string;
  rateAudiobook: string;
  rateVideoSeries: string;
  partnerName: string | null;
  partnerContactFirstName: string | null;
  partnerContactLastName: string | null;
  partnerContactEmail: string | null;
  partnerContact: string | null;
  partnerId: string | null;
  partnerContactId: string | null;
  workDescription: string | null;
};

type AcceptedPrintQuoteBudgetCandidate = {
  id: string;
  label: string;
  total: number;
  currency: string;
  quantity: number | null;
};

type BudgetLineEdit = {
  label?: string;
  unit?: BudgetUnit;
  unitPrice?: number;
  quantity?: number;
  amountSecured?: number;
  amountSpent?: number;
};

type ProjectWordCountControl = {
  value: string;
  savedValue: number;
  pending: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onReset: () => void;
};

type BudgetItemMutation =
  | { type: "upsert"; item: BudgetLineDTO }
  | { type: "remove"; id: string }
  | { type: "replace-all"; items: BudgetLineDTO[] };

type CustomBudgetLineDraft = {
  group: "book_publishing" | "additional_media";
  label: string;
  unit: BudgetUnit;
  quantity: number;
  unitPrice: number;
};

function applyBudgetItemMutation(
  current: BudgetLineDTO[],
  mutation: BudgetItemMutation
) {
  if (mutation.type === "replace-all") return mutation.items;
  if (mutation.type === "remove") {
    return current.filter((item) => item.id !== mutation.id);
  }
  const index = current.findIndex((item) => item.id === mutation.item.id);
  if (index < 0) return [...current, mutation.item];
  return current.map((item) =>
    item.id === mutation.item.id ? mutation.item : item
  );
}

function recomputeAutoBudgetItems(
  items: BudgetLineDTO[],
  basis: {
    wordCount: number;
    sourcePageCount: number;
    wordsPerPage: number;
    languageExpansionFactor: string;
  }
): BudgetLineDTO[] {
  return items.map((item) => {
    if (!item.isAutoQuantity) return item;
    const quantity = String(lineQuantity(item.unit, basis));
    return {
      ...item,
      quantity,
      amount: lineAmount(quantity, item.unitPrice),
    };
  });
}

function replaceTemporaryBudgetItem(
  current: BudgetLineDTO[],
  temporaryId: string,
  item: BudgetLineDTO
) {
  return [
    ...current.filter(
      (candidate) =>
        candidate.id !== temporaryId && candidate.id !== item.id
    ),
    item,
  ];
}

export type PartnerContactOption = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: string | null;
  isPrimary: boolean;
};
export type PartnerOption = {
  id: string;
  name: string;
  contacts: PartnerContactOption[];
};

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const GROUP_KEYS = ["book_publishing", "additional_media"] as const;

const UNIT_LABEL: Record<BudgetUnit, string> = {
  words: "words",
  pages: "pages",
  cover: "cover",
  project: "project",
  flat: "flat",
};

function lineStateKey(item: BudgetLineDTO) {
  return [
    item.id,
    item.label,
    item.unit,
    item.quantity,
    item.unitPrice,
    item.amountSecured,
    item.amountSpent,
  ].join(":");
}

function money(value: string | number, currency: string) {
  const n = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

export function BudgetManager({
  projectId,
  slug,
  projectKind,
  printRunId = null,
  scopeLabel = "Project quotation",
  canEdit,
  settings,
  items: initialItems,
  partners = [],
  totalReceived = 0,
  receivedContributions = 0,
  scheduledFunding = 0,
  acceptedPrintQuote = null,
  presentation = null,
  totalAvailable = 0,
  aggregateReadOnly = false,
}: {
  projectId: string;
  slug: string;
  projectKind: string | null;
  printRunId?: string | null;
  scopeLabel?: string;
  canEdit: boolean;
  settings: BudgetSettingsDTO;
  items: BudgetLineDTO[];
  partners?: PartnerOption[];
  totalReceived?: number;
  receivedContributions?: number;
  scheduledFunding?: number;
  acceptedPrintQuote?: AcceptedPrintQuoteBudgetCandidate | null;
  presentation?: BudgetPresentationDTO | null;
  totalAvailable?: number;
  aggregateReadOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failedLineEdits, setFailedLineEdits] = useState<
    Record<string, BudgetLineEdit>
  >({});
  const [failedCustomLine, setFailedCustomLine] = useState<{
    attempt: number;
    fields: CustomBudgetLineDraft;
  } | null>(null);
  const [wordCountDraft, setWordCountDraft] = usePropState(
    String(settings.wordCount)
  );
  const [savedWordCount, setSavedWordCount] = usePropState(settings.wordCount);
  const [itemSource] = usePropState(initialItems);
  const itemMutation = useOptimisticAction({
    state: itemSource,
    update: applyBudgetItemMutation,
    getKey: (mutation: BudgetItemMutation) =>
      mutation.type === "remove"
        ? mutation.id
        : mutation.type === "replace-all"
          ? "quotation-settings"
          : mutation.item.id,
  });
  const items = itemMutation.state;

  const run = (fn: () => Promise<unknown>, ok?: string, rollback?: () => void) =>
    start(async () => {
      try {
        const result = await fn();
        if (result && typeof result === "object" && "error" in result && result.error) {
          throw new Error(String(result.error));
        }
        router.refresh();
        if (ok) toast.success(ok);
      } catch (error) {
        rollback?.();
        toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
      }
    });

  function saveLine(item: BudgetLineDTO, fields: BudgetLineEdit) {
    setFailedLineEdits((current) => {
      if (!(item.id in current)) return current;
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    const quantity = String(fields.quantity ?? Number(item.quantity));
    const unitPrice = String(fields.unitPrice ?? Number(item.unitPrice));
    const optimisticItem = {
      ...item,
      ...(fields.label !== undefined ? { label: fields.label } : {}),
      ...(fields.unit !== undefined ? { unit: fields.unit } : {}),
      quantity,
      unitPrice,
      amount: String(lineAmount(quantity, unitPrice)),
      amountSecured: String(
        fields.amountSecured ?? Number(item.amountSecured)
      ),
      amountSpent: String(fields.amountSpent ?? Number(item.amountSpent)),
    };
    itemMutation.run(
      { type: "upsert", item: optimisticItem },
      () => updateBudgetLine(item.id, fields),
      {
        errorMessage: `Could not save “${item.label}”.`,
        reconcile: (result, current) =>
          result
            ? applyBudgetItemMutation(current, {
                type: "upsert",
                item: result,
              })
            : current,
        onSuccess: () => router.refresh(),
        onError: () =>
          setFailedLineEdits((current) => ({
            ...current,
            [item.id]: fields,
          })),
      }
    );
  }

  function removeLine(item: BudgetLineDTO) {
    itemMutation.run(
      { type: "remove", id: item.id },
      () => deleteBudgetLine(item.id),
      {
        errorMessage: `Could not delete “${item.label}”.`,
        onSuccess: () => router.refresh(),
      }
    );
  }

  function addLineOptimistically(
    item: BudgetLineDTO,
    action: () => Promise<
      BudgetLineDTO | { item?: BudgetLineDTO; error?: string } | undefined
    >,
    onError?: () => void
  ) {
    itemMutation.run({ type: "upsert", item }, action, {
      errorMessage: `Could not add “${item.label}”.`,
      reconcile: (result, current) => {
        const canonical =
          result && "item" in result
            ? result.item
            : result && "id" in result
              ? result
              : undefined;
        return canonical
          ? replaceTemporaryBudgetItem(current, item.id, canonical)
          : current;
      },
      onSuccess: () => router.refresh(),
      onError,
    });
  }

  function addCustomLineOptimistically(fields: CustomBudgetLineDraft) {
    setFailedCustomLine(null);
    const temporaryId = `temporary-${crypto.randomUUID()}`;
    addLineOptimistically(
      {
        id: temporaryId,
        group: fields.group,
        category: "custom",
        label: fields.label,
        partnerLabel: null,
        partnerUnitPrice: null,
        partnerVisible: true,
        unit: fields.unit,
        quantity: String(fields.quantity),
        unitPrice: String(fields.unitPrice),
        amount: String(lineAmount(fields.quantity, fields.unitPrice)),
        amountSecured: "0",
        amountSpent: "0",
        isAutoQuantity: false,
      },
      () => addCustomLine(projectId, { ...fields, printRunId }),
      () =>
        setFailedCustomLine((current) => ({
          attempt: (current?.attempt ?? 0) + 1,
          fields,
        }))
    );
  }

  function addAcceptedQuoteOptimistically(
    quote: AcceptedPrintQuoteBudgetCandidate
  ) {
    const temporaryId = `temporary-${crypto.randomUUID()}`;
    addLineOptimistically(
      {
        id: temporaryId,
        group: "book_publishing",
        category: "print_ship",
        label: quote.label,
        partnerLabel: null,
        partnerUnitPrice: null,
        partnerVisible: true,
        unit: "flat",
        quantity: "1",
        unitPrice: String(quote.total),
        amount: String(quote.total),
        amountSecured: "0",
        amountSpent: "0",
        isAutoQuantity: false,
      },
      () => addAcceptedPrintQuoteBudgetLine(quote.id)
    );
  }

  function saveQuotationSettings(
    fields: Record<string, string>,
    successMessage = "Settings saved"
  ) {
    const nextWordCount = Number(fields.wordCount ?? wordCountDraft);
    const nextSourcePageCount = Number(
      fields.sourcePageCount ?? settings.sourcePageCount
    );
    const nextWordsPerPage = Number(fields.wordsPerPage ?? settings.wordsPerPage);
    if (!Number.isInteger(nextWordCount) || nextWordCount < 0) {
      toast.error("Enter a whole word count of 0 or more.");
      return;
    }
    if (!Number.isInteger(nextSourcePageCount) || nextSourcePageCount < 0) {
      toast.error("Enter a whole English page count of 0 or more.");
      return;
    }
    if (!Number.isInteger(nextWordsPerPage) || nextWordsPerPage < 1) {
      toast.error("Words per page must be at least 1.");
      return;
    }

    setWordCountDraft(String(nextWordCount));
    const previousWordCount = savedWordCount;
    setSavedWordCount(nextWordCount);
    const optimisticItems = recomputeAutoBudgetItems(items, {
      wordCount: nextWordCount,
      sourcePageCount: nextSourcePageCount,
      wordsPerPage: nextWordsPerPage,
      languageExpansionFactor: settings.languageExpansionFactor,
    });
    itemMutation.run(
      { type: "replace-all", items: optimisticItems },
      () => updateBudgetSettings(projectId, fields),
      {
        errorMessage: "Could not save quotation settings.",
        onSuccess: () => {
          toast.success(successMessage);
          router.refresh();
        },
        onError: () => setSavedWordCount(previousWordCount),
      }
    );
  }

  const currency = settings.currency;
  const primaryGroupLabel = budgetGroupLabel("book_publishing", projectKind);
  const total = items.reduce((s, i) => s + Number(i.amount), 0);
  const internalCostCents = Math.round(total * 100);
  const minimumFundingTargetCents = presentation
    ? grossTargetCents(internalCostCents, presentation.deductionBps)
    : internalCostCents;
  const deductionReserveCents =
    minimumFundingTargetCents - internalCostCents;
  const itemizedPartnerTotal =
    partnerQuoteTotalCents(items) / 100;
  const partnerTotal =
    presentation?.mode === "per_copy"
      ? (presentation.perCopyQuantity ?? 0) *
        Number(presentation.perCopyUnitPrice ?? 0)
      : itemizedPartnerTotal;
  const fundingTarget = presentation ? partnerTotal : total;
  const expectedPartnerNet = presentation
    ? expectedNetCents(
        Math.round(fundingTarget * 100),
        presentation.deductionBps
      ) / 100
    : fundingTarget;
  const lineRaised = items.reduce((s, i) => s + Number(i.amountSecured), 0);
  const raised = committedFundingTotal(
    lineRaised,
    scheduledFunding,
    receivedContributions
  );
  const spent = items.reduce((s, i) => s + Number(i.amountSpent), 0);
  const toRaise = Math.max(0, fundingTarget - raised);

  const hasAgreementFundingContext =
    scheduledFunding > 0 || totalReceived > 0 || Boolean(settings.partnerName);
  const displayedSettings = {
    ...settings,
    wordCount: Number(wordCountDraft) || 0,
  };
  const projectWordCountControl: ProjectWordCountControl | undefined =
    canEdit && !printRunId && !aggregateReadOnly
      ? {
          value: wordCountDraft,
          savedValue: savedWordCount,
          pending: itemMutation.isPending("quotation-settings"),
          onChange: setWordCountDraft,
          onSave: () =>
            saveQuotationSettings(
              { wordCount: wordCountDraft },
              "Project word count updated"
            ),
          onReset: () => setWordCountDraft(String(savedWordCount)),
        }
      : undefined;

  if (items.length === 0 && !hasAgreementFundingContext) {
    return (
      <div className="space-y-4" aria-busy={pending}>
        <Card
          id={printRunId ? "reprint-budget-setup" : undefined}
          className="scroll-mt-24"
        >
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="max-w-xl space-y-1.5">
              <h3 className="font-medium">
                {printRunId ? "Set up this reprint budget" : "No quotation yet"}
              </h3>
              <p className="text-pretty text-sm text-muted-foreground">
                {printRunId
                  ? acceptedPrintQuote
                    ? `Use the accepted ${money(
                        acceptedPrintQuote.total,
                        acceptedPrintQuote.currency
                      )} printer quote${
                        acceptedPrintQuote.quantity
                          ? ` for ${acceptedPrintQuote.quantity.toLocaleString()} copies`
                          : ""
                      } as the reprint’s main cost. Add freight, insurance, or other costs as separate lines.`
                    : canEdit
                      ? "Accept a printer quote on the Print tab to bring its cost here automatically, or add the reprint cost manually."
                      : "A manager hasn’t added the accepted printer quote or a custom reprint cost yet."
                  : canEdit
                    ? "Seed the standard publishing lines, then enter the word count to cost it out — or add your own line below."
                    : "A manager hasn't set up the budget for this project."}
              </p>
            </div>
            {canEdit && printRunId && acceptedPrintQuote ? (
              <Button
                onClick={() =>
                  addAcceptedQuoteOptimistically(acceptedPrintQuote)
                }
              >
                <Plus className="size-4" />
                Add accepted quote to budget
              </Button>
            ) : null}
            {canEdit && printRunId && !acceptedPrintQuote ? (
              <Link
                href={`/projects/${slug}/print`}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Review printer quotes
              </Link>
            ) : null}
            {canEdit && !printRunId ? (
              <Button
                disabled={pending}
                onClick={() => run(() => seedDefaultBudget(projectId), "Quotation seeded")}
              >
                Seed standard lines
              </Button>
            ) : null}
          </CardContent>
        </Card>
        {canEdit ? (
          <AddCustomLine
            key={
              failedCustomLine
                ? `retry-custom-line-${failedCustomLine.attempt}`
                : "add-custom-line"
            }
            triggerLabel={
              printRunId ? "Add a custom reprint cost" : "Add custom line"
            }
            primaryGroupLabel={primaryGroupLabel}
            initialFields={failedCustomLine?.fields}
            onDismiss={() => setFailedCustomLine(null)}
            onAdd={addCustomLineOptimistically}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5" aria-busy={pending}>
      {/* Header + export */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight">
          {scopeLabel}
          <HelpTip title="How the quotation works" side="bottom" align="start">
            Each line is <strong>quantity × unit price</strong>. Word-driven
            lines (translation, editing, audiobook…) and typesetting fill their
            quantity automatically from the word count in Settings. Fill in
            “Funding assigned” when money is earmarked for a specific line;
            export to Excel anytime.
          </HelpTip>
        </h2>
        {!aggregateReadOnly ? (
          <a
            href={`/api/projects/${slug}/budget/export${
              printRunId ? `?run=${printRunId}` : ""
            }`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            download
          >
            <Download className="size-3.5" /> Export to Excel
          </a>
        ) : null}
      </div>

      {/* Funding strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat
          label="Project costs"
          value={money(total, currency)}
          help="The internal costs needed to deliver this budget scope."
        />
        <Stat
          label="Partner quote"
          value={money(fundingTarget, currency)}
          help="What the partner sees and is asked to fund."
          detail={
            presentation && presentation.deductionBps > 0
              ? `After ${presentation.deductionBps / 100}% organization fee: ${money(
                  expectedPartnerNet,
                  currency
                )} expected net`
              : undefined
          }
        />
        <Stat
          label="Committed"
          value={money(raised, currency)}
          help="Funding committed so far: the larger of the agreement payment schedule or line-level assigned funding, plus non-MoU donations received."
        />
        <Stat
          label="Received"
          value={money(totalReceived, currency)}
          tone={totalReceived > 0 ? "success" : undefined}
          help="Money actually paid in, totalled from the Funding received ledger below."
        />
        <Stat
          label="Available"
          value={money(totalAvailable, currency)}
          tone={totalAvailable > 0 ? "success" : undefined}
          help="Actual net funding available after the organization donation fee. Older receipts without net data use their gross amount."
        />
        <Stat label="Spent" value={money(spent, currency)} />
      </div>

      {toRaise > 0 ? (
        <p className="text-sm text-muted-foreground">
          {money(toRaise, currency)} of the partner quote remains uncommitted.
        </p>
      ) : null}

      <div className="border-b pb-1">
        <div className="space-y-1">
          <h3 className="font-semibold">Main budget plan</h3>
          <p className="text-sm text-muted-foreground">
            {projectWordCountControl
              ? "Edit the project word count and internal costs below. Use Funding assigned to earmark promised money for a specific line."
              : "Review internal costs below. Use Funding assigned to earmark promised money for a specific line."}
          </p>
        </div>
      </div>

      {aggregateReadOnly ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          All history combines the main project and every reprint for audit.
          Choose a single scope to edit costs, partner pricing, funding, or invoices.
        </p>
      ) : null}

      {canEdit ? (
        <SettingsCard
          settings={displayedSettings}
          disabled={
            pending || itemMutation.isPending("quotation-settings")
          }
          onSave={(fields) => saveQuotationSettings(fields)}
        />
      ) : (
        <Card>
          <CardContent className="py-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {displayedSettings.wordCount.toLocaleString()}
            </span>{" "}
            words · {settings.currency}
            {settings.partnerName ? ` · Funding partner: ${settings.partnerName}` : ""}
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground text-pretty">
              The agreement funding is recorded, but this project does not have
              an itemized cost quotation yet.
            </p>
            {canEdit && !printRunId ? (
              <Button
                disabled={pending}
                onClick={() =>
                  run(() => seedDefaultBudget(projectId), "Quotation seeded")
                }
              >
                Seed standard lines
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Group tables */}
      {GROUP_KEYS.map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length === 0) return null;
        const subtotal = groupItems.reduce((s, i) => s + Number(i.amount), 0);
        const groupLabel = budgetGroupLabel(group, projectKind);
        return (
          <Card key={group} className="overflow-hidden">
            <CardContent className="p-0">
              <div className="md:hidden">
                <div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                  {groupLabel}
                </div>
                <div className="divide-y">
                  {groupItems.map((item) => (
                    <MobileBudgetRow
                      key={lineStateKey(item)}
                      item={item}
                      currency={currency}
                      canEdit={canEdit}
                      disabled={itemMutation.isPending(item.id)}
                      saving={itemMutation.isPending(item.id)}
                      retryEdit={failedLineEdits[item.id]}
                      projectWordCountControl={projectWordCountControl}
                      onSave={(fields) => saveLine(item, fields)}
                      onReset={() =>
                        run(() => resetBudgetLineRate(item.id), "Rate reset")
                      }
                      onDelete={() => removeLine(item)}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between border-t px-3 py-3 text-sm font-semibold">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{money(subtotal, currency)}</span>
                </div>
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[60rem] text-sm">
                  <caption className="sr-only">{groupLabel} costs</caption>
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <th scope="col" className="px-3 py-2 text-left font-medium">
                        {groupLabel}
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        <span className="inline-flex items-center gap-1">
                          Qty
                          <HelpTip iconClassName="size-3" label="About quantity">
                            Word quantities are the shared project word count:
                            edit any word quantity to update every word-based
                            line. Page quantities are calculated automatically.
                            Custom lines let you type any quantity.
                          </HelpTip>
                        </span>
                      </th>
                      <th scope="col" className="px-2 py-2 text-left font-medium">
                        Unit
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Unit price
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Amount
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        <span className="inline-flex items-center gap-1">
                          Funding assigned
                          <HelpTip
                            iconClassName="size-3"
                            label="About funding assigned"
                          >
                            Money promised or earmarked for this specific line.
                            Donations and other receipts appear in the project
                            totals first; assign them here only when you need
                            line-level funding status.
                          </HelpTip>
                        </span>
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        <span className="inline-flex items-center gap-1">
                          Spent
                          <HelpTip iconClassName="size-3" label="About spent">
                            Actual money paid out on this line. The Print / Ship
                            estimate comes from the printer quote for your chosen
                            copy count (set on the Print tab); its actual spend
                            fills in from print payments marked paid. Other lines
                            can be filled in by hand.
                          </HelpTip>
                        </span>
                      </th>
                      {canEdit ? (
                        <th scope="col" className="px-2 py-2">
                          <span className="sr-only">Actions</span>
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {groupItems.map((item) => (
                      <BudgetRow
                        key={lineStateKey(item)}
                        item={item}
                        currency={currency}
                        canEdit={canEdit}
                        disabled={itemMutation.isPending(item.id)}
                        saving={itemMutation.isPending(item.id)}
                        retryEdit={failedLineEdits[item.id]}
                        projectWordCountControl={projectWordCountControl}
                        onSave={(fields) => saveLine(item, fields)}
                        onReset={() =>
                          run(() => resetBudgetLineRate(item.id), "Rate reset")
                        }
                        onDelete={() => removeLine(item)}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold">
                      <th scope="row" colSpan={4} className="px-3 py-2 text-right">
                        Subtotal
                      </th>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {money(subtotal, currency)}
                      </td>
                      <td colSpan={canEdit ? 3 : 2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Grand total */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium">Project costs</span>
            <span className="font-semibold tabular-nums">
              {money(total, currency)}
            </span>
          </div>
          {presentation && presentation.deductionBps > 0 ? (
            <>
              <div className="flex items-start justify-between gap-4 text-sm text-muted-foreground">
                <span className="flex flex-wrap items-center gap-1.5">
                  Organization fee coverage (
                  {(presentation.deductionBps / 100)
                    .toFixed(2)
                    .replace(/\.?0+$/, "")}
                  %)
                  <Badge variant="outline">Internal only</Badge>
                  <HelpTip
                    iconClassName="size-3"
                    label="About organization fee coverage"
                  >
                    This is the extra funding needed so the project costs remain
                    available after your organization retains its donation fee.
                    Sastra calculates it from the gross funding target; it is not
                    an editable expense and is never shown as a fee line to the
                    partner.
                  </HelpTip>
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  +{money(deductionReserveCents / 100, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 border-t pt-3">
                <span className="font-display text-base font-semibold">
                  Minimum funding target
                </span>
                <span className="text-lg font-semibold tabular-nums">
                  {money(minimumFundingTargetCents / 100, currency)}
                </span>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {canEdit ? (
        <AddCustomLine
          key={
            failedCustomLine
              ? `retry-custom-line-${failedCustomLine.attempt}`
              : "add-custom-line"
          }
          triggerLabel={
            printRunId ? "Add another reprint cost" : "Add custom line"
          }
          primaryGroupLabel={primaryGroupLabel}
          initialFields={failedCustomLine?.fields}
          onDismiss={() => setFailedCustomLine(null)}
          onAdd={addCustomLineOptimistically}
        />
      ) : null}

      {!aggregateReadOnly ? (
        <PartnerQuotePanel
          projectId={projectId}
          slug={slug}
          printRunId={printRunId}
          currency={currency}
          canEdit={canEdit}
          presentation={presentation}
          items={items}
        />
      ) : null}

      <FundingPartnerCard
        projectId={projectId}
        settings={displayedSettings}
        partners={partners}
        canEdit={canEdit}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  help,
  detail,
}: {
  label: string;
  value: string;
  tone?: "destructive" | "success";
  help?: React.ReactNode;
  detail?: string;
}) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {label}
          {help ? (
            <HelpTip iconClassName="size-3" label={`About ${label}`}>
              {help}
            </HelpTip>
          ) : null}
        </p>
        <p
          className={cn(
            "text-lg font-semibold tabular-nums",
            tone === "destructive" && "text-destructive",
            tone === "success" && "text-success"
          )}
        >
          {value}
        </p>
        {detail ? (
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {detail}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

type PartnerFields = {
  partnerId?: string;
  partnerContactId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  note?: string;
};

function contactOptionLabel(contact: PartnerContactOption) {
  const name =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    "(unnamed)";
  const bits = [contact.role, contact.email].filter(Boolean).join(" · ");
  return bits ? `${name} — ${bits}` : name;
}

function FundingPartnerCard({
  projectId,
  settings,
  partners,
  canEdit,
}: {
  projectId: string;
  settings: BudgetSettingsDTO;
  partners: PartnerOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, startBusy] = useTransition();
  const [editing, setEditing] = useState(false);
  const [addingPartner, setAddingPartner] = useState(false);

  const [partnerId, setPartnerId] = useState(settings.partnerId ?? "");
  const [partnerContactId, setPartnerContactId] = useState(
    settings.partnerContactId ?? ""
  );
  const [name, setName] = useState(settings.partnerName ?? "");
  const [firstName, setFirstName] = useState(
    settings.partnerContactFirstName ?? ""
  );
  const [lastName, setLastName] = useState(
    settings.partnerContactLastName ?? ""
  );
  const [email, setEmail] = useState(settings.partnerContactEmail ?? "");
  const [note, setNote] = useState(settings.partnerContact ?? "");

  const selectedPartner = partners.find((p) => p.id === partnerId) ?? null;
  const contactLine = [
    [firstName, lastName].filter(Boolean).join(" "),
    email,
  ]
    .filter(Boolean)
    .join(" · ");
  const hasPartner = Boolean(name || contactLine);

  function persist(overrides: PartnerFields = {}) {
    startBusy(async () => {
      try {
        await updateBudgetSettings(projectId, {
          partnerId: (overrides.partnerId ?? partnerId) || null,
          partnerContactId: (overrides.partnerContactId ?? partnerContactId) || null,
          partnerName: overrides.name ?? name,
          partnerContactFirstName: overrides.firstName ?? firstName,
          partnerContactLastName: overrides.lastName ?? lastName,
          partnerContactEmail: overrides.email ?? email,
          partnerContact: overrides.note ?? note,
        });
        setEditing(false);
        router.refresh();
        toast.success("Funding partner saved");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  function fillFromContact(contact: PartnerContactOption | null) {
    setFirstName(contact?.firstName ?? "");
    setLastName(contact?.lastName ?? "");
    setEmail(contact?.email ?? "");
  }

  function selectPartner(id: string) {
    setPartnerId(id);
    setPartnerContactId("");
    const partner = partners.find((p) => p.id === id) ?? null;
    if (!partner) return;
    setName(partner.name);
    const primary =
      partner.contacts.find((c) => c.isPrimary) ?? partner.contacts[0] ?? null;
    if (primary) {
      setPartnerContactId(primary.id);
      fillFromContact(primary);
    }
  }

  function selectContact(id: string) {
    setPartnerContactId(id);
    fillFromContact(selectedPartner?.contacts.find((c) => c.id === id) ?? null);
  }

  function switchContact(id: string) {
    const contact = selectedPartner?.contacts.find((c) => c.id === id) ?? null;
    setPartnerContactId(id);
    fillFromContact(contact);
    persist({
      partnerContactId: id,
      firstName: contact?.firstName ?? "",
      lastName: contact?.lastName ?? "",
      email: contact?.email ?? "",
    });
  }

  function unlink() {
    setPartnerId("");
    setPartnerContactId("");
    persist({ partnerId: "", partnerContactId: "" });
  }

  function cancelEdit() {
    setPartnerId(settings.partnerId ?? "");
    setPartnerContactId(settings.partnerContactId ?? "");
    setName(settings.partnerName ?? "");
    setFirstName(settings.partnerContactFirstName ?? "");
    setLastName(settings.partnerContactLastName ?? "");
    setEmail(settings.partnerContactEmail ?? "");
    setNote(settings.partnerContact ?? "");
    setAddingPartner(false);
    setEditing(false);
  }

  function createNewPartner(values: {
    org: string;
    first: string;
    last: string;
    email: string;
  }) {
    startBusy(async () => {
      try {
        const { id } = await createPartner({ name: values.org });
        let contactId = "";
        if (values.first || values.last || values.email) {
          const contact = await addPartnerContact(id, {
            firstName: values.first || undefined,
            lastName: values.last || undefined,
            email: values.email || undefined,
            isPrimary: true,
          });
          contactId = contact.id;
        }
        setPartnerId(id);
        setPartnerContactId(contactId);
        setName(values.org);
        setFirstName(values.first);
        setLastName(values.last);
        setEmail(values.email);
        await updateBudgetSettings(projectId, {
          partnerId: id,
          partnerContactId: contactId || null,
          partnerName: values.org,
          partnerContactFirstName: values.first,
          partnerContactLastName: values.last,
          partnerContactEmail: values.email,
          partnerContact: note,
        });
        setAddingPartner(false);
        setEditing(false);
        router.refresh();
        toast.success("Partner added & linked");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not add the partner."
        );
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-lg border bg-muted/40 p-2 text-muted-foreground">
              <Handshake className="size-4" />
            </span>
            <p className="text-sm font-medium">Funding partner</p>
          </div>
          {canEdit && !editing ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" />
              {hasPartner ? "Edit" : "Add"}
            </Button>
          ) : null}
        </div>

        {editing ? (
          addingPartner ? (
            <NewPartnerForm
              disabled={busy}
              onCancel={() => setAddingPartner(false)}
              onCreate={createNewPartner}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                {partners.length > 0 ? (
                  <div className="min-w-[12rem] flex-1">
                    <Label className="mb-1.5 block text-xs text-muted-foreground">
                      Saved partner
                    </Label>
                    <select
                      className={cn(selectClass, "w-full")}
                      value={partnerId}
                      onChange={(e) => selectPartner(e.target.value)}
                    >
                      <option value="">None — enter manually</option>
                      {partners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {selectedPartner && selectedPartner.contacts.length > 1 ? (
                  <div className="min-w-[12rem] flex-1">
                    <Label className="mb-1.5 block text-xs text-muted-foreground">
                      Contact
                    </Label>
                    <select
                      className={cn(selectClass, "w-full")}
                      value={partnerContactId}
                      onChange={(e) => selectContact(e.target.value)}
                    >
                      {selectedPartner.contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {contactOptionLabel(c)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setAddingPartner(true)}
                >
                  <Plus className="size-4" />
                  New
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Funding partner / sponsor">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. 9Marks, church, individual donor"
                  />
                </Field>
                <Field label="Contact first name">
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Judith — greets the proposal"
                  />
                </Field>
                <Field label="Contact last name">
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Smith — shown on the quotation"
                  />
                </Field>
                <Field label="Contact email">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. judith@9marks.org"
                  />
                </Field>
                <Field label="Contact note">
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional: phone, alt contact, notes"
                  />
                </Field>
              </div>

              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => persist()}>
                  Save partner
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={cancelEdit}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )
        ) : hasPartner ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {name ? <span className="font-medium">{name}</span> : null}
              {contactLine ? (
                <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                  <Mail className="size-3.5 shrink-0" />
                  <span className="truncate">{contactLine}</span>
                </span>
              ) : null}
              {partnerId ? (
                <Badge variant="outline" className="text-[10px] font-normal">
                  linked
                </Badge>
              ) : null}
            </div>
            {canEdit && partnerId ? (
              <div className="flex flex-wrap items-center gap-2">
                {selectedPartner && selectedPartner.contacts.length > 1 ? (
                  <select
                    className={selectClass}
                    value={partnerContactId}
                    disabled={busy}
                    onChange={(e) => switchContact(e.target.value)}
                  >
                    {selectedPartner.contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {contactOptionLabel(c)}
                      </option>
                    ))}
                  </select>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={busy}
                  onClick={unlink}
                >
                  Unlink
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No funding partner recorded yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectWordCountInput({
  itemLabel,
  control,
  className,
}: {
  itemLabel: string;
  control: ProjectWordCountControl;
  className?: string;
}) {
  const dirty = control.value !== String(control.savedValue);

  return (
    <div
      className={cn("relative w-24", className)}
      title="Project word count — updates every word-based budget line"
    >
      <input
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        value={control.value}
        disabled={control.pending}
        aria-label={`Project word count, shown on ${itemLabel}`}
        onChange={(event) => control.onChange(event.target.value)}
        onBlur={() => {
          if (dirty && !control.pending) control.onSave();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            control.onReset();
          }
        }}
        className={cn(
          "h-8 w-full rounded-md border border-input bg-transparent px-2 text-right tabular-nums outline-none",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          control.pending && "pr-7"
        )}
      />
      {control.pending ? (
        <LoaderCircle
          aria-label="Saving project word count"
          className="absolute right-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none"
        />
      ) : null}
    </div>
  );
}

function BudgetRow({
  item,
  currency,
  canEdit,
  disabled,
  saving,
  retryEdit,
  projectWordCountControl,
  onSave,
  onReset,
  onDelete,
}: {
  item: BudgetLineDTO;
  currency: string;
  canEdit: boolean;
  disabled: boolean;
  saving: boolean;
  retryEdit?: BudgetLineEdit;
  projectWordCountControl?: ProjectWordCountControl;
  onSave: (fields: BudgetLineEdit) => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(retryEdit?.label ?? item.label);
  const [unit, setUnit] = useState(retryEdit?.unit ?? item.unit);
  const [unitPrice, setUnitPrice] = useState(
    String(retryEdit?.unitPrice ?? item.unitPrice)
  );
  const [quantity, setQuantity] = useState(
    String(retryEdit?.quantity ?? item.quantity)
  );
  const [secured, setSecured] = useState(
    String(retryEdit?.amountSecured ?? item.amountSecured)
  );
  const [spent, setSpent] = useState(
    String(retryEdit?.amountSpent ?? item.amountSpent)
  );

  const dirty =
    label !== item.label ||
    (item.category === "custom" && unit !== item.unit) ||
    unitPrice !== item.unitPrice ||
    (!item.isAutoQuantity && quantity !== item.quantity) ||
    secured !== item.amountSecured ||
    spent !== item.amountSpent;

  // Live amount preview (server recomputes on save).
  const previewAmount = lineAmount(
    item.isAutoQuantity ? item.quantity : quantity,
    unitPrice
  );
  const isStandard = item.category !== "custom";

  return (
    <tr className="hover:bg-muted/30">
      <th
        scope="row"
        className="min-w-56 px-3 py-2 text-left font-normal"
      >
        {canEdit ? (
          <div className="space-y-1">
            <input
              value={label}
              aria-label={`Label for ${item.label}`}
              disabled={disabled}
              onChange={(event) => setLabel(event.target.value)}
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-left outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            {saving ? (
              <span className="block text-[11px] text-muted-foreground">
                Saving…
              </span>
            ) : null}
          </div>
        ) : item.category === "print_ship" ? (
          (() => {
            const { text, badge } = splitPrintLabel(item.label);
            return (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span>{text}</span>
                {badge ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-normal text-muted-foreground"
                  >
                    {badge}
                  </Badge>
                ) : null}
              </span>
            );
          })()
        ) : (
          item.label
        )}
      </th>
      <td className="px-2 py-2 text-right tabular-nums">
        {item.isAutoQuantity &&
        item.unit === "words" &&
        projectWordCountControl ? (
          <ProjectWordCountInput
            itemLabel={item.label}
            control={projectWordCountControl}
            className="ml-auto"
          />
        ) : item.isAutoQuantity || !canEdit ? (
          <span className={item.isAutoQuantity ? "text-muted-foreground" : ""}>
            {Number(item.isAutoQuantity ? item.quantity : quantity).toLocaleString()}
          </span>
        ) : (
          <input
            type="number"
            min="0"
            step="1"
            aria-label={`Quantity for ${item.label}`}
            disabled={disabled}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="h-8 w-20 rounded-md border border-input bg-transparent px-2 text-right tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        )}
      </td>
      <td className="px-2 py-2 text-left text-muted-foreground">
        {canEdit && item.category === "custom" ? (
          <select
            value={unit}
            aria-label={`Unit for ${item.label}`}
            disabled={disabled}
            onChange={(event) => setUnit(event.target.value as BudgetUnit)}
            className={cn(selectClass, "w-24")}
          >
            {Object.entries(UNIT_LABEL).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        ) : (
          UNIT_LABEL[item.unit]
        )}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {canEdit ? (
          <div className="flex items-center justify-end gap-1">
            <input
              type="number"
              min="0"
              step="0.01"
              aria-label={`Unit price for ${item.label}`}
              disabled={disabled}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="h-8 w-24 rounded-md border border-input bg-transparent px-2 text-right tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            {isStandard ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Reset ${item.label} to default rate`}
                disabled={disabled}
                onClick={onReset}
              >
                <RotateCcw className="size-3" />
              </Button>
            ) : null}
          </div>
        ) : (
          money(unitPrice, currency)
        )}
      </td>
      <td className="px-2 py-2 text-right font-medium tabular-nums">
        {money(previewAmount, currency)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {canEdit ? (
          <input
            type="number"
            min="0"
            step="0.01"
            aria-label={`Funding assigned to ${item.label}`}
            disabled={disabled}
            value={secured}
            onChange={(e) => setSecured(e.target.value)}
            className="h-8 w-24 rounded-md border border-input bg-transparent px-2 text-right tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        ) : (
          money(secured, currency)
        )}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {canEdit ? (
          <input
            type="number"
            min="0"
            step="0.01"
            aria-label={`Amount spent for ${item.label}`}
            disabled={disabled}
            value={spent}
            onChange={(e) => setSpent(e.target.value)}
            className="h-8 w-24 rounded-md border border-input bg-transparent px-2 text-right tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        ) : (
          money(spent, currency)
        )}
      </td>
      {canEdit ? (
        <td className="px-2 py-2">
          <div className="flex items-center justify-end gap-1">
            {dirty ? (
              <Button
                size="sm"
                disabled={disabled || !label.trim()}
                onClick={() =>
                  onSave({
                    label: label.trim(),
                    ...(item.category === "custom" ? { unit } : {}),
                    unitPrice: Number(unitPrice) || 0,
                    ...(item.isAutoQuantity ? {} : { quantity: Number(quantity) || 0 }),
                    amountSecured: Number(secured) || 0,
                    amountSpent: Number(spent) || 0,
                  })
                }
              >
                Save
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Delete ${item.label}`}
              disabled={disabled}
              onClick={async () => {
                if ((await confirmDialog(`Delete the "${item.label}" line?`))) onDelete();
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        </td>
      ) : null}
    </tr>
  );
}

function MobileBudgetRow({
  item,
  currency,
  canEdit,
  disabled,
  saving,
  retryEdit,
  projectWordCountControl,
  onSave,
  onReset,
  onDelete,
}: {
  item: BudgetLineDTO;
  currency: string;
  canEdit: boolean;
  disabled: boolean;
  saving: boolean;
  retryEdit?: BudgetLineEdit;
  projectWordCountControl?: ProjectWordCountControl;
  onSave: (fields: BudgetLineEdit) => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(retryEdit?.label ?? item.label);
  const [unit, setUnit] = useState(retryEdit?.unit ?? item.unit);
  const [unitPrice, setUnitPrice] = useState(
    String(retryEdit?.unitPrice ?? item.unitPrice)
  );
  const [quantity, setQuantity] = useState(
    String(retryEdit?.quantity ?? item.quantity)
  );
  const [secured, setSecured] = useState(
    String(retryEdit?.amountSecured ?? item.amountSecured)
  );
  const [spent, setSpent] = useState(
    String(retryEdit?.amountSpent ?? item.amountSpent)
  );

  const dirty =
    label !== item.label ||
    (item.category === "custom" && unit !== item.unit) ||
    unitPrice !== item.unitPrice ||
    (!item.isAutoQuantity && quantity !== item.quantity) ||
    secured !== item.amountSecured ||
    spent !== item.amountSpent;
  const previewAmount = lineAmount(
    item.isAutoQuantity ? item.quantity : quantity,
    unitPrice,
  );
  const isStandard = item.category !== "custom";

  return (
    <div className="space-y-3 px-3 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        {canEdit ? (
          <div className="min-w-0 flex-1 space-y-1">
            <Input
              value={label}
              aria-label={`Label for ${item.label}`}
              disabled={disabled}
              onChange={(event) => setLabel(event.target.value)}
              className="font-medium"
            />
            {saving ? (
              <p className="text-[11px] text-muted-foreground">Saving…</p>
            ) : null}
          </div>
        ) : (
          <p className="min-w-0 font-medium leading-snug text-pretty">
            {item.label}
          </p>
        )}
        {canEdit ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Delete ${item.label}`}
            disabled={disabled}
            onClick={async () => {
              if ((await confirmDialog(`Delete the "${item.label}" line?`))) onDelete();
            }}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Qty">
          {item.isAutoQuantity &&
          item.unit === "words" &&
          projectWordCountControl ? (
            <ProjectWordCountInput
              itemLabel={item.label}
              control={projectWordCountControl}
              className="w-full"
            />
          ) : item.isAutoQuantity || !canEdit ? (
            <span
              className={cn(
                "flex h-8 items-center rounded-lg border border-transparent px-2.5 tabular-nums",
                item.isAutoQuantity && "text-muted-foreground",
              )}
            >
              {Number(item.isAutoQuantity ? item.quantity : quantity).toLocaleString()}
            </span>
          ) : (
            <Input
              type="number"
              min="0"
              step="1"
              aria-label={`Quantity for ${item.label}`}
              disabled={disabled}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="tabular-nums"
            />
          )}
        </Field>
        <Field label="Unit">
          {canEdit && item.category === "custom" ? (
            <select
              value={unit}
              aria-label={`Unit for ${item.label}`}
              disabled={disabled}
              onChange={(event) => setUnit(event.target.value as BudgetUnit)}
              className={cn(selectClass, "w-full")}
            >
              {Object.entries(UNIT_LABEL).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          ) : (
            <span className="flex h-8 items-center rounded-lg border border-transparent px-2.5 text-muted-foreground">
              {UNIT_LABEL[item.unit]}
            </span>
          )}
        </Field>
        <Field label="Unit price">
          {canEdit ? (
            <Input
              type="number"
              min="0"
              step="0.01"
              aria-label={`Unit price for ${item.label}`}
              disabled={disabled}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="tabular-nums"
            />
          ) : (
            <span className="flex h-8 items-center rounded-lg border border-transparent px-2.5 tabular-nums">
              {money(unitPrice, currency)}
            </span>
          )}
        </Field>
        <Field label="Funding assigned">
          {canEdit ? (
            <Input
              type="number"
              min="0"
              step="0.01"
              aria-label={`Funding assigned to ${item.label}`}
              disabled={disabled}
              value={secured}
              onChange={(e) => setSecured(e.target.value)}
              className="tabular-nums"
            />
          ) : (
            <span className="flex h-8 items-center rounded-lg border border-transparent px-2.5 tabular-nums">
              {money(secured, currency)}
            </span>
          )}
        </Field>
        <Field label="Spent">
          {canEdit ? (
            <Input
              type="number"
              min="0"
              step="0.01"
              aria-label={`Amount spent for ${item.label}`}
              disabled={disabled}
              value={spent}
              onChange={(e) => setSpent(e.target.value)}
              className="tabular-nums"
            />
          ) : (
            <span className="flex h-8 items-center rounded-lg border border-transparent px-2.5 tabular-nums">
              {money(spent, currency)}
            </span>
          )}
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <div>
          <p className="text-xs text-muted-foreground">Amount</p>
          <p className="font-semibold tabular-nums">
            {money(previewAmount, currency)}
          </p>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-1">
            {dirty ? (
              <Button
                size="sm"
                disabled={disabled || !label.trim()}
                onClick={() =>
                  onSave({
                    label: label.trim(),
                    ...(item.category === "custom" ? { unit } : {}),
                    unitPrice: Number(unitPrice) || 0,
                    ...(item.isAutoQuantity
                      ? {}
                      : { quantity: Number(quantity) || 0 }),
                    amountSecured: Number(secured) || 0,
                    amountSpent: Number(spent) || 0,
                  })
                }
              >
                Save
              </Button>
            ) : null}
            {isStandard ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Reset ${item.label} to default rate`}
                disabled={disabled}
                onClick={onReset}
              >
                <RotateCcw className="size-3" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NewPartnerForm({
  disabled,
  onCancel,
  onCreate,
}: {
  disabled: boolean;
  onCancel: () => void;
  onCreate: (values: {
    org: string;
    first: string;
    last: string;
    email: string;
  }) => void;
}) {
  const [org, setOrg] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <p className="text-xs font-medium">New funding partner</p>
      <Input
        value={org}
        onChange={(e) => setOrg(e.target.value)}
        placeholder="Organization / sponsor name"
        autoFocus
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          placeholder="Contact first name"
        />
        <Input
          value={last}
          onChange={(e) => setLast(e.target.value)}
          placeholder="Last name"
        />
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || !org.trim()}
          onClick={() =>
            onCreate({
              org: org.trim(),
              first: first.trim(),
              last: last.trim(),
              email: email.trim(),
            })
          }
        >
          {disabled ? "Adding…" : "Add & use"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Saved to the Partners directory.
        </span>
      </div>
    </div>
  );
}

function SettingsCard({
  settings,
  disabled,
  onSave,
}: {
  settings: BudgetSettingsDTO;
  disabled: boolean;
  onSave: (fields: Record<string, string>) => void;
}) {
  const [wordCount, setWordCount] = usePropState(String(settings.wordCount));
  const [sourcePageCount, setSourcePageCount] = useState(
    String(settings.sourcePageCount)
  );
  const [wordsPerPage, setWordsPerPage] = useState(String(settings.wordsPerPage));
  const [currency, setCurrency] = useState(settings.currency);
  const [workDescription, setWorkDescription] = useState(
    settings.workDescription ?? ""
  );

  const rateFields = [
    ["rateTranslation", "Translation /word"],
    ["rateProofreading", "Proofreading /word"],
    ["rateEditing", "Editing /word"],
    ["rateCoverDesign", "Cover design"],
    ["rateTypesetting", "Typesetting /page"],
    ["rateProjectManagement", "Project mgmt"],
    ["ratePrintShip", "Print / ship"],
    ["rateAudiobook", "Audiobook /word"],
    ["rateVideoSeries", "Video series /word"],
  ] as const;
  const [rates, setRates] = useState<Record<string, string>>(
    Object.fromEntries(rateFields.map(([k]) => [k, settings[k]]))
  );

  // Keep the collapsed summary aligned with the visible quotation inputs so a
  // manager can sanity-check the drivers without opening the panel.
  const summaryParts = [
    `${settings.wordCount.toLocaleString()} words`,
    settings.sourcePageCount > 0
      ? `${settings.sourcePageCount.toLocaleString()} source-language pages`
      : null,
    settings.currency,
  ].filter(Boolean) as string[];

  return (
    <Card>
      <CardContent className="p-0">
        <details className="group">
          <summary
            className={cn(
              "flex list-none cursor-pointer items-center gap-3 rounded-xl px-4 py-3",
              "outline-none transition-colors hover:bg-muted/40",
              "focus-visible:ring-2 focus-visible:ring-ring/50"
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
              <SlidersHorizontal className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="select-none text-sm font-medium">
                  Quotation settings
                </span>
                <HelpTip
                  iconClassName="size-3"
                  title="What these control"
                  side="bottom"
                  align="start"
                >
                  These inputs drive the whole quote. The word count re-costs
                  every word-driven line automatically, currency formats all
                  amounts, and the default rates are applied when you seed or
                  reset a line.
                </HelpTip>
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground group-open:hidden">
                {summaryParts.join("  ·  ")}
              </span>
              <span className="mt-0.5 hidden text-xs text-muted-foreground group-open:block">
                Edit the inputs behind this quote, then save.
              </span>
            </span>
            <span className="shrink-0 text-xs font-medium text-muted-foreground group-hover:text-foreground">
              <span className="hidden sm:inline group-open:sm:hidden">Edit</span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>

          <div className="space-y-5 px-4 pb-4">
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Quote drivers
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Word count">
                <Input
                  type="number"
                  min="0"
                  value={wordCount}
                  onChange={(e) => setWordCount(e.target.value)}
                  className="tabular-nums"
                />
              </Field>
              <Field
                label="English page count"
                help="If known, this drives the target-language typesetting estimate: source pages × the expansion factor from Print settings."
              >
                <Input
                  type="number"
                  min="0"
                  value={sourcePageCount}
                  onChange={(e) => setSourcePageCount(e.target.value)}
                  className="tabular-nums"
                />
              </Field>
              <Field
                label="Words per page"
                help="Fallback only when source page count is blank: target pages = words × expansion factor ÷ words per page."
              >
                <Input
                  type="number"
                  min="1"
                  value={wordsPerPage}
                  onChange={(e) => setWordsPerPage(e.target.value)}
                  className="tabular-nums"
                />
              </Field>
              <Field label="Currency">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className={cn(selectClass, "w-full")}
                >
                  <option>USD</option>
                  <option>KHR</option>
                  <option>EUR</option>
                  <option>GBP</option>
                </select>
                </Field>
              </div>
            </div>

            <div className="space-y-3">
              <Field
                label="Description of work"
                help="Describe the deliverable and format — e.g. “translated and published in the target language”. Shown on the quotation; defaults to the project title if left blank."
              >
                <textarea
                  value={workDescription}
                  onChange={(e) => setWorkDescription(e.target.value)}
                  rows={2}
                  placeholder="e.g. Translated and published in the target language"
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </Field>
            </div>

            <details className="group/rates rounded-lg border bg-muted/20 px-3 py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium">
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/rates:rotate-180" />
                Default rates
                <span className="text-xs font-normal text-muted-foreground">
                  used when seeding and resetting lines
                </span>
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {rateFields.map(([k, label]) => (
                  <Field key={k} label={label}>
                    <Input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={rates[k]}
                      onChange={(e) =>
                        setRates((r) => ({ ...r, [k]: e.target.value }))
                      }
                      className="tabular-nums"
                    />
                  </Field>
                ))}
              </div>
            </details>

            <div className="flex justify-end">
              <Button
                disabled={disabled}
                onClick={() =>
                  onSave({
                    wordCount,
                    sourcePageCount,
                    wordsPerPage,
                    currency,
                    workDescription,
                    ...rates,
                  })
                }
              >
                Save settings
              </Button>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function AddCustomLine({
  triggerLabel = "Add custom line",
  primaryGroupLabel,
  initialFields,
  onDismiss,
  onAdd,
}: {
  triggerLabel?: string;
  primaryGroupLabel: string;
  initialFields?: CustomBudgetLineDraft;
  onDismiss?: () => void;
  onAdd: (fields: CustomBudgetLineDraft) => void;
}) {
  const [open, setOpen] = useState(Boolean(initialFields));
  const [group, setGroup] = useState<"book_publishing" | "additional_media">(
    initialFields?.group ?? "book_publishing"
  );
  const [label, setLabel] = useState(initialFields?.label ?? "");
  const [unit, setUnit] = useState<BudgetUnit>(
    initialFields?.unit ?? "flat"
  );
  const [quantity, setQuantity] = useState(
    String(initialFields?.quantity ?? 1)
  );
  const [unitPrice, setUnitPrice] = useState(
    String(initialFields?.unitPrice ?? 0)
  );

  function dismiss() {
    setOpen(false);
    setGroup("book_publishing");
    setLabel("");
    setUnit("flat");
    setQuantity("1");
    setUnitPrice("0");
    onDismiss?.();
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3.5" /> {triggerLabel}
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="text-sm font-medium">Add custom line</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Group">
            <select
              value={group}
              onChange={(e) =>
                setGroup(e.target.value as "book_publishing" | "additional_media")
              }
              className={cn(selectClass, "w-full")}
            >
              <option value="book_publishing">{primaryGroupLabel}</option>
              <option value="additional_media">Additional Media</option>
            </select>
          </Field>
          <Field label="Label">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Shipping insurance"
            />
          </Field>
          <Field label="Unit">
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as BudgetUnit)}
              className={cn(selectClass, "w-full")}
            >
              <option value="flat">flat</option>
              <option value="words">words</option>
              <option value="pages">pages</option>
              <option value="cover">cover</option>
              <option value="project">project</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity">
              <Input
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="tabular-nums"
              />
            </Field>
            <Field label="Unit price">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="tabular-nums"
              />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!label.trim()}
            onClick={() => {
              onAdd({
                group,
                label: label.trim(),
                unit,
                quantity: Number(quantity) || 0,
                unitPrice: Number(unitPrice) || 0,
              });
              setLabel("");
              setQuantity("1");
              setUnitPrice("0");
              setOpen(false);
            }}
          >
            Add line
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {help ? (
          <HelpTip iconClassName="size-3" label={`About ${label}`}>
            {help}
          </HelpTip>
        ) : null}
      </Label>
      {children}
    </div>
  );
}
