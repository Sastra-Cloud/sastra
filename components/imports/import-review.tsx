"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Layers3,
  Loader2,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  applyImportedInvoice,
  applyImportToProject,
  attachAgreementToProjects,
  commitImport,
  getImportStatus,
  startParse,
  updateImportDraft,
  type BudgetMode,
  type CommitDecision,
} from "@/lib/imports/actions";
import type {
  ExtractedBudgetLine,
  ExtractedMouPayment,
  ExtractedObligation,
  ExtractedProject,
  ImportExtraction,
} from "@/lib/imports/types";
import { matchGrantProjects, matchProjects } from "@/lib/imports/match";
import {
  sharedMouAllocationsReconcile,
  shouldCreateSharedMouGroup,
} from "@/lib/imports/payments";
import { isEpisodicKind, projectUnitTerms } from "@/lib/projects/kinds";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES: ExtractedBudgetLine["category"][] = [
  "translation",
  "proofreading",
  "editing",
  "cover_design",
  "typesetting",
  "project_management",
  "print_ship",
  "audiobook",
  "video_series",
  "custom",
];
const UNITS: ExtractedBudgetLine["unit"][] = [
  "words",
  "pages",
  "cover",
  "project",
  "flat",
];
const MOU_TRIGGERS: ExtractedMouPayment["trigger"][] = [
  "on_signing",
  "on_completion",
  "on_52_episodes",
  "custom",
];
const PROJECT_KINDS = [
  "book",
  "article",
  "podcast",
  "video_series",
  "other",
] as const;
const OBLIGATION_KINDS = [
  "attribution",
  "copyright_notice",
  "artwork_approval",
  "analytics_report",
  "format_restriction",
  "territory_restriction",
  "sample_delivery",
  "other",
] as const;
const OBLIGATION_CADENCES = [
  "per_episode",
  "per_artwork",
  "monthly",
  "quarterly",
  "annual",
  "standing",
  "on_publish",
] as const;

const selectClass =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring";

// Persistent micro-label above a compact field (placeholders vanish once the
// field is filled, so extracted values would otherwise be unlabeled).
const fieldLabelClass =
  "px-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground";

/** Existing-project context passed when the import is in update mode. */
export type UpdateTarget = {
  projectId: string;
  slug: string;
  title: string;
  budgetLineCount: number;
  budgetTotal: string;
  rightsStatus: string;
  preferredPaymentId: string | null;
  payments: Array<{
    id: string;
    amount: string;
    currency: string;
    dueDate: string | null;
    notes: string | null;
    paidAt: string | null;
    invoiceNumber: string | null;
  }>;
};

/** Existing projects (create mode) — used to detect duplicate works and to
 *  offer attaching a grant/MoU to the projects a proposal already created. */
export type ExistingProject = {
  id: string;
  title: string;
  slug: string;
  partnerName: string | null;
  budgetTotalCents: number;
};

export function ImportReview({
  importId,
  fileName,
  status: initialStatus,
  error: initialError,
  initial,
  committedProjectIds,
  target,
  existingProjects = [],
}: {
  importId: string;
  fileName: string | null;
  status: string;
  error: string | null;
  initial: ImportExtraction | null;
  committedProjectIds: string[];
  target?: UpdateTarget | null;
  existingProjects?: ExistingProject[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState(initialError);
  const [data, setData] = useState<ImportExtraction | null>(initial);
  const [retrying, setRetrying] = useState(false);

  // Parsing runs server-side (via after()); poll until it lands. Because the
  // work is detached from this request, leaving and returning resumes cleanly.
  useEffect(() => {
    if (status !== "uploaded" && status !== "parsing") return;
    let active = true;
    if (status === "uploaded") void startParse(importId);
    const iv = setInterval(async () => {
      const res = await getImportStatus(importId);
      if (!active) return;
      if (res.status === "extracted") {
        setData(res.extraction);
        setStatus("extracted");
      } else if (res.status === "failed") {
        setStatus("failed");
        setError(res.error);
      } else {
        setStatus(res.status);
      }
    }, 3000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [status, importId]);

  // Re-run the AI extraction from the review screen (overwrites the draft).
  async function reextract() {
    const res = await startParse(importId, { force: true });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setData(null);
    setError(null);
    setStatus("parsing");
  }

  if (status === "committed") {
    const href = target ? `/projects/${target.slug}` : "/projects";
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <CheckCircle2 className="size-9 text-success" />
          <div>
            <p className="font-medium">
              {target
                ? `Updated ${target.title}`
                : `Created ${committedProjectIds.length} project${
                    committedProjectIds.length === 1 ? "" : "s"
                  }`}
            </p>
            <p className="text-sm text-muted-foreground">
              {fileName ?? "This document"} has been imported.
            </p>
          </div>
          <Link href={href} className={buttonVariants()}>
            {target ? "Open project" : "View projects"}
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (status === "extracted" && data) {
    return target ? (
      data.documentKind === "invoice" && data.invoice ? (
        <InvoiceReviewForm
          importId={importId}
          fileName={fileName}
          target={target}
          initial={data}
          onReextract={reextract}
        />
      ) : (
        <UpdateReviewForm
          importId={importId}
          fileName={fileName}
          target={target}
          initial={data}
          onReextract={reextract}
          onApplied={() => router.push(`/projects/${target.slug}`)}
        />
      )
    ) : (
      <ReviewForm
        importId={importId}
        fileName={fileName}
        initial={data}
        existingProjects={existingProjects}
        onReextract={reextract}
        onCommitted={() => router.push("/projects")}
      />
    );
  }

  // uploaded / parsing / failed → server-side parse in progress.
  async function retry() {
    setRetrying(true);
    const res = await startParse(importId);
    setRetrying(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setError(null);
    setStatus("parsing");
  }
  const failed = status === "failed";
  return (
    <Card>
      <CardContent
        className="flex flex-col items-center gap-4 py-12 text-center"
        role="status"
        aria-live="polite"
      >
        <span
          aria-hidden="true"
          className={`flex size-12 items-center justify-center rounded-full ${
            failed ? "bg-destructive/10" : "bg-info/10"
          }`}
        >
          {failed ? (
            <AlertTriangle className="size-6 text-destructive" />
          ) : (
            <Loader2 className="size-6 animate-spin text-info" />
          )}
        </span>

        <div className="space-y-2">
          <p className="font-medium">
            {failed ? "We couldn’t read this document" : "Reading your document"}
          </p>
          {fileName ? (
            <span className="mx-auto inline-flex max-w-72 items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
              <FileText className="size-3.5 shrink-0" />
              <span className="truncate">{fileName}</span>
            </span>
          ) : null}
        </div>

        {failed ? (
          <>
            <p className="max-w-sm text-sm text-destructive">
              {error ??
                "Something went wrong while extracting the details. Your upload is saved — try again."}
            </p>
            <Button onClick={retry} disabled={retrying}>
              {retrying ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Retrying…
                </>
              ) : (
                "Try again"
              )}
            </Button>
          </>
        ) : (
          <>
            <p className="max-w-sm text-sm text-muted-foreground">
              Pulling out the projects, budget, and rights — usually under a
              minute. You can leave this page; we’ll save the result and it’ll be
              waiting when you’re back.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={retry}
              disabled={retrying}
              className="text-muted-foreground"
            >
              {retrying ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Re-running…
                </>
              ) : (
                "Taking longer than expected? Re-run"
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Shared pieces ────────────────────────────────────────────────────────────

const numOrNull = (v: string): number | null => (v === "" ? null : Number(v));

const centsToUsd = (cents: number): string =>
  `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Document-level fields (partner, agreement type, contact, signed date). */
function DocFields({
  doc,
  onChange,
}: {
  doc: ImportExtraction;
  onChange: (patch: Partial<ImportExtraction>) => void;
}) {
  return (
    <Card>
      <CardContent className="grid gap-4 py-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>Partner / rights holder</Label>
          <Input
            value={doc.partnerOrg ?? ""}
            onChange={(e) => onChange({ partnerOrg: e.target.value || null })}
            placeholder="e.g. Desiring God"
          />
        </div>
        <div className="grid gap-1">
          <Label>Agreement type</Label>
          <select
            className={selectClass}
            value={doc.agreementType}
            onChange={(e) =>
              onChange({
                agreementType: e.target
                  .value as ImportExtraction["agreementType"],
              })
            }
          >
            <option value="mou_only">MoU only</option>
            <option value="mou_plus_license">MoU + license</option>
            <option value="license_only">License only</option>
          </select>
        </div>
        <div className="grid gap-1">
          <Label>Contact name</Label>
          <Input
            value={doc.contactName ?? ""}
            onChange={(e) => onChange({ contactName: e.target.value || null })}
          />
        </div>
        <div className="grid gap-1">
          <Label>Contact email</Label>
          <Input
            value={doc.contactEmail ?? ""}
            onChange={(e) => onChange({ contactEmail: e.target.value || null })}
          />
        </div>
        <div className="grid gap-1">
          <Label>Signed date</Label>
          <Input
            type="date"
            value={doc.signedDate ?? ""}
            onChange={(e) => onChange({ signedDate: e.target.value || null })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function AgreementPaymentsEditor({
  doc,
  onChange,
  eligibleProjectIndices,
  fixedOwnerLabel,
}: {
  doc: ImportExtraction;
  onChange: (patch: Partial<ImportExtraction>) => void;
  eligibleProjectIndices: number[];
  fixedOwnerLabel?: string;
}) {
  const payments = doc.mouPaymentSchedule;
  const completionDate = eligibleProjectIndices
    .map((index) => doc.projects[index]?.publicationDate)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);
  const projectSubtotal = eligibleProjectIndices.reduce(
    (sum, index) => sum + (doc.projects[index]?.totalAmount ?? 0),
    0
  );
  const projectCurrencies = Array.from(
    new Set(
      eligibleProjectIndices.map(
        (index) => doc.projects[index]?.currency?.trim().toUpperCase() || "USD"
      )
    )
  );
  const agreementCurrency =
    projectCurrencies.length === 1 ? projectCurrencies[0] : "USD";
  const totalsDiffer =
    doc.agreementTotalAmount != null &&
    projectSubtotal > 0 &&
    Math.abs(doc.agreementTotalAmount - projectSubtotal) > 0.005;
  const sharedCompletionGroup = shouldCreateSharedMouGroup(
    doc,
    eligibleProjectIndices
  );
  const proposedGroupName =
    doc.documentTitle?.trim() ||
    [
      doc.signedDate ? `FY${doc.signedDate.slice(2, 4)}` : null,
      doc.partnerOrg,
      "MoU",
    ]
      .filter(Boolean)
      .join(" ") ||
    "Shared MoU";
  const setPayment = (
    index: number,
    patch: Partial<ExtractedMouPayment>
  ) =>
    onChange({
      mouPaymentSchedule: payments.map((payment, paymentIndex) =>
        paymentIndex === index ? { ...payment, ...patch } : payment
      ),
    });
  const configuredOwnerIsEligible =
    doc.paymentProjectIndex != null &&
    eligibleProjectIndices.includes(doc.paymentProjectIndex);
  const effectiveOwnerIndex = configuredOwnerIsEligible
    ? doc.paymentProjectIndex
    : eligibleProjectIndices.length === 1
      ? eligibleProjectIndices[0]
      : null;

  // Agreements often describe the same payment in more than one clause, so the
  // AI can extract it twice. Flag rows that share a trigger, amount, and date so
  // the reviewer removes the real duplicate before it inflates committed funding.
  const resolvedDue = (payment: ExtractedMouPayment): string =>
    payment.dueDate ??
    (payment.trigger === "on_signing"
      ? doc.signedDate
      : payment.trigger === "on_completion" && !sharedCompletionGroup
        ? completionDate
        : null) ??
    "";
  const dupKey = (payment: ExtractedMouPayment): string | null =>
    payment.amount != null
      ? `${payment.trigger}|${payment.amount}|${resolvedDue(payment)}`
      : null;
  const dupCounts = new Map<string, number>();
  for (const payment of payments) {
    const key = dupKey(payment);
    if (key) dupCounts.set(key, (dupCounts.get(key) ?? 0) + 1);
  }
  const hasDuplicates = [...dupCounts.values()].some((count) => count > 1);
  const isDuplicate = (payment: ExtractedMouPayment): boolean => {
    const key = dupKey(payment);
    return key != null && (dupCounts.get(key) ?? 0) > 1;
  };

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div>
          <h2 className="font-medium">Agreement payment schedule</h2>
          <p className="text-xs text-muted-foreground">
            Shared payments are stored once and linked to every selected project.
            Completion payments wait until all linked projects are complete.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label>Agreement total ({agreementCurrency})</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={doc.agreementTotalAmount ?? ""}
              onChange={(event) =>
                onChange({
                  agreementTotalAmount: numOrNull(event.target.value),
                })
              }
              placeholder="Total across all projects"
            />
          </div>
          {!sharedCompletionGroup ? (
          <div className="grid gap-1">
            <Label>Single-project schedule</Label>
            {fixedOwnerLabel ? (
              <div className="flex h-9 items-center rounded-md border px-3 text-sm">
                {fixedOwnerLabel}
              </div>
            ) : (
              <select
                className={selectClass + " h-9"}
                value={effectiveOwnerIndex ?? ""}
                onChange={(event) =>
                  onChange({
                    paymentProjectIndex:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
                aria-label="Project that administers agreement payments"
              >
                <option value="">Choose a selected project</option>
                {eligibleProjectIndices.map((index) => (
                  <option key={index} value={index}>
                    {doc.projects[index]?.title ?? `Project ${index + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>
          ) : null}
        </div>
        {sharedCompletionGroup ? (
          <div className="space-y-3 rounded-lg border border-info/30 bg-info/5 p-3">
            <div className="flex items-start gap-2">
              <Layers3 className="mt-0.5 size-4 shrink-0 text-info" />
              <div>
                <p className="font-medium">Shared completion group</p>
                <p className="text-xs text-muted-foreground">
                  {proposedGroupName} becomes the authoritative home for this
                  schedule. Completion payments unlock only when every covered
                  project is completed and its earliest invoice date has arrived.
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {eligibleProjectIndices.map((index) => {
                const project = doc.projects[index];
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between gap-3 rounded-md border bg-background/70 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{project?.title}</span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {agreementCurrency} {(project?.totalAmount ?? 0).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        <p
          className={
            totalsDiffer
              ? "text-xs font-medium text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          Selected project subtotals: {agreementCurrency}{" "}
          {projectSubtotal.toLocaleString()}
          {totalsDiffer
            ? " — this does not match the agreement total. Review the project amounts before committing."
            : ""}
        </p>
        {payments.length > 0 &&
        !sharedCompletionGroup &&
        !fixedOwnerLabel &&
        effectiveOwnerIndex == null ? (
          <p className="text-xs font-medium text-destructive">
            Choose one selected project to administer this shared schedule.
          </p>
        ) : null}
        {hasDuplicates ? (
          <p className="flex items-center gap-1.5 rounded-md border border-warning/50 bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-warning-foreground">
            <AlertTriangle className="size-3.5 shrink-0" />
            Two or more payments look identical. Agreements sometimes describe the
            same payment in more than one clause — remove any real duplicate
            before saving, so funding isn&apos;t counted twice.
          </p>
        ) : null}
        <div className="space-y-2">
          {payments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No payments extracted.</p>
          ) : (
            payments.map((payment, index) => (
              <div
                key={index}
                className={`flex flex-wrap items-end gap-2 rounded-md border p-2 ${
                  isDuplicate(payment) ? "border-warning/60 bg-warning/5" : ""
                }`}
              >
                {isDuplicate(payment) ? (
                  <p className="flex w-full items-center gap-1.5 text-xs font-medium text-warning-foreground">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    Possible duplicate — same amount, trigger, and date as another
                    row. Remove one if it is the same payment.
                  </p>
                ) : null}
                <div className="grid gap-1">
                  <span className={fieldLabelClass}>Trigger</span>
                  <select
                    className={selectClass}
                    value={payment.trigger}
                    onChange={(event) =>
                      setPayment(index, {
                        trigger: event.target
                          .value as ExtractedMouPayment["trigger"],
                      })
                    }
                  >
                    {MOU_TRIGGERS.map((trigger) => (
                      <option key={trigger} value={trigger}>
                        {trigger.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <span className={fieldLabelClass}>Amount ({agreementCurrency})</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payment.amount ?? ""}
                    onChange={(event) =>
                      setPayment(index, {
                        amount: numOrNull(event.target.value),
                      })
                    }
                    className="h-8 w-28"
                  />
                </div>
                <div className="grid gap-1">
                  <span className={fieldLabelClass}>Expected date</span>
                  <Input
                    type="date"
                    value={
                      payment.dueDate ??
                      (payment.trigger === "on_signing"
                        ? doc.signedDate
                        : payment.trigger === "on_completion" &&
                            !sharedCompletionGroup
                          ? completionDate
                          : null) ??
                      ""
                    }
                    onChange={(event) =>
                      setPayment(index, {
                        dueDate: event.target.value || null,
                      })
                    }
                    className="h-8 w-40"
                  />
                </div>
                <div className="grid min-w-52 flex-1 gap-1">
                  <span className={fieldLabelClass}>Notes</span>
                  <Input
                    value={payment.notes ?? ""}
                    onChange={(event) =>
                      setPayment(index, {
                        notes: event.target.value || null,
                      })
                    }
                    className="h-8"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove agreement payment"
                  onClick={() =>
                    onChange({
                      mouPaymentSchedule: payments.filter(
                        (_, paymentIndex) => paymentIndex !== index
                      ),
                    })
                  }
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() =>
            onChange({
              mouPaymentSchedule: [
                ...payments,
                {
                  trigger: "custom",
                  amount: null,
                  dueDate: null,
                  notes: null,
                },
              ],
            })
          }
        >
          <Plus className="size-3.5" />
          Add payment
        </Button>
      </CardContent>
    </Card>
  );
}

/** The editable body for one extracted work (details + budget lines). */
function ProjectEditor({
  project: p,
  onChange,
}: {
  project: ExtractedProject;
  onChange: (next: ExtractedProject) => void;
}) {
  const set = (patch: Partial<ExtractedProject>) => onChange({ ...p, ...patch });
  const setLine = (li: number, patch: Partial<ExtractedBudgetLine>) =>
    set({
      budgetLines: p.budgetLines.map((l, k) =>
        k === li ? { ...l, ...patch } : l
      ),
    });
  const addLine = () =>
    set({
      budgetLines: [
        ...p.budgetLines,
        {
          label: "New line",
          category: "custom",
          unit: "flat",
          quantity: 1,
          unitPrice: 0,
          amount: 0,
          notes: null,
        },
      ],
    });
  const removeLine = (li: number) =>
    set({ budgetLines: p.budgetLines.filter((_, k) => k !== li) });
  // Flag lines that repeat the same item + amount, so a double-extracted cost is
  // caught in review rather than inflating the quotation.
  const lineDupKey = (line: ExtractedBudgetLine) =>
    `${line.label.trim().toLowerCase()}|${line.amount ?? ""}`;
  const lineDupCounts = new Map<string, number>();
  for (const line of p.budgetLines) {
    const key = lineDupKey(line);
    lineDupCounts.set(key, (lineDupCounts.get(key) ?? 0) + 1);
  }
  const hasDupLines = [...lineDupCounts.values()].some((count) => count > 1);
  const isDupLine = (line: ExtractedBudgetLine) =>
    (lineDupCounts.get(lineDupKey(line)) ?? 0) > 1;
  const obligations = p.obligations ?? [];
  const setObligation = (oi: number, patch: Partial<ExtractedObligation>) =>
    set({
      obligations: obligations.map((o, k) =>
        k === oi ? { ...o, ...patch } : o
      ),
    });
  const addObligation = () =>
    set({
      obligations: [
        ...obligations,
        {
          clauseRef: null,
          kind: "other",
          cadence: "standing",
          firstDueDate: null,
          label: "",
          text: "",
        },
      ],
    });
  const removeObligation = (oi: number) =>
    set({ obligations: obligations.filter((_, k) => k !== oi) });
  const currency = p.currency?.trim().toUpperCase() || "USD";
  const currencySymbol =
    currency === "GBP"
      ? "£"
      : currency === "EUR"
        ? "€"
        : currency === "USD"
          ? "$"
          : currency;

  return (
    <div className="space-y-4">
      {p.fxConversion ? (
        <div className="rounded-md border border-info/30 bg-info/5 px-3 py-2 text-xs text-muted-foreground">
          Amounts were converted from {p.fxConversion.from} to USD at 1{" "}
          {p.fxConversion.from} = {p.fxConversion.rate} USD using the{" "}
          {p.fxConversion.provider} reference rate dated{" "}
          {p.fxConversion.rateDate}. Original figures remain in each budget line
          note.
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1 sm:col-span-2">
          <Label>Description / scope</Label>
          <Textarea
            rows={2}
            value={p.description ?? ""}
            onChange={(e) => set({ description: e.target.value || null })}
          />
        </div>
        <div className="grid gap-1">
          <Label>Start date</Label>
          <Input
            type="date"
            value={p.startDate ?? ""}
            onChange={(e) => set({ startDate: e.target.value || null })}
          />
        </div>
        <div className="grid gap-1">
          <Label>Publication / due date</Label>
          <Input
            type="date"
            value={p.publicationDate ?? ""}
            onChange={(e) => set({ publicationDate: e.target.value || null })}
          />
        </div>
        <div className="grid gap-1">
          <Label>Word count</Label>
          <Input
            type="number"
            min="0"
            value={p.wordCount ?? ""}
            onChange={(e) => set({ wordCount: numOrNull(e.target.value) })}
          />
        </div>
        <div className="grid gap-1">
          <Label>Project funding subtotal ({currency})</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={p.totalAmount ?? ""}
            onChange={(e) => set({ totalAmount: numOrNull(e.target.value) })}
            placeholder="This work's share of the agreement"
          />
        </div>
        <div className="grid gap-1">
          <Label>Copies (print run)</Label>
          <Input
            type="number"
            min="0"
            value={p.maxCopies ?? ""}
            onChange={(e) => set({ maxCopies: numOrNull(e.target.value) })}
            placeholder="e.g. 1000"
          />
        </div>
        <div className="grid gap-1 sm:col-span-2">
          <Label>License must be secured from (copyright holder)</Label>
          <Input
            value={p.licenseHolder ?? ""}
            onChange={(e) => set({ licenseHolder: e.target.value || null })}
            placeholder="e.g. Union — leave blank if public domain or not needed"
          />
        </div>
        <div className="grid gap-1">
          <Label>Partner progress-update due</Label>
          <Input
            type="date"
            value={p.partnerUpdateDate ?? ""}
            onChange={(e) => set({ partnerUpdateDate: e.target.value || null })}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Format rights granted by this agreement</Label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={p.rightsGrantedByAgreement}
              onChange={(e) =>
                set({
                  rightsGrantedByAgreement: e.target.checked,
                  ...(e.target.checked
                    ? {}
                    : {
                        formats: {
                          print: false,
                          ebook: false,
                          audio: false,
                          video: false,
                        },
                      }),
                })
              }
            />
            This agreement grants usable publishing rights now
          </label>
          <div className="flex flex-wrap items-center gap-4">
            {(["print", "ebook", "audio", "video"] as const).map((f) => (
              <label
                key={f}
                className="flex items-center gap-1.5 text-sm capitalize"
              >
                <input
                  type="checkbox"
                  className="size-4"
                  checked={p.formats[f]}
                  disabled={!p.rightsGrantedByAgreement}
                  onChange={(e) =>
                    set({ formats: { ...p.formats, [f]: e.target.checked } })
                  }
                />
                {f}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Select only formats this document currently permits. Future optional
            commercial rights do not cancel a present non-commercial grant.
          </p>
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={!!p.nonCommercialOnly}
              onChange={(e) => set({ nonCommercialOnly: e.target.checked })}
            />
            Free / non-commercial only (may not be sold)
          </label>
        </div>

        <div className="grid gap-1">
          <Label>License term (months)</Label>
          <Input
            type="number"
            min="0"
            value={p.licenseTermMonths ?? ""}
            onChange={(e) => set({ licenseTermMonths: numOrNull(e.target.value) })}
            placeholder="e.g. 60 (5 years)"
          />
        </div>
        <div className="grid gap-1">
          <Label>Renewal period (months)</Label>
          <Input
            type="number"
            min="0"
            value={p.renewalMonths ?? ""}
            onChange={(e) => set({ renewalMonths: numOrNull(e.target.value) })}
            placeholder="e.g. 12"
          />
        </div>
        <div className="grid gap-1">
          <Label>Renewal notice (days)</Label>
          <Input
            type="number"
            min="0"
            value={p.renewalNoticeDays ?? ""}
            onChange={(e) => set({ renewalNoticeDays: numOrNull(e.target.value) })}
            placeholder="e.g. 60"
          />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={p.autoRenews}
              onChange={(e) => set({ autoRenews: e.target.checked })}
            />
            License auto-renews at end of term
          </label>
        </div>
        <div className="grid gap-1 sm:col-span-2">
          <Label>Copyright holder</Label>
          <Input
            value={p.copyrightHolder ?? ""}
            onChange={(e) => set({ copyrightHolder: e.target.value || null })}
            placeholder="e.g. Crossway"
          />
        </div>
        <div className="grid gap-1 sm:col-span-2">
          <Label>Copyright notice (use when laying out the book)</Label>
          <Textarea
            rows={3}
            value={p.copyrightNotice ?? ""}
            onChange={(e) => set({ copyrightNotice: e.target.value || null })}
            placeholder={"© <year> by <holder>\nPublished by <publisher>…"}
          />
        </div>
        <div className="grid gap-1">
          <Label>Project type</Label>
          <select
            className={selectClass}
            value={p.kind ?? ""}
            onChange={(e) =>
              set({
                kind: (e.target.value || null) as ExtractedProject["kind"],
                videoProductionMode:
                  e.target.value === "video_series"
                    ? p.videoProductionMode ?? "original"
                    : null,
              })
            }
          >
            <option value="">Unset</option>
            {PROJECT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        {p.kind === "video_series" ? (
          <div className="grid gap-1">
            <Label>Video production mode</Label>
            <select
              className={selectClass}
              value={p.videoProductionMode ?? "original"}
              onChange={(event) =>
                set({
                  videoProductionMode:
                    event.target.value === "translation"
                      ? "translation"
                      : "original",
                })
              }
            >
              <option value="original">Original</option>
              <option value="translation">Translation</option>
            </select>
          </div>
        ) : null}
        <div className="grid gap-1">
          <Label>Territory</Label>
          <Input
            value={p.territory ?? ""}
            onChange={(e) => set({ territory: e.target.value || null })}
            placeholder="Country or region the license covers"
          />
        </div>
        {isEpisodicKind(p.kind) ? (
          (() => {
            const terms = projectUnitTerms(p.kind);
            return (
              <>
                <div className="grid gap-1">
                  <Label className="capitalize">{terms.plural}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={p.episodeCount ?? ""}
                    onChange={(e) =>
                      set({ episodeCount: numOrNull(e.target.value) })
                    }
                    placeholder={p.kind === "video_series" ? "e.g. 100" : "e.g. 104"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Created with production tasks on import.
                  </p>
                </div>
                <div className="grid gap-1">
                  <Label className="capitalize">{terms.singular} count means</Label>
                  <select
                    className={selectClass}
                    value={p.episodeCountMode}
                    onChange={(e) =>
                      set({
                        episodeCountMode: e.target
                          .value as ExtractedProject["episodeCountMode"],
                      })
                    }
                  >
                    <option value="total">Total {terms.plural} covered</option>
                    <option value="additional">
                      Additional {terms.plural} to append
                    </option>
                  </select>
                </div>
              </>
            );
          })()
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          License obligations
        </Label>
        {obligations.length === 0 ? (
          <p className="text-xs text-muted-foreground">None extracted.</p>
        ) : (
          <div className="space-y-2">
            {obligations.map((o, oi) => (
              <div key={oi} className="space-y-1.5 rounded-md border p-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Input
                    value={o.clauseRef ?? ""}
                    onChange={(e) =>
                      setObligation(oi, { clauseRef: e.target.value || null })
                    }
                    className="h-8 w-16"
                    placeholder="§"
                  />
                  <Input
                    value={o.label}
                    onChange={(e) =>
                      setObligation(oi, { label: e.target.value })
                    }
                    className="h-8 min-w-40 flex-1"
                    placeholder="Label"
                  />
                  <select
                    className={selectClass}
                    value={o.kind}
                    onChange={(e) =>
                      setObligation(oi, {
                        kind: e.target.value as ExtractedObligation["kind"],
                      })
                    }
                  >
                    {OBLIGATION_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectClass}
                    value={o.cadence}
                    onChange={(e) =>
                      setObligation(oi, {
                        cadence: e.target
                          .value as ExtractedObligation["cadence"],
                      })
                    }
                  >
                    {OBLIGATION_CADENCES.map((c) => (
                      <option key={c} value={c}>
                        {c.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  {(["monthly", "quarterly", "annual"] as string[]).includes(
                    o.cadence
                  ) ? (
                    <Input
                      type="date"
                      value={o.firstDueDate ?? ""}
                      onChange={(e) =>
                        setObligation(oi, {
                          firstDueDate: e.target.value || null,
                        })
                      }
                      className="h-8 w-40"
                      aria-label="First report due date"
                      title="Only set this when the agreement states a specific deadline"
                    />
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Remove obligation"
                    onClick={() => removeObligation(oi)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <Textarea
                  rows={2}
                  value={o.text}
                  onChange={(e) => setObligation(oi, { text: e.target.value })}
                  placeholder="Verbatim contractual language…"
                />
              </div>
            ))}
          </div>
        )}
        <Button type="button" variant="outline" size="xs" onClick={addObligation}>
          <Plus className="size-3.5" />
          Add obligation
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Budget lines</Label>
        {p.budgetLines.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            None extracted.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Each line is a cost/fee: <span className="font-medium">quantity ×
              unit price</span>, with the line total in{" "}
              <span className="font-medium">amount</span>. For a flat fee, leave
              quantity 1 / unit price 0 and put the figure in amount.
            </p>
            {hasDupLines ? (
              <p className="flex items-center gap-1.5 rounded-md border border-warning/50 bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-warning-foreground">
                <AlertTriangle className="size-3.5 shrink-0" />
                Two or more lines have the same item and amount — remove any real
                duplicate before saving.
              </p>
            ) : null}
            {p.budgetLines.map((l, li) => (
              <div
                key={li}
                className={`space-y-1 ${
                  isDupLine(l) ? "rounded-md border border-warning/60 bg-warning/5 p-1.5" : ""
                }`}
              >
                {isDupLine(l) ? (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-warning-foreground">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    Possible duplicate line.
                  </p>
                ) : null}
                <div className="flex items-end gap-1.5">
                  <div className="flex flex-1 flex-wrap items-end gap-1.5">
                    <div className="flex min-w-40 flex-1 flex-col gap-1">
                      <span className={fieldLabelClass}>Item</span>
                      <Input
                        value={l.label}
                        onChange={(e) => setLine(li, { label: e.target.value })}
                        className="h-8 w-full"
                        placeholder="What this covers"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={fieldLabelClass}>Category</span>
                      <select
                        className={selectClass}
                        value={l.category}
                        onChange={(e) =>
                          setLine(li, {
                            category: e.target
                              .value as ExtractedBudgetLine["category"],
                          })
                        }
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={fieldLabelClass}>Unit</span>
                      <select
                        className={selectClass}
                        value={l.unit}
                        onChange={(e) =>
                          setLine(li, {
                            unit: e.target.value as ExtractedBudgetLine["unit"],
                          })
                        }
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={fieldLabelClass}>Qty</span>
                      <Input
                        type="number"
                        value={l.quantity ?? ""}
                        onChange={(e) =>
                          setLine(li, { quantity: numOrNull(e.target.value) })
                        }
                        className="h-8 w-16"
                        aria-label="Quantity"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={fieldLabelClass}>Unit price</span>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          {currencySymbol}
                        </span>
                        <Input
                          type="number"
                          value={l.unitPrice ?? ""}
                          onChange={(e) =>
                            setLine(li, {
                              unitPrice: numOrNull(e.target.value),
                            })
                          }
                          className="h-8 w-24 pl-5"
                          aria-label={`Unit price (${currency})`}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={fieldLabelClass}>Amount</span>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          {currencySymbol}
                        </span>
                        <Input
                          type="number"
                          value={l.amount ?? ""}
                          onChange={(e) =>
                            setLine(li, { amount: numOrNull(e.target.value) })
                          }
                          className="h-8 w-24 pl-5"
                          aria-label={`Amount (${currency} line total)`}
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="mb-0.5 shrink-0"
                    aria-label="Remove line"
                    onClick={() => removeLine(li)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                {l.notes ? (
                  <p className="pl-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {l.notes}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={addLine}
          className="text-muted-foreground"
        >
          <Plus className="size-3.5" />
          Add line
        </Button>
      </div>
    </div>
  );
}

/** Debounced autosave of the reviewed draft. */
function useAutosave(importId: string, doc: ImportExtraction) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => void updateImportDraft(importId, doc), 900);
    return () => clearTimeout(t);
  }, [doc, importId]);
}

/** "Re-run AI" — re-extract the document, replacing the current draft. */
function ReextractButton({ onReextract }: { onReextract: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      title="Re-extract this document with AI (replaces the current draft)"
      onClick={async () => {
        setBusy(true);
        await onReextract();
        setBusy(false);
      }}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <RotateCcw className="size-4" />
      )}
      Re-run AI
    </Button>
  );
}

// ── Create mode ──────────────────────────────────────────────────────────────

type Disposition = { mode: "create" } | { mode: "update"; projectId: string };

function ReviewForm({
  importId,
  fileName,
  initial,
  existingProjects,
  onReextract,
  onCommitted,
}: {
  importId: string;
  fileName: string | null;
  initial: ImportExtraction;
  existingProjects: ExistingProject[];
  onReextract: () => Promise<void>;
  onCommitted: () => void;
}) {
  const [doc, setDoc] = useState<ImportExtraction>(initial);
  const [selected, setSelected] = useState<boolean[]>(
    initial.projects.map(() => true)
  );
  // Per-project disposition: create new, or update a matched existing project.
  // Defaults to updating on a strong (exact-title) match so we don't duplicate.
  const [decisions, setDecisions] = useState<Disposition[]>(() =>
    initial.projects.map((p): Disposition => {
      const exact = matchProjects(p.title, existingProjects).find((m) => m.exact);
      return exact ? { mode: "update", projectId: exact.project.id } : { mode: "create" };
    })
  );
  const [committing, setCommitting] = useState(false);
  // A grant application creates several projects (one per budget line-item); the
  // signed umbrella MoU then arrives as ONE project. When its funding partner
  // matches existing projects, offer to attach the agreement to them instead of
  // minting a duplicate. `attachIds === null` means "all matched siblings".
  const [attachMode, setAttachMode] = useState(false);
  const [attachIds, setAttachIds] = useState<string[] | null>(null);
  useAutosave(importId, doc);

  const agreementTotalCents =
    doc.agreementTotalAmount != null
      ? Math.round(doc.agreementTotalAmount * 100)
      : null;
  const grantMatch =
    doc.documentKind !== "invoice"
      ? matchGrantProjects(doc.partnerOrg, agreementTotalCents, existingProjects)
      : null;
  const grantSiblings = grantMatch?.siblings ?? [];
  const effectiveAttachIds = attachIds ?? grantSiblings.map((s) => s.id);

  const setProject = (i: number, next: ExtractedProject) =>
    setDoc((d) => ({
      ...d,
      projects: d.projects.map((p, j) => (j === i ? next : p)),
    }));
  const setDecision = (i: number, d: Disposition) =>
    setDecisions((arr) => arr.map((v, j) => (j === i ? d : v)));

  async function commit() {
    const list: CommitDecision[] = doc.projects
      .map((_, i) => i)
      .filter((i) => selected[i])
      .map((i) => {
        const d = decisions[i];
        return d.mode === "update"
          ? { index: i, mode: "update" as const, projectId: d.projectId }
          : { index: i, mode: "create" as const };
      });
    if (attachMode) {
      if (effectiveAttachIds.length === 0) {
        toast.error("Select at least one existing project to attach to.");
        return;
      }
    } else if (list.length === 0) {
      toast.error("Select at least one project.");
      return;
    }
    setCommitting(true);
    try {
      const saved = await updateImportDraft(importId, doc);
      if (saved.error) {
        toast.error(saved.error);
        setCommitting(false);
        return;
      }
      const res = attachMode
        ? await attachAgreementToProjects(importId, effectiveAttachIds)
        : await commitImport(importId, list);
      if (res?.error) {
        toast.error(res.error);
        setCommitting(false);
        return;
      }
      onCommitted();
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      if (msg.includes("NEXT_REDIRECT")) return; // success path (redirect)
      // A deploy between page-load and submit invalidates this build's server
      // action id, so the POST 404s and throws here. Edits are autosaved, so
      // reload to the fresh build and let the user resubmit. Guard against a
      // reload loop when the failure is a genuine (non-deploy) error.
      const reloadKey = `import-stale-reload-${importId}`;
      if (typeof window !== "undefined" && !sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, "1");
        toast.message("A new version was released — reloading. Your edits are saved.");
        setTimeout(() => window.location.reload(), 1400);
        return;
      }
      toast.error("Could not commit the import. Please reload and try again.");
      setCommitting(false);
    }
  }

  const selectedCount = selected.filter(Boolean).length;
  const selectedIndices = doc.projects
    .map((_, index) => index)
    .filter((index) => selected[index]);
  const paymentOwnerValid =
    doc.mouPaymentSchedule.length === 0 ||
    shouldCreateSharedMouGroup(doc, selectedIndices) ||
    selectedIndices.length === 1 ||
    (doc.paymentProjectIndex != null &&
      selectedIndices.includes(doc.paymentProjectIndex));
  const sharedAllocationsValid = sharedMouAllocationsReconcile(
    doc,
    selectedIndices
  );
  const updateCount = doc.projects.filter(
    (_, i) => selected[i] && decisions[i]?.mode === "update"
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Review the import
          </h1>
          <p className="text-muted-foreground">
            {fileName ? `From ${fileName}. ` : ""}Edit anything below. Nothing is
            created until you commit.
          </p>
        </div>
        <ReextractButton onReextract={onReextract} />
      </div>

      <DocFields doc={doc} onChange={(patch) => setDoc((d) => ({ ...d, ...patch }))} />

      {grantSiblings.length > 0 ? (
        <Card className={attachMode ? "border-info/40 bg-info/5" : "border-info/30"}>
          <CardContent className="space-y-3 py-4">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={attachMode}
                onChange={(e) => setAttachMode(e.target.checked)}
              />
              <span>
                <span className="font-medium">
                  Attach this agreement to {grantSiblings.length} existing{" "}
                  {doc.partnerOrg ? `${doc.partnerOrg} ` : ""}project
                  {grantSiblings.length === 1 ? "" : "s"}
                </span>{" "}
                instead of creating a new one. A grant application usually creates
                these projects first; the signed MoU covers them together as a
                shared MoU (its dates, payment schedule, and obligations apply to
                each).
              </span>
            </label>
            {grantMatch ? (
              <p
                className={
                  grantMatch.matchesTotal
                    ? "pl-6 text-xs font-medium text-success"
                    : "pl-6 text-xs text-muted-foreground"
                }
              >
                Their budgets total {centsToUsd(grantMatch.totalCents)}
                {agreementTotalCents != null
                  ? grantMatch.matchesTotal
                    ? " — matches the agreement total."
                    : ` (agreement total ${centsToUsd(agreementTotalCents)}).`
                  : "."}
              </p>
            ) : null}
            {attachMode ? (
              <div className="space-y-1.5 pl-6">
                {grantSiblings.map((sibling) => {
                  const checked = effectiveAttachIds.includes(sibling.id);
                  return (
                    <label
                      key={sibling.id}
                      className="flex items-center justify-between gap-3 rounded-md border bg-background/60 px-3 py-1.5 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={checked}
                          onChange={(e) => {
                            const base =
                              attachIds ?? grantSiblings.map((x) => x.id);
                            setAttachIds(
                              e.target.checked
                                ? [...new Set([...base, sibling.id])]
                                : base.filter((id) => id !== sibling.id)
                            );
                          }}
                        />
                        <span className="truncate">{sibling.title}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {centsToUsd(sibling.budgetTotalCents ?? 0)}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <h2 className="text-sm font-medium text-muted-foreground">
        {attachMode
          ? `Attaching to ${effectiveAttachIds.length} existing project${
              effectiveAttachIds.length === 1 ? "" : "s"
            } — no new project will be created`
          : `${doc.projects.length} project${
              doc.projects.length === 1 ? "" : "s"
            } found · ${selectedCount} selected${
              updateCount > 0
                ? ` · ${updateCount} will update an existing project`
                : ""
            }`}
      </h2>

      <AgreementPaymentsEditor
        doc={doc}
        eligibleProjectIndices={selectedIndices}
        onChange={(patch) => setDoc((current) => ({ ...current, ...patch }))}
      />

      {attachMode ? (
        <Card className="border-dashed">
          <CardContent className="space-y-3 py-4">
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">No new project will be created</p>
                <p className="text-sm text-muted-foreground">
                  “{doc.projects[0]?.title || "This document"}” is the grant
                  umbrella from the MoU — it won’t be added as a separate project.
                  Its signed date, payment schedule, and the obligations below are
                  applied to the {effectiveAttachIds.length} project
                  {effectiveAttachIds.length === 1 ? "" : "s"} selected above.
                </p>
              </div>
            </div>
            {(doc.projects[0]?.obligations?.length ?? 0) > 0 ? (
              <div className="ml-6 space-y-1.5">
                <p className={fieldLabelClass}>
                  Obligations applied to each project
                </p>
                <ul className="space-y-1">
                  {doc.projects[0]!.obligations.map((o, oi) => (
                    <li key={oi} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                      <span>
                        {o.label}
                        {o.firstDueDate ? ` · due ${o.firstDueDate}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
      <div className="space-y-3">
        {doc.projects.map((p, i) => {
          const dec = decisions[i] ?? { mode: "create" };
          const dupOptions = matchProjects(p.title, existingProjects).map(
            (m) => m.project
          );
          if (
            dec.mode === "update" &&
            !dupOptions.some((o) => o.id === dec.projectId)
          ) {
            const d = existingProjects.find((e) => e.id === dec.projectId);
            if (d) dupOptions.unshift(d);
          }
          return (
            <Card key={i} className={selected[i] ? "" : "opacity-60"}>
              <CardContent className="space-y-4 py-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-2.5 size-4"
                    checked={selected[i]}
                    aria-label={`Include ${p.title}`}
                    onChange={(e) =>
                      setSelected((s) =>
                        s.map((v, j) => (j === i ? e.target.checked : v))
                      )
                    }
                  />
                  <div className="grid flex-1 gap-1">
                    <Label>Project title</Label>
                    <Input
                      value={p.title}
                      onChange={(e) =>
                        setProject(i, { ...p, title: e.target.value })
                      }
                      className="font-medium"
                    />
                  </div>
                </div>

                {dupOptions.length > 0 ? (
                  <div className="ml-7 space-y-1.5 rounded-md border border-warning/40 bg-warning/5 p-2.5">
                    <p className="text-xs font-medium text-warning">
                      Possible duplicate — this work may already be a project.
                    </p>
                    <select
                      className={selectClass + " w-full"}
                      value={dec.mode === "update" ? dec.projectId : "create"}
                      onChange={(e) =>
                        setDecision(
                          i,
                          e.target.value === "create"
                            ? { mode: "create" }
                            : { mode: "update", projectId: e.target.value }
                        )
                      }
                    >
                      <option value="create">Create a new project</option>
                      {dupOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          Update existing: {o.title}
                        </option>
                      ))}
                    </select>
                    {dec.mode === "update" ? (
                      <p className="text-xs text-muted-foreground">
                        Updates that project (budget replaced, rights advanced) —
                        no duplicate created.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <ProjectEditor
                  project={p}
                  onChange={(next) => setProject(i, next)}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
      )}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          onClick={commit}
          disabled={
            committing ||
            (attachMode
              ? effectiveAttachIds.length === 0
              : !paymentOwnerValid || !sharedAllocationsValid)
          }
        >
          {committing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {attachMode ? "Attaching…" : "Committing…"}
            </>
          ) : attachMode ? (
            `Attach to ${effectiveAttachIds.length} project${
              effectiveAttachIds.length === 1 ? "" : "s"
            }`
          ) : updateCount > 0 ? (
            `Commit ${selectedCount} (${selectedCount - updateCount} new, ${updateCount} update)`
          ) : (
            `Commit & create ${selectedCount} project${selectedCount === 1 ? "" : "s"}`
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Update mode ──────────────────────────────────────────────────────────────

function InvoiceReviewForm({
  importId,
  fileName,
  target,
  initial,
  onReextract,
}: {
  importId: string;
  fileName: string | null;
  target: UpdateTarget;
  initial: ImportExtraction;
  onReextract: () => Promise<void>;
}) {
  const invoice = initial.invoice!;
  const exactPayment = target.payments.find(
    (payment) =>
      !payment.paidAt &&
      Number(payment.amount) === Number(invoice.amount) &&
      payment.currency.toUpperCase() ===
        (invoice.currency ?? payment.currency).toUpperCase()
  );
  const initialPaymentId =
    target.payments.some((payment) => payment.id === target.preferredPaymentId)
      ? target.preferredPaymentId!
      : exactPayment?.id ?? target.payments.find((payment) => !payment.paidAt)?.id ?? "";
  const [doc, setDoc] = useState(initial);
  const [paymentId, setPaymentId] = useState(initialPaymentId);
  const [receivedDate, setReceivedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [saving, setSaving] = useState(false);
  useAutosave(importId, doc);

  const current = doc.invoice!;
  const selectedPayment = target.payments.find(
    (payment) => payment.id === paymentId
  );
  const mismatch =
    !!selectedPayment &&
    (Number(selectedPayment.amount) !== Number(current.amount) ||
      selectedPayment.currency.toUpperCase() !==
        (current.currency ?? selectedPayment.currency).toUpperCase());

  const setInvoice = (patch: Partial<NonNullable<ImportExtraction["invoice"]>>) =>
    setDoc((value) => ({
      ...value,
      invoice: value.invoice ? { ...value.invoice, ...patch } : value.invoice,
    }));

  async function save() {
    if (!current.invoiceNumber?.trim() || !current.issueDate || !current.amount) {
      toast.error("Invoice number, issue date, and total are required.");
      return;
    }
    if (!paymentId) {
      toast.error("Choose the scheduled payment this invoice settles.");
      return;
    }
    setSaving(true);
    try {
      const saved = await updateImportDraft(importId, doc);
      if (saved.error) throw new Error(saved.error);
      const result = await applyImportedInvoice(importId, {
        paymentId,
        invoiceNumber: current.invoiceNumber,
        issueDate: current.issueDate,
        dueDate: current.dueDate,
        recipientName: current.recipientName,
        recipientEmail: current.recipientEmail,
        amount: current.amount,
        currency: current.currency ?? selectedPayment?.currency ?? "USD",
        description:
          current.description ?? current.projectTitle ?? `Invoice for ${target.title}`,
        receivedDate,
      });
      if (result?.error) throw new Error(result.error);
    } catch (error) {
      if ((error as Error)?.message?.includes("NEXT_REDIRECT")) return;
      toast.error(error instanceof Error ? error.message : "Could not save the invoice.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Review paid invoice
          </h1>
          <p className="text-muted-foreground">
            {fileName ? `From ${fileName}. ` : ""}Confirm the AI extraction before
            recording money received for {target.title}.
          </p>
        </div>
        <ReextractButton onReextract={onReextract} />
      </div>

      <Card>
        <CardContent className="grid gap-4 py-4 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label>Invoice direction</Label>
            <select
              className={selectClass + " w-full"}
              value={current.direction}
              onChange={(event) =>
                setInvoice({
                  direction: event.target.value as typeof current.direction,
                })
              }
            >
              <option value="outgoing">We issued this invoice</option>
              <option value="incoming">A vendor issued this to us</option>
              <option value="unknown">Needs confirmation</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label>Invoice number</Label>
            <Input
              value={current.invoiceNumber ?? ""}
              onChange={(event) => setInvoice({ invoiceNumber: event.target.value })}
              placeholder="00281"
            />
          </div>
          <div className="grid gap-1">
            <Label>Issued</Label>
            <Input
              type="date"
              value={current.issueDate ?? ""}
              onChange={(event) => setInvoice({ issueDate: event.target.value || null })}
            />
          </div>
          <div className="grid gap-1">
            <Label>Due</Label>
            <Input
              type="date"
              value={current.dueDate ?? ""}
              onChange={(event) => setInvoice({ dueDate: event.target.value || null })}
            />
          </div>
          <div className="grid gap-1">
            <Label>Total</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={current.amount ?? ""}
              onChange={(event) =>
                setInvoice({
                  amount: event.target.value ? Number(event.target.value) : null,
                })
              }
            />
          </div>
          <div className="grid gap-1">
            <Label>Currency</Label>
            <Input
              value={current.currency ?? ""}
              maxLength={8}
              onChange={(event) =>
                setInvoice({ currency: event.target.value.toUpperCase() })
              }
              placeholder="USD"
            />
          </div>
          <div className="grid gap-1">
            <Label>Billed to</Label>
            <Input
              value={current.recipientName ?? ""}
              onChange={(event) => setInvoice({ recipientName: event.target.value || null })}
            />
          </div>
          <div className="grid gap-1">
            <Label>Billing email</Label>
            <Input
              type="email"
              value={current.recipientEmail ?? ""}
              onChange={(event) => setInvoice({ recipientEmail: event.target.value || null })}
            />
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={current.description ?? ""}
              onChange={(event) => setInvoice({ description: event.target.value || null })}
            />
          </div>
        </CardContent>
      </Card>

      {current.direction !== "outgoing" ? (
        <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
          <p>
            Only an invoice issued by your organization can settle an incoming MoU
            payment. Confirm the direction above before saving.
          </p>
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="grid gap-1">
            <Label>Scheduled payment this invoice settles</Label>
            <select
              className={selectClass + " w-full"}
              value={paymentId}
              onChange={(event) => setPaymentId(event.target.value)}
            >
              <option value="">Choose a payment…</option>
              {target.payments.map((payment) => (
                <option key={payment.id} value={payment.id}>
                  {payment.currency} {Number(payment.amount).toFixed(2)} · {payment.notes || "MoU payment"}
                  {payment.paidAt ? " · already received" : ""}
                  {payment.invoiceNumber ? ` · invoice ${payment.invoiceNumber}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1 sm:max-w-xs">
            <Label>Payment received date</Label>
            <Input
              type="date"
              value={receivedDate}
              onChange={(event) => setReceivedDate(event.target.value)}
            />
          </div>
          {mismatch ? (
            <p className="text-sm text-warning-foreground">
              The invoice total differs from the schedule. Saving will update the
              selected payment to {current.currency} {Number(current.amount).toFixed(2)}.
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Saving stores the original file, records the invoice, and adds or updates
            the matching funding receipt in one step.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end border-t pt-4">
        <Button
          onClick={save}
          disabled={
            saving ||
            current.direction !== "outgoing" ||
            !paymentId ||
            !receivedDate
          }
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Recording receipt…
            </>
          ) : (
            "Save invoice & record receipt"
          )}
        </Button>
      </div>
    </div>
  );
}

function UpdateReviewForm({
  importId,
  fileName,
  target,
  initial,
  onReextract,
  onApplied,
}: {
  importId: string;
  fileName: string | null;
  target: UpdateTarget;
  initial: ImportExtraction;
  onReextract: () => Promise<void>;
  onApplied: () => void;
}) {
  const [doc, setDoc] = useState<ImportExtraction>(initial);
  const [projectIndex, setProjectIndex] = useState(0);
  // Refresh the description by default (e.g. a license supersedes "must secure a
  // license"); leave the project's dates alone unless asked.
  const [applyDescription, setApplyDescription] = useState(true);
  const [applyDates, setApplyDates] = useState(false);
  const [applyRights, setApplyRights] = useState(true);
  // Default to ADD so layering a license onto an MoU never wipes existing lines.
  const [budgetMode, setBudgetMode] = useState<BudgetMode>("add");
  const [committing, setCommitting] = useState(false);
  useAutosave(importId, doc);

  const proj = doc.projects[projectIndex];
  const hasLines = (proj?.budgetLines.length ?? 0) > 0;

  const setProject = (next: ExtractedProject) =>
    setDoc((d) => ({
      ...d,
      projects: d.projects.map((p, i) => (i === projectIndex ? next : p)),
    }));

  async function apply() {
    setCommitting(true);
    try {
      const saved = await updateImportDraft(importId, doc);
      if (saved.error) {
        toast.error(saved.error);
        setCommitting(false);
        return;
      }
      const res = await applyImportToProject(importId, {
        projectIndex,
        applyDescription,
        applyDates,
        budgetMode: hasLines ? budgetMode : "skip",
        applyRights,
      });
      if (res?.error) {
        toast.error(res.error);
        setCommitting(false);
        return;
      }
      onApplied();
    } catch (e) {
      if (!(e as Error)?.message?.includes("NEXT_REDIRECT")) {
        toast.error("Could not update the project.");
        setCommitting(false);
      }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Update {target.title}
          </h1>
          <p className="text-muted-foreground">
            {fileName ? `From ${fileName}. ` : ""}Choose what to apply. Nothing
            changes until you confirm.
          </p>
        </div>
        <ReextractButton onReextract={onReextract} />
      </div>

      <Card>
        <CardContent className="py-3 text-sm text-muted-foreground">
          Current: {target.budgetLineCount} budget line
          {target.budgetLineCount === 1 ? "" : "s"} · {target.budgetTotal} ·
          rights {target.rightsStatus}
        </CardContent>
      </Card>

      <DocFields doc={doc} onChange={(patch) => setDoc((d) => ({ ...d, ...patch }))} />

      <AgreementPaymentsEditor
        doc={doc}
        eligibleProjectIndices={[projectIndex]}
        fixedOwnerLabel={target.title}
        onChange={(patch) => setDoc((current) => ({ ...current, ...patch }))}
      />

      {doc.projects.length > 1 ? (
        <div className="grid gap-1">
          <Label>Which work in this document applies to {target.title}?</Label>
          <select
            className={selectClass + " w-full"}
            value={projectIndex}
            onChange={(e) => setProjectIndex(Number(e.target.value))}
          >
            {doc.projects.map((p, i) => (
              <option key={i} value={i}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {proj ? (
        <Card>
          <CardContent className="py-4">
            <ProjectEditor
              project={proj}
              onChange={setProject}
            />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          No work found in the document.
        </p>
      )}

      <Card>
        <CardContent className="space-y-2 py-4">
          <p className="text-sm font-medium">Apply to {target.title}</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={applyRights}
              onChange={(e) => setApplyRights(e.target.checked)}
            />
            Update rights (MOU / license, holder, formats — never downgrades)
          </label>
          {hasLines ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                Budget ({proj?.budgetLines.length ?? 0} line
                {(proj?.budgetLines.length ?? 0) === 1 ? "" : "s"} in this
                document):
              </span>
              <select
                className={selectClass}
                value={budgetMode}
                onChange={(e) => setBudgetMode(e.target.value as BudgetMode)}
              >
                <option value="add">Add these lines to the budget</option>
                <option value="replace">Replace the whole budget</option>
                <option value="skip">Leave the budget unchanged</option>
              </select>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={applyDescription}
              onChange={(e) => setApplyDescription(e.target.checked)}
            />
            Update the project description from this document
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={applyDates}
              onChange={(e) => setApplyDates(e.target.checked)}
            />
            Update the project&apos;s start / due dates
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button onClick={apply} disabled={committing || !proj}>
          {committing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Applying…
            </>
          ) : (
            "Apply to project"
          )}
        </Button>
      </div>
    </div>
  );
}
