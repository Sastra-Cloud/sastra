"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookCopy,
  CheckCircle2,
  ChevronDown,
  Download,
  Mail,
  PackageCheck,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  SquareCheckBig,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import {
  acceptPrintQuote,
  addPrintPayment,
  createPrintContact,
  createPrintRun,
  createQuoteFromFile,
  createQuoteFromText,
  deletePrintPayment,
  deletePrintRun,
  draftPrintRfq,
  draftWireRequest,
  reviewPrintWirePayment,
  consolidatePrintInvoicePayment,
  learnFromEmailEdit,
  markPrintPaymentPaid,
  markPrintPaymentUnpaid,
  rejectPrintQuote,
  reopenPrintQuote,
  retryExtraction,
  sendPrintRfq,
  sendWireRequest,
  startReprint,
  updatePrintQuote,
  updatePrintRun,
  updatePrintSettings,
} from "@/lib/print/actions";
import { uploadFile } from "@/lib/files/upload-client";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { usePropState } from "@/hooks/use-prop-state";
import type { Attachment } from "@/lib/files/queries";
import { flagLabel, type PrintReviewFlag } from "@/lib/print/review-flags";
import {
  DEFAULT_FINANCIAL_EMAIL,
  DEFAULT_LANGUAGE_EXPANSION_FACTOR,
  DEFAULT_PRINT_CC_EMAILS,
  estimatePrintPages,
  formatTrimSize,
  measurementInputFromInches,
  measurementInputFromMm,
  measurementInputToMm,
  measurementToInches,
  measurementUnit,
  type MeasurementUnit,
} from "@/lib/print/estimate";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HelpTip } from "@/components/ui/help-tip";
import { FileAttachments } from "@/components/files/file-attachments";
import { PrintCorrespondenceCard } from "@/components/print/print-correspondence-card";
import { QuoteComparison } from "@/components/print/quote-comparison";
import {
  acceptedPrintCommitmentTotal,
  getPrintQuoteTotal,
} from "@/lib/print/quote-economics";
import {
  invoiceFilePaymentKinds,
  isPendingPrintInvoiceReview,
} from "@/lib/print/quote-reconciliation";
import {
  quoteHasProductionSpecs,
  quoteRunSpecPatch,
} from "@/lib/print/quote-run-specs";
import { cn } from "@/lib/utils";
import { committedFundingTotal } from "@/lib/budget/compute";
import { formatBytes } from "@/lib/format";
import {
  OutgoingAttachmentReview,
  type OutgoingEmailAttachment,
} from "@/components/email/outgoing-attachment-review";
import { EmailDraftControls } from "@/components/email/email-draft-controls";
import {
  OutgoingEmailStatus,
  type OutgoingEmailDelivery,
} from "@/components/email/outgoing-email-status";
import {
  discardEmailDraft,
  saveEmailDraft,
} from "@/lib/email/draft-actions";
import {
  emailDraftValueEqual,
  type EmailDraftDTO,
  type EmailDraftKind,
  type EmailDraftValue,
} from "@/lib/email/draft-types";

type Contact = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  domain: string | null;
};

type Settings = {
  defaultContactId: string | null;
  trimWidthIn: string;
  trimHeightIn: string;
  measurementUnit: string;
  languageExpansionFactor: string;
  financialEmail: string;
  ccEmails: string[] | null;
};

type Run = {
  id: string;
  sourceRunId: string | null;
  title: string;
  kind: string;
  printNumber: number | null;
  status: string;
  campaignStartDate: string | null;
  campaignDueDate: string | null;
  fundingGoal: string | null;
  fundingCurrency: string;
  reprintReason: string | null;
  contactId: string | null;
  contactName: string | null;
  contactCompany: string | null;
  contactEmail: string | null;
  quantityTarget: number | null;
  requestedQuantities: number[] | null;
  trimWidthIn: string;
  trimHeightIn: string;
  languageExpansionFactor: string;
  estimatedTextPages: number;
  quotedTextPages: number | null;
  coverPages: number;
  textPaper: string | null;
  coverPaper: string | null;
  binding: string | null;
  deliveryLocation: string;
  latestProofUrl: string | null;
  notes: string | null;
};

type Quote = {
  id: string;
  runId: string;
  contactId: string | null;
  kind: string;
  reviewStatus: string;
  invoiceNumber: string | null;
  issueDate: string | null;
  title: string | null;
  quantityCps: number | null;
  unitPrice: string | null;
  totalAmount: string | null;
  depositAmount: string | null;
  balanceAmount: string | null;
  currency: string;
  trimWidthMm: string | null;
  trimHeightMm: string | null;
  textPages: number | null;
  coverPages: number | null;
  textSpec: string | null;
  coverSpec: string | null;
  binding: string | null;
  deliveryLocation: string | null;
  paymentTerms: string | null;
  reviewFlags: PrintReviewFlag[] | null;
  extractionSource: string | null;
};

type ExtractionIssue = {
  id: string;
  kind: string;
  runId: string | null;
  runTitle: string | null;
  fileName: string | null;
  threadSubject: string | null;
  error: string | null;
  attempts: number;
  updatedAt: string | Date;
};

type Payment = {
  id: string;
  runId: string;
  quoteId: string | null;
  kind: string;
  status: string;
  amount: string;
  currency: string;
  dueDate: string | null;
  neededByDate: string | null;
  wireRequestedAt: string | null;
  paidAt: string | null;
  notes: string | null;
  taskId: string | null;
  taskStatus: string | null;
  taskAssigneeName: string | null;
};

type PaymentMutation =
  | { type: "delete"; id: string }
  | { type: "paid"; id: string; paidAt: string }
  | { type: "unpaid"; id: string };

function updatePaymentState(
  current: Payment[],
  mutation: PaymentMutation
): Payment[] {
  if (mutation.type === "delete") {
    return current.filter((payment) => payment.id !== mutation.id);
  }
  return current.map((payment) => {
    if (payment.id !== mutation.id) return payment;
    if (mutation.type === "paid") {
      return {
        ...payment,
        paidAt: mutation.paidAt,
        status: "paid",
      };
    }
    return { ...payment, paidAt: null, status: "planned" };
  });
}

type Thread = {
  id: string;
  threadId: string;
  subject: string | null;
  status: string;
  lastMessageAt: string | null;
  lastDirection: "inbound" | "outbound" | null;
  contactName: string | null;
  latestProofUrl: string | null;
};

type Proof = {
  attachmentId: string;
  fileId: string;
  originalName: string;
  sizeBytes: number;
  receivedAt: string | null;
  threadId: string;
  runId: string | null;
  runTitle: string | null;
};

type AttachmentMap = Record<string, Attachment[]>;

type RunFinance = {
  runId: string;
  budgeted: number;
  lineRaised: number;
  scheduled: number;
  received: number;
  available: number;
  spent: number;
  currency: string;
};

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function money(value: string | number | null, currency = "USD") {
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

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "accepted" || status === "paid") return "default";
  if (status === "suggested" || status === "requested") return "secondary";
  return "outline";
}

function csvNums(value: string): number[] {
  return value
    .split(/[,\n;]/)
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function csvEmails(value: string | readonly string[] | null | undefined): string[] {
  const parts = Array.isArray(value) ? value : String(value ?? "").split(/[,\n;]/);
  return [
    ...new Set(
      parts
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part.length > 0)
    ),
  ];
}

function defaultCcValue(settings: Settings): string {
  return (settings.ccEmails?.length
    ? settings.ccEmails
    : [...DEFAULT_PRINT_CC_EMAILS]
  ).join(", ");
}

function nowDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : "";
}

function paymentTaskStatusLabel(status: string | null) {
  if (status === "review") return "awaiting confirmation";
  if (status === "done") return "completed";
  if (status === "in_progress") return "in progress";
  return "to do";
}

function quoteTrimLabel(
  quote: Quote,
  preferredUnit: MeasurementUnit
): string | null {
  const widthMm = Number(quote.trimWidthMm);
  const heightMm = Number(quote.trimHeightMm);
  if (
    !Number.isFinite(widthMm) ||
    widthMm <= 0 ||
    !Number.isFinite(heightMm) ||
    heightMm <= 0
  ) {
    return null;
  }
  return formatTrimSize(
    measurementToInches(widthMm, "mm"),
    measurementToInches(heightMm, "mm"),
    preferredUnit
  );
}

export function PrintManager({
  projectId,
  projectSlug,
  projectTitle,
  canEdit,
  wordCount,
  wordsPerPage,
  sourcePageCount,
  printBudget,
  mouRequired,
  settings,
  contacts,
  runs: initialRuns,
  runFinance,
  quotes: initialQuotes,
  payments: initialPayments,
  threads,
  proofs,
  extractionIssues,
  quoteAttachments,
  paymentAttachments,
  initialEmailDrafts,
}: {
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  canEdit: boolean;
  wordCount: number;
  wordsPerPage: number;
  sourcePageCount: number | null;
  printBudget: {
    amount: string;
    amountSecured: string;
    amountSpent: string;
    currency: string;
  } | null;
  mouRequired: boolean;
  settings: Settings;
  contacts: Contact[];
  runs: Run[];
  runFinance: RunFinance[];
  quotes: Quote[];
  payments: Payment[];
  threads: Thread[];
  proofs: Proof[];
  extractionIssues: ExtractionIssue[];
  quoteAttachments: AttachmentMap;
  paymentAttachments: AttachmentMap;
  initialEmailDrafts: EmailDraftDTO[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [runs, setRuns] = usePropState(initialRuns);
  const [quotes, setQuotes] = usePropState(initialQuotes);
  const paymentChanges = useOptimisticAction<Payment[], PaymentMutation>({
    state: initialPayments,
    update: updatePaymentState,
    getKey: (mutation) => mutation.id,
  });
  const payments = paymentChanges.state;
  const initialMeasurementUnit = measurementUnit(settings.measurementUnit);
  const [preferredMeasurementUnit, setPreferredMeasurementUnit] =
    usePropState(initialMeasurementUnit);
  const [settingsDraft, setSettingsDraft] = useState({
    contactId: settings.defaultContactId ?? "",
    trimWidth: measurementInputFromInches(
      settings.trimWidthIn,
      initialMeasurementUnit
    ),
    trimHeight: measurementInputFromInches(
      settings.trimHeightIn,
      initialMeasurementUnit
    ),
    measurementUnit: initialMeasurementUnit,
    sourcePageCount: String(sourcePageCount ?? ""),
    languageExpansionFactor: settings.languageExpansionFactor,
    financialEmail: settings.financialEmail,
    ccEmails: defaultCcValue(settings),
  });
  const [contactDraft, setContactDraft] = useState({
    name: "",
    company: "",
    email: "",
    domain: "",
  });
  const [runDraft, setRunDraft] = useState({
    title: projectTitle,
    contactId: settings.defaultContactId ?? "",
    quantities: "1000, 2000, 3000, 4000, 5000",
  });
  const nextPrintNumber =
    Math.max(1, ...runs.map((run) => run.printNumber ?? (run.kind === "first_print" ? 1 : 0))) +
    1;
  const [reprintDraft, setReprintDraft] = useState({
    sourceRunId: runs[0]?.id ?? "",
    title: `${projectTitle} reprint ${nextPrintNumber}`,
    printNumber: String(nextPrintNumber),
    dueDate: "",
    fundingGoal: "",
    quantities: runs[0]?.requestedQuantities?.join(", ") || runDraft.quantities,
    reason: "",
  });
  const [reprintOpen, setReprintOpen] = useState(false);
  const [quoteText, setQuoteText] = useState("");
  const [quoteRunId, setQuoteRunId] = useState(runs[0]?.id ?? "");
  const [extractRunId, setExtractRunId] = useState(runs[0]?.id ?? "");
  const [extracting, setExtracting] = useState(false);
  const [compose, setCompose] = useState<{
    type: "rfq" | "wire";
    reviewedAmount?: string;
    id: string;
    to: string[];
    cc: string;
    subject: string;
    body: string;
    // The pristine AI draft, kept so we can learn from any edits on send.
    baselineSubject: string;
    baselineBody: string;
    recipientMissingReason: string | null;
    attachments: OutgoingEmailAttachment[];
  } | null>(null);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [emailDraftPending, startEmailDraftMutation] = useTransition();
  const [discardingEmailDraft, setDiscardingEmailDraft] = useState(false);
  const [emailDrafts, setEmailDrafts] = usePropState(initialEmailDrafts);
  const [emailDelivery, setEmailDelivery] =
    useState<OutgoingEmailDelivery | null>(null);
  const composeCardRef = useRef<HTMLDivElement>(null);
  const revealComposeOnOpenRef = useRef(false);

  useEffect(() => {
    if (!compose || !revealComposeOnOpenRef.current) return;
    revealComposeOnOpenRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const card = composeCardRef.current;
      if (!card) return;
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      card.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
      card.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [compose]);

  const sourceRunIds = useMemo(
    () =>
      new Set(
        runs
          .map((run) => run.sourceRunId)
          .filter((id): id is string => !!id)
      ),
    [runs]
  );
  const latestRun =
    runs.find((run) => !sourceRunIds.has(run.id)) ?? runs[0] ?? null;
  const displayRuns = latestRun
    ? [latestRun, ...runs.filter((run) => run.id !== latestRun.id)]
    : runs;
  const latestProof =
    (latestRun
      ? proofs.find((proof) => proof.runId === latestRun.id)
      : null) ?? proofs[0] ?? null;
  const activeProofUrl =
    latestRun?.latestProofUrl ??
    threads.find((thread) => thread.latestProofUrl)?.latestProofUrl ??
    null;
  const activeProofHref = latestProof
    ? `/api/files/${latestProof.fileId}/download`
    : activeProofUrl;
  const nextPayment = payments.find((payment) => !payment.paidAt) ?? null;

  // Estimate vs actual (print). Budgeted = the print/ship budget line; committed
  // = accepted-quote total; paid = payments marked paid.
  const acceptedQuotes = quotes.filter((q) => q.reviewStatus === "accepted");
  const committedCost = acceptedPrintCommitmentTotal(acceptedQuotes);
  const paidCost = payments.reduce(
    (sum, p) => sum + (p.paidAt ? Number(p.amount) || 0 : 0),
    0,
  );
  const budgetedCost = Number(printBudget?.amount) || 0;
  const securedForPrint = Number(printBudget?.amountSecured) || 0;
  const printCurrency = printBudget?.currency || acceptedQuotes[0]?.currency || "USD";
  const actualCost = paidCost > 0 ? paidCost : committedCost;
  const costVariance = actualCost - budgetedCost;
  const showPrintBudget =
    !!printBudget && (committedCost > 0 || paidCost > 0 || mouRequired);

  const draftSourcePageCount = Math.max(
    0,
    Math.round(Number(settingsDraft.sourcePageCount) || 0),
  );
  const draftKhmerFactor =
    Number(settingsDraft.languageExpansionFactor) ||
    DEFAULT_LANGUAGE_EXPANSION_FACTOR;
  const draftEstimate = estimatePrintPages({
    wordCount,
    wordsPerPage,
    sourcePageCount: draftSourcePageCount,
    trimWidthIn: measurementToInches(
      settingsDraft.trimWidth,
      settingsDraft.measurementUnit
    ),
    trimHeightIn: measurementToInches(
      settingsDraft.trimHeight,
      settingsDraft.measurementUnit
    ),
    languageExpansionFactor: settingsDraft.languageExpansionFactor,
  });
  const estimateDetail = draftSourcePageCount
    ? `${draftSourcePageCount.toLocaleString()} source pages × ${draftKhmerFactor} expansion factor`
    : `${wordCount.toLocaleString()} words × ${draftKhmerFactor} expansion factor / ${wordsPerPage} wpp`;
  const quotesByRun = useMemo(() => {
    const map = new Map<string, Quote[]>();
    for (const quote of quotes) {
      const list = map.get(quote.runId) ?? [];
      list.push(quote);
      map.set(quote.runId, list);
    }
    return map;
  }, [quotes]);
  // When a printer quote states the actual page count, prefer it over the
  // word-count estimate (which is 0 before any word count is entered). Accepted
  // quote wins, then the run's recorded quoted pages, then any live suggestion.
  const activeRunQuotes = latestRun ? quotesByRun.get(latestRun.id) ?? [] : [];
  const acceptedRunQuote = activeRunQuotes.find(
    (quote) => quote.reviewStatus === "accepted",
  );
  const quotedTextPages =
    acceptedRunQuote?.textPages ??
    latestRun?.quotedTextPages ??
    activeRunQuotes.find(
      (quote) => quote.reviewStatus !== "rejected" && quote.textPages != null,
    )?.textPages ??
    null;
  const showQuotedPages = quotedTextPages != null && quotedTextPages > 0;
  const estimatePages =
    quotedTextPages != null && quotedTextPages > 0
      ? quotedTextPages
      : draftEstimate || 0;
  const paymentsByRun = useMemo(() => {
    const map = new Map<string, Payment[]>();
    for (const payment of payments) {
      const list = map.get(payment.runId) ?? [];
      list.push(payment);
      map.set(payment.runId, list);
    }
    return map;
  }, [payments]);
  const proofsByRun = useMemo(() => {
    const map = new Map<string, Proof>();
    for (const proof of proofs) {
      if (proof.runId && !map.has(proof.runId)) map.set(proof.runId, proof);
    }
    return map;
  }, [proofs]);
  const financeByRun = useMemo(
    () => new Map(runFinance.map((summary) => [summary.runId, summary])),
    [runFinance],
  );
  const financialEmail = settings.financialEmail || DEFAULT_FINANCIAL_EMAIL;
  const savedDefaultCc = defaultCcValue(settings);
  const composeDraftKind: EmailDraftKind | null = compose
    ? compose.type === "rfq"
      ? "print_rfq"
      : "print_wire"
    : null;
  const savedComposeDraft =
    compose && composeDraftKind
      ? emailDrafts.find(
          (draft) =>
            draft.kind === composeDraftKind && draft.contextId === compose.id
        ) ?? null
      : null;
  const currentComposeDraftValue: EmailDraftValue | null = compose
    ? {
        toAddresses: compose.to,
        ccAddresses: csvEmails(compose.cc),
        subject: compose.subject,
        body: compose.body,
        baselineSubject: compose.baselineSubject,
        baselineBody: compose.baselineBody,
      }
    : null;
  const composeHasUnsavedChanges = currentComposeDraftValue
    ? !savedComposeDraft ||
      !emailDraftValueEqual(currentComposeDraftValue, savedComposeDraft)
    : false;

  const runAction = (
    fn: () => Promise<{ error?: string } | void>,
    rollback?: () => void
  ) =>
    start(async () => {
      try {
        const res = await fn();
        if (res?.error) {
          rollback?.();
          toast.error(res.error);
          return;
        }
        router.refresh();
      } catch (err) {
        rollback?.();
        toast.error(err instanceof Error ? err.message : "Could not complete action.");
      }
    });

  function updateCompose(fields: Partial<NonNullable<typeof compose>>) {
    setCompose((current) => (current ? { ...current, ...fields } : current));
    setEmailConfirmed(false);
  }

  function changeMeasurementUnit(nextUnit: MeasurementUnit) {
    setSettingsDraft((draft) => {
      if (draft.measurementUnit === nextUnit) return draft;
      const convert = (value: string) =>
        value
          ? measurementInputFromInches(
              measurementToInches(value, draft.measurementUnit),
              nextUnit
            )
          : "";
      return {
        ...draft,
        measurementUnit: nextUnit,
        trimWidth: convert(draft.trimWidth),
        trimHeight: convert(draft.trimHeight),
      };
    });
  }

  function saveSettings() {
    const previousMeasurementUnit = preferredMeasurementUnit;
    setPreferredMeasurementUnit(settingsDraft.measurementUnit);
    runAction(async () => {
      const res = await updatePrintSettings(projectId, {
        defaultContactId: settingsDraft.contactId || null,
        trimWidthIn: measurementToInches(
          settingsDraft.trimWidth,
          settingsDraft.measurementUnit
        ),
        trimHeightIn: measurementToInches(
          settingsDraft.trimHeight,
          settingsDraft.measurementUnit
        ),
        measurementUnit: settingsDraft.measurementUnit,
        sourcePageCount: settingsDraft.sourcePageCount || 0,
        languageExpansionFactor: settingsDraft.languageExpansionFactor,
        financialEmail: settingsDraft.financialEmail,
        ccEmails: settingsDraft.ccEmails,
      });
      if (!res?.error) toast.success("Print settings saved");
      return res;
    }, () => setPreferredMeasurementUnit(previousMeasurementUnit));
  }

  function addContact() {
    if (!contactDraft.name.trim()) {
      toast.error("Enter a contact name.");
      return;
    }
    runAction(async () => {
      const res = await createPrintContact(contactDraft);
      setSettingsDraft((draft) => ({ ...draft, contactId: res.id }));
      setRunDraft((draft) => ({ ...draft, contactId: res.id }));
      setContactDraft({ name: "", company: "", email: "", domain: "" });
      toast.success("Printer contact added");
    });
  }

  function addRun() {
    runAction(async () => {
      const res = await createPrintRun(projectId, {
        title: runDraft.title,
        contactId: runDraft.contactId || null,
        requestedQuantities: csvNums(runDraft.quantities),
      });
      if (!res?.error && res?.id) {
        setQuoteRunId(res.id);
        toast.success("Print run created");
      }
      return res;
    });
  }

  function createReprint() {
    runAction(async () => {
      const res = await startReprint(projectId, {
        sourceRunId: reprintDraft.sourceRunId || null,
        title: reprintDraft.title.trim() || undefined,
        printNumber: reprintDraft.printNumber
          ? Number(reprintDraft.printNumber)
          : undefined,
        campaignDueDate: reprintDraft.dueDate || null,
        fundingGoal: reprintDraft.fundingGoal
          ? Number(reprintDraft.fundingGoal)
          : null,
        requestedQuantities: csvNums(reprintDraft.quantities),
        reprintReason: reprintDraft.reason || undefined,
      });
      if (!res?.error && res?.id) {
        setQuoteRunId(res.id);
        setExtractRunId(res.id);
        setReprintOpen(false);
        toast.success("Reprint started");
      }
      return res;
    });
  }

  function parseQuote() {
    if (!quoteRunId) {
      toast.error("Choose a print run first.");
      return;
    }
    if (!quoteText.trim()) {
      toast.error("Paste the quote or invoice text first.");
      return;
    }
    runAction(async () => {
      const res = await createQuoteFromText(quoteRunId, quoteText);
      if (!res?.error) {
        setQuoteText("");
        toast.success("Quote saved for review");
      }
      return res;
    });
  }

  async function extractFromFile(file: File) {
    if (!extractRunId) {
      toast.error("Choose a print run first.");
      return;
    }
    setExtracting(true);
    try {
      const fileId = await uploadFile(file);
      if (!fileId) return; // uploadFile already toasted
      const res = await createQuoteFromFile(extractRunId, fileId);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Invoice extracted for review");
      router.refresh();
    } finally {
      setExtracting(false);
    }
  }

  function draftRfq(runId: string) {
    const saved = emailDrafts.find(
      (draft) => draft.kind === "print_rfq" && draft.contextId === runId
    );
    if (saved) {
      const run = runs.find((item) => item.id === runId);
      const contact = contacts.find(
        (item) => item.id === (run?.contactId ?? settings.defaultContactId)
      );
      const recipientEmail = run?.contactEmail ?? contact?.email ?? null;
      setCompose({
        type: "rfq",
        id: runId,
        to: recipientEmail ? [recipientEmail] : [],
        cc: saved.ccAddresses.join(", "),
        subject: saved.subject,
        body: saved.body,
        baselineSubject: saved.baselineSubject ?? saved.subject,
        baselineBody: saved.baselineBody ?? saved.body,
        recipientMissingReason: recipientEmail
          ? null
          : contact
            ? `Add an email address to ${contact.company || contact.name}.`
            : "Choose a printer contact with an email address.",
        attachments: [],
      });
      setEmailConfirmed(false);
      toast.success("Saved draft restored");
      return;
    }
    runAction(async () => {
      const res = await draftPrintRfq(runId);
      if ("error" in res) return res;
      setCompose({
        type: "rfq",
        id: runId,
        to: res.recipientEmail ? [res.recipientEmail] : [],
        cc: savedDefaultCc,
        subject: res.subject,
        body: res.body,
        baselineSubject: res.subject,
        baselineBody: res.body,
        recipientMissingReason: res.recipientMissingReason,
        attachments: [],
      });
      setEmailConfirmed(false);
      return {};
    });
  }

  function draftWire(paymentId: string) {
    runAction(async () => {
      const review = await reviewPrintWirePayment(paymentId);
      if ("correction" in review && review.correction) {
        if (!(await confirmDialog(`Use the accepted invoice total of ${money(review.correction.amount, review.correction.currency)} as one full payment? This replaces ${review.correction.replacedPayments} other planned payments and clears their old wire drafts. Nothing will be sent.`, { title: "Pay the invoice in full?", confirmLabel: "Use full payment" }))) return {};
        const result = await consolidatePrintInvoicePayment(paymentId, review.correction.invoiceId, review.correction.amount, review.correction.currency);
        if (result.error) return result;
        const runId = payments.find(payment => payment.id === paymentId)?.runId;
        const replacedIds = new Set(payments.filter(payment => payment.runId === runId).map(payment => payment.id));
        setEmailDrafts(current => current.filter(draft => draft.kind !== "print_wire" || !replacedIds.has(draft.contextId)));
        setCompose(null);
        router.refresh();
        toast.success("Full payment corrected. Open Wire email again to review a fresh draft.");
        return {};
      }
      if (review.error) return { error: review.error };
      openWireDraft(paymentId);
      return {};
    });
  }

  function openWireDraft(paymentId: string) {
    const saved = emailDrafts.find(
      (draft) => draft.kind === "print_wire" && draft.contextId === paymentId
    );
    const attachments = (paymentAttachments[paymentId] ?? [])
      .filter((attachment) => attachment.mimeType === "application/pdf")
      .slice(0, 5)
      .map((attachment) => ({
        name: attachment.originalName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        previewUrl: `/api/files/${attachment.fileId}/download?inline=1`,
        description: "Printer invoice",
      }));
    if (saved) {
      revealComposeOnOpenRef.current = true;
      setCompose({
        type: "wire",
        reviewedAmount: payments.find(payment => payment.id === paymentId)?.amount,
        id: paymentId,
        to: [financialEmail],
        cc: saved.ccAddresses.join(", "),
        subject: saved.subject,
        body: saved.body,
        baselineSubject: saved.baselineSubject ?? saved.subject,
        baselineBody: saved.baselineBody ?? saved.body,
        recipientMissingReason: null,
        attachments,
      });
      setEmailConfirmed(false);
      toast.success("Saved draft restored");
      return;
    }
    runAction(async () => {
      const res = await draftWireRequest(paymentId);
      if ("error" in res) return res;
      revealComposeOnOpenRef.current = true;
      setCompose({
        type: "wire",
        reviewedAmount: payments.find(payment => payment.id === paymentId)?.amount,
        id: paymentId,
        to: [financialEmail],
        cc: savedDefaultCc,
        subject: res.subject,
        body: res.body,
        baselineSubject: res.subject,
        baselineBody: res.body,
        recipientMissingReason: null,
        attachments,
      });
      setEmailConfirmed(false);
      return {};
    });
  }

  function saveComposeDraft() {
    if (!compose || !composeDraftKind || !currentComposeDraftValue) return;
    startEmailDraftMutation(async () => {
      try {
        const result = await saveEmailDraft({
          projectId,
          kind: composeDraftKind,
          contextId: compose.id,
          ...currentComposeDraftValue,
        });
        if (result.error || !result.draft) {
          toast.error(result.error || "Could not save the draft.");
          return;
        }
        setEmailDrafts((current) => [
          ...current.filter(
            (draft) =>
              !(
                draft.kind === composeDraftKind &&
                draft.contextId === compose.id
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

  async function discardComposeDraft() {
    if (
      !compose ||
      !composeDraftKind ||
      !(await confirmDialog("Discard this saved email draft and close the composer?"))
    ) {
      return;
    }
    const kind = composeDraftKind;
    const contextId = compose.id;
    setDiscardingEmailDraft(true);
    startEmailDraftMutation(async () => {
      try {
        const result = await discardEmailDraft(kind, contextId);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setEmailDrafts((current) =>
          current.filter(
            (draft) =>
              !(draft.kind === kind && draft.contextId === contextId)
          )
        );
        setCompose(null);
        toast.success("Draft discarded");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not discard the draft."
        );
      } finally {
        setDiscardingEmailDraft(false);
      }
    });
  }

  async function closeCompose() {
    if (
      composeHasUnsavedChanges &&
      !(await confirmDialog("Close without saving your latest changes?"))
    ) {
      return;
    }
    setCompose(null);
  }

  function sendCompose() {
    if (!compose) return;
    const outgoing = compose;
    const label =
      outgoing.type === "rfq" ? "Printer RFQ" : "Finance wire request";
    const recipient = outgoing.to.join(", ");
    setEmailDelivery({
      status: "sending",
      label,
      recipient,
    });
    start(async () => {
      try {
        const res =
          outgoing.type === "rfq"
            ? await sendPrintRfq(outgoing.id, {
                subject: outgoing.subject,
                body: outgoing.body,
                ccEmails: csvEmails(outgoing.cc),
              })
            : await sendWireRequest(outgoing.id, {
                reviewedAmount: outgoing.reviewedAmount,
                subject: outgoing.subject,
                body: outgoing.body,
                ccEmails: csvEmails(outgoing.cc),
              });
        if (res?.error) {
          setEmailDelivery(null);
          toast.error(res.error);
          return;
        }
        // Teach the drafter from any edits the manager made before sending.
        const edited =
          outgoing.subject !== outgoing.baselineSubject ||
          outgoing.body !== outgoing.baselineBody;
        if (edited) {
          void learnFromEmailEdit({
            operation:
              outgoing.type === "rfq"
                ? "draft_print_rfq"
                : "draft_wire_request",
            projectId,
            baselineSubject: outgoing.baselineSubject,
            baselineBody: outgoing.baselineBody,
            finalSubject: outgoing.subject,
            finalBody: outgoing.body,
          }).catch(() => {});
        }
        toast.success("Email sent");
        setEmailDrafts((current) =>
          current.filter(
            (draft) =>
              !(
                draft.kind === composeDraftKind &&
                draft.contextId === outgoing.id
              )
          )
        );
        setCompose(null);
        setEmailDelivery({
          status: "sent",
          label,
          recipient,
          sentAt: new Date().toISOString(),
        });
        router.refresh();
      } catch (error) {
        setEmailDelivery(null);
        toast.error(
          error instanceof Error ? error.message : "Could not send the email."
        );
      }
    });
  }

  return (
    <div className="min-w-0 space-y-5">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile
          icon={<BookCopy className="size-4" />}
          label="Estimate"
          value={`${estimatePages.toLocaleString()} pages`}
          detail={
            showQuotedPages
              ? acceptedRunQuote
                ? "From accepted quote"
                : "From printer quote"
              : estimateDetail
          }
        />
        <SummaryTile
          icon={<PackageCheck className="size-4" />}
          label="Active run"
          value={latestRun?.status.replaceAll("_", " ") ?? "Not started"}
          detail={
            latestRun
              ? [
                  latestRun.quantityTarget
                    ? `${latestRun.quantityTarget.toLocaleString()} copies`
                    : null,
                  latestRun.contactName ?? latestRun.contactCompany ?? null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "No printer"
              : "No printer"
          }
        />
        <SummaryTile
          icon={<ReceiptText className="size-4" />}
          label="Next payment"
          value={nextPayment ? money(nextPayment.amount, nextPayment.currency) : "None"}
          detail={nextPayment?.kind ?? "No unpaid print payment"}
        />
        <SummaryTile
          icon={<Download className="size-4" />}
          label="Latest proof"
          value={activeProofHref ? "Available" : "No proof"}
          detail={latestProof?.originalName ?? activeProofUrl ?? "Waiting for printer"}
          href={activeProofHref ?? undefined}
        />
      </section>

      {showPrintBudget ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="size-4" />
              Estimate vs actual (print)
            </CardTitle>
            <CardDescription>
              Budgeted print/ship cost compared with the accepted quote and
              payments made.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat
                label="Budgeted"
                value={money(budgetedCost, printCurrency)}
                hint="Print / ship budget line"
              />
              <MiniStat
                label="Committed"
                value={money(committedCost, printCurrency)}
                hint="Accepted quote total"
              />
              <MiniStat
                label="Paid"
                value={money(paidCost, printCurrency)}
                hint="Payments marked paid"
              />
              <MiniStat
                label="Variance"
                value={`${costVariance > 0 ? "+" : ""}${money(
                  costVariance,
                  printCurrency,
                )}`}
                tone={
                  costVariance > 0 ? "over" : costVariance < 0 ? "under" : undefined
                }
                hint={
                  costVariance > 0
                    ? "Over budget"
                    : costVariance < 0
                      ? "Under budget"
                      : "On budget"
                }
              />
            </div>
            {mouRequired ? (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                {actualCost > securedForPrint ? (
                  <p className="text-destructive">
                    Shortfall: {money(actualCost - securedForPrint, printCurrency)}{" "}
                    over the {money(securedForPrint, printCurrency)} raised for
                    printing on this MoU-funded project.
                  </p>
                ) : (
                  <p className="text-success">
                    Within funded amount — {money(securedForPrint, printCurrency)}{" "}
                    raised covers the {money(actualCost, printCurrency)}{" "}
                    {paidCost > 0 ? "paid" : "committed"} so far.
                  </p>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="size-4" />
              Print settings
            </CardTitle>
            <CardDescription>
              Defaults for page estimates, RFQs, and finance requests.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              <Field
                label="English page count"
                hint="Shared with Budget; used to estimate target-language text pages."
              >
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={settingsDraft.sourcePageCount}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      sourcePageCount: e.target.value,
                    })
                  }
                  className="tabular-nums"
                />
              </Field>
              <Field
                label="Language expansion factor"
                help="How much longer the translated text runs than the source. For example, 1.3 means the translation takes about 30% more pages."
                hint={`Live estimate: ${draftEstimate.toLocaleString()} target-language pages`}
              >
                <Input
                  type="number"
                  min="0.5"
                  max="3"
                  step="0.01"
                  value={settingsDraft.languageExpansionFactor}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      languageExpansionFactor: e.target.value,
                    })
                  }
                  className="tabular-nums"
                />
              </Field>
              <Field label="Default printer">
                <select
                  className={selectClass}
                  value={settingsDraft.contactId}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, contactId: e.target.value })
                  }
                >
                  <option value="">No default</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.company || contact.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={`Trim width (${settingsDraft.measurementUnit})`}
                help={`Trim size is the finished page size after the paper is cut. This project uses ${settingsDraft.measurementUnit === "mm" ? "millimetres" : "inches"}.`}
              >
                <Input
                  type="number"
                  step="0.01"
                  min={settingsDraft.measurementUnit === "mm" ? "25.4" : "1"}
                  max={settingsDraft.measurementUnit === "mm" ? "508" : "20"}
                  value={settingsDraft.trimWidth}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, trimWidth: e.target.value })
                  }
                />
              </Field>
              <Field
                label={`Trim height (${settingsDraft.measurementUnit})`}
                help={`The finished page height after cutting, in ${settingsDraft.measurementUnit === "mm" ? "millimetres" : "inches"}.`}
              >
                <Input
                  type="number"
                  step="0.01"
                  min={settingsDraft.measurementUnit === "mm" ? "25.4" : "1"}
                  max={settingsDraft.measurementUnit === "mm" ? "508" : "20"}
                  value={settingsDraft.trimHeight}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, trimHeight: e.target.value })
                  }
                />
              </Field>
              <Field
                label="Measurement unit"
                help="Controls trim-size inputs and displays across this project, including print runs, quotes, and RFQ drafts."
              >
                <select
                  className={selectClass}
                  value={settingsDraft.measurementUnit}
                  onChange={(event) =>
                    changeMeasurementUnit(measurementUnit(event.target.value))
                  }
                >
                  <option value="in">Inches (in)</option>
                  <option value="mm">Millimetres (mm)</option>
                </select>
              </Field>
              <Field label="Finance recipient">
                <Input
                  type="email"
                  value={settingsDraft.financialEmail}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      financialEmail: e.target.value,
                    })
                  }
                />
              </Field>
              <div className="md:col-span-2 2xl:col-span-3">
                <Field
                  label="Default CC recipients"
                  hint="Separate multiple emails with commas or new lines. These are added to printer RFQs and finance wire requests."
                >
                  <Textarea
                    rows={2}
                    value={settingsDraft.ccEmails}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, ccEmails: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="md:col-span-2 2xl:col-span-3">
                <Button onClick={saveSettings} disabled={pending}>
                  Save settings
                </Button>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="mb-2 text-sm font-medium">Add printer contact</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Name"
                  value={contactDraft.name}
                  onChange={(e) =>
                    setContactDraft({ ...contactDraft, name: e.target.value })
                  }
                />
                <Input
                  placeholder="Company"
                  value={contactDraft.company}
                  onChange={(e) =>
                    setContactDraft({ ...contactDraft, company: e.target.value })
                  }
                />
                <Input
                  placeholder="Email"
                  value={contactDraft.email}
                  onChange={(e) =>
                    setContactDraft({ ...contactDraft, email: e.target.value })
                  }
                />
                <Input
                  placeholder="Domain"
                  value={contactDraft.domain}
                  onChange={(e) =>
                    setContactDraft({ ...contactDraft, domain: e.target.value })
                  }
                />
                <Button
                  variant="outline"
                  className="sm:col-span-2"
                  onClick={addContact}
                  disabled={pending}
                >
                  <Plus className="size-4" />
                  Add contact
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Set up print run</CardTitle>
            <CardDescription>
              Save the internal run first. This does not email the printer.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-[1fr_12rem_1fr_auto]">
            <Field label="Run title">
              <Input
                value={runDraft.title}
                onChange={(e) => setRunDraft({ ...runDraft, title: e.target.value })}
              />
            </Field>
            <Field label="Printer">
              <select
                className={selectClass}
                value={runDraft.contactId}
                onChange={(e) => setRunDraft({ ...runDraft, contactId: e.target.value })}
              >
                <option value="">No printer</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.company || contact.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="RFQ quantity tiers"
              hint="Copy counts to ask the printer to price when you draft the RFQ."
            >
              <Input
                value={runDraft.quantities}
                placeholder="1000, 2000, 3000"
                onChange={(e) =>
                  setRunDraft({ ...runDraft, quantities: e.target.value })
                }
              />
            </Field>
            <div className="flex items-end">
              <Button onClick={addRun} disabled={pending || !runDraft.title.trim()}>
                <Plus className="size-4" />
                Create run
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {canEdit && runs.length > 0 ? (
        <Card>
          <CardHeader className="has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]">
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="size-4" />
              Reprints
            </CardTitle>
            <CardDescription>
              Copy specs from a previous run, then track reprint-only budget,
              sponsor funding, tasks, quotes, and payments.
            </CardDescription>
            <CardAction className="col-start-1 row-start-auto row-span-1 mt-2 justify-self-start sm:col-start-2 sm:row-start-1 sm:row-span-2 sm:mt-0 sm:justify-self-end">
              <Button
                type="button"
                variant={reprintOpen ? "ghost" : "outline"}
                size="sm"
                className="min-h-11"
                aria-expanded={reprintOpen}
                onClick={() => setReprintOpen((open) => !open)}
              >
                <RotateCcw className="size-4" />
                {reprintOpen ? "Hide setup" : "Set up reprint"}
              </Button>
            </CardAction>
          </CardHeader>
          {reprintOpen ? (
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
              <div className="xl:col-span-3">
                <Field label="Copy specs from">
                  <select
                    className={selectClass}
                    value={reprintDraft.sourceRunId}
                    onChange={(e) =>
                      setReprintDraft({
                        ...reprintDraft,
                        sourceRunId: e.target.value,
                      })
                    }
                  >
                    {runs.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.title}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="xl:col-span-4">
                <Field label="Reprint title">
                  <Input
                    value={reprintDraft.title}
                    onChange={(e) =>
                      setReprintDraft({ ...reprintDraft, title: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="xl:col-span-2">
                <Field label="Printing #">
                  <Input
                    type="number"
                    min={2}
                    value={reprintDraft.printNumber}
                    onChange={(e) =>
                      setReprintDraft({
                        ...reprintDraft,
                        printNumber: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
              <div className="xl:col-span-3">
                <Field label="Due date">
                  <Input
                    type="date"
                    value={reprintDraft.dueDate}
                    onChange={(e) =>
                      setReprintDraft({ ...reprintDraft, dueDate: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="xl:col-span-3">
                <Field label="Funding goal">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Optional"
                    value={reprintDraft.fundingGoal}
                    onChange={(e) =>
                      setReprintDraft({
                        ...reprintDraft,
                        fundingGoal: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
              <div className="xl:col-span-4">
                <Field label="Quantity tiers">
                  <Input
                    value={reprintDraft.quantities}
                    onChange={(e) =>
                      setReprintDraft({
                        ...reprintDraft,
                        quantities: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
              <div className="md:col-span-2 xl:col-span-3">
                <Field label="Reason / sponsor notes">
                  <Input
                    placeholder="e.g. sponsor requested another 2,000 copies"
                    value={reprintDraft.reason}
                    onChange={(e) =>
                      setReprintDraft({
                        ...reprintDraft,
                        reason: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
              <div className="flex items-end md:col-span-2 xl:col-span-2">
                <Button
                  className="w-full xl:w-auto"
                  onClick={createReprint}
                  disabled={pending || !reprintDraft.title.trim()}
                >
                  <RotateCcw className="size-4" />
                  Start reprint
                </Button>
              </div>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {emailDelivery ? (
        <OutgoingEmailStatus delivery={emailDelivery} />
      ) : null}

      {compose ? (
        <Card
          ref={composeCardRef}
          id="print-email-composer"
          tabIndex={-1}
          aria-labelledby="print-email-composer-title"
          className="scroll-mt-24 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <CardHeader className="has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]">
            <CardTitle
              id="print-email-composer-title"
              className="flex items-center gap-2"
            >
              <Mail className="size-4" />
              {compose.type === "rfq"
                ? "Review printer RFQ email"
                : "Review finance wire email"}
            </CardTitle>
            <CardDescription>
              Nothing is sent until you review the recipients and confirm below.
            </CardDescription>
            <CardAction className="col-start-1 row-start-auto row-span-1 mt-2 justify-self-start sm:col-start-2 sm:row-start-1 sm:row-span-2 sm:mt-0 sm:justify-self-end">
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11"
                disabled={emailDraftPending}
                onClick={closeCompose}
              >
                Close
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="To">
                <Input
                  value={
                    compose.to.join(", ") ||
                    compose.recipientMissingReason ||
                    "No recipient selected"
                  }
                  readOnly
                  aria-invalid={compose.to.length === 0}
                />
                {compose.to.length === 0 && compose.recipientMissingReason ? (
                  <p className="text-xs text-destructive">
                    {compose.recipientMissingReason}
                  </p>
                ) : null}
              </Field>
              <Field
                label="Cc"
                hint="Edit this email's CC list without changing the saved defaults."
              >
                <Textarea
                  rows={2}
                  value={compose.cc}
                  onChange={(e) => updateCompose({ cc: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Subject">
              <Input
                value={compose.subject}
                onChange={(e) =>
                  updateCompose({ subject: e.target.value })
                }
              />
            </Field>
            <Field label="Body">
              <Textarea
                rows={10}
                value={compose.body}
                onChange={(e) => updateCompose({ body: e.target.value })}
              />
            </Field>
            <OutgoingAttachmentReview attachments={compose.attachments} />
            <EmailDraftControls
              hasSavedDraft={Boolean(savedComposeDraft)}
              hasUnsavedChanges={composeHasUnsavedChanges}
              saving={emailDraftPending && !discardingEmailDraft}
              discarding={discardingEmailDraft}
              updatedAt={savedComposeDraft?.updatedAt ?? null}
              onSave={saveComposeDraft}
              onDiscard={discardComposeDraft}
            />
            {compose.type === "wire" && compose.attachments.length === 0 ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200"
              >
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <p>
                  No PDF invoice is attached. Upload the invoice to this payment
                  before sending the wire request.
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
              <Label className="flex items-center gap-2 text-sm font-normal">
                <Checkbox
                  checked={emailConfirmed}
                  onCheckedChange={(checked) => setEmailConfirmed(checked === true)}
                />
                I reviewed the recipients, message
                {compose.attachments.length > 0 ? ", and attachments" : ""}.
              </Label>
              <Button
                onClick={sendCompose}
                disabled={
                  pending ||
                  emailDraftPending ||
                  !emailConfirmed ||
                  compose.to.length === 0 ||
                  !compose.subject.trim() ||
                  !compose.body.trim() ||
                  (compose.type === "wire" && compose.attachments.length === 0)
                }
              >
                <Send className="size-4" />
                {compose.type === "rfq" ? "Send printer RFQ" : "Send wire request"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
        <div className="min-w-0 space-y-5">
          {canEdit && extractionIssues.length > 0 ? (
            <Card className="border-amber-300 dark:border-amber-900/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-4" />
                  Extraction issues
                </CardTitle>
                <CardDescription>
                  These attachments or emails couldn&apos;t be read into a quote.
                  Retry to try again, or add the quote manually.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {extractionIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-lg border bg-amber-50/60 px-3 py-2 dark:bg-amber-950/20"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {issue.kind === "pdf"
                          ? issue.fileName || "Invoice PDF"
                          : issue.threadSubject || "Email quote"}
                        {issue.runTitle ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {issue.runTitle}
                          </span>
                        ) : null}
                      </p>
                      {issue.error ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {issue.error}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {issue.attempts} attempt{issue.attempts === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        runAction(async () => {
                          const res = await retryExtraction(issue.id);
                          if (!res?.error) toast.success("Retrying extraction…");
                          return res;
                        })
                      }
                      disabled={pending}
                    >
                      <RotateCcw className="size-3.5" />
                      Retry
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
          {runs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="max-w-xl space-y-1.5">
                  <h3 className="font-medium">No print run yet</h3>
                  <p className="text-pretty text-sm text-muted-foreground">
                    {canEdit
                      ? "A print run is one order to print copies of this book. Use “Set up print run” above — give it a title, choose the printer, and list the copy amounts you want prices for. Saving it does not email anyone."
                      : "A manager hasn’t set up a print run for this book yet."}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            displayRuns.map((run) => (
              <RunPanel
                key={[
                  run.id,
                  run.id === latestRun?.id ? "active" : "history",
                  run.status,
                  run.contactId,
                  run.quantityTarget,
                  run.trimWidthIn,
                  run.trimHeightIn,
                  preferredMeasurementUnit,
                  run.quotedTextPages,
                  run.coverPages,
                  run.textPaper,
                  run.coverPaper,
                  run.binding,
                  run.deliveryLocation,
                ].join(":")}
                run={run}
                measurementUnit={preferredMeasurementUnit}
                isHistorical={run.id !== latestRun?.id}
                projectSlug={projectSlug}
                finance={financeByRun.get(run.id) ?? null}
                canEdit={canEdit}
                contacts={contacts}
                pending={pending}
                quotes={quotesByRun.get(run.id) ?? []}
                payments={paymentsByRun.get(run.id) ?? []}
                quoteAttachments={quoteAttachments}
                paymentAttachments={paymentAttachments}
                proof={proofsByRun.get(run.id) ?? null}
                isPaymentPending={paymentChanges.isPending}
                hasRfqDraft={emailDrafts.some(
                  (draft) =>
                    draft.kind === "print_rfq" && draft.contextId === run.id
                )}
                hasWireDraft={(paymentId) =>
                  emailDrafts.some(
                    (draft) =>
                      draft.kind === "print_wire" &&
                      draft.contextId === paymentId
                  )
                }
                onDraftRfq={() => draftRfq(run.id)}
                onUpdate={(fields) =>
                  (() => {
                    const previous = runs;
                    setRuns((current) =>
                      current.map((item) =>
                        item.id === run.id ? { ...item, ...fields } : item
                      )
                    );
                    runAction(
                      () => updatePrintRun(run.id, fields),
                      () => setRuns(previous)
                    );
                  })()
                }
                onDelete={() => {
                  const previous = runs;
                  setRuns((current) => current.filter((item) => item.id !== run.id));
                  runAction(() => deletePrintRun(run.id), () => setRuns(previous));
                }}
                onAcceptQuote={(id) => {
                  const previousQuotes = quotes;
                  const previousRuns = runs;
                  const previousSettingsDraft = settingsDraft;
                  const accepted = quotes.find((quote) => quote.id === id);
                  const acceptedRun = accepted
                    ? runs.find((run) => run.id === accepted.runId)
                    : null;
                  const specPatch = accepted
                    ? quoteRunSpecPatch(accepted)
                    : {};
                  const isFinalPaymentDocument =
                    accepted?.kind === "final_invoice";
                  const targetPayment = accepted
                    ? payments.find(
                        (payment) =>
                          payment.runId === accepted.runId &&
                          invoiceFilePaymentKinds(accepted.kind).includes(
                            payment.kind as "deposit" | "final" | "full"
                          )
                      )
                    : null;
                  setQuotes((current) =>
                    current.map((quote) =>
                      quote.id === id
                        ? { ...quote, reviewStatus: "accepted" }
                        : quote
                    )
                  );
                  if (accepted && acceptedRun && !isFinalPaymentDocument) {
                    const contactId =
                      accepted.contactId ??
                      acceptedRun.contactId ??
                      (settingsDraft.contactId || null);
                    setRuns((current) =>
                      current.map((run) =>
                        run.id === accepted.runId
                          ? {
                              ...run,
                              ...specPatch,
                              status: "quote_received",
                              quantityTarget:
                                run.quantityTarget ??
                                accepted.quantityCps ??
                                null,
                              contactId,
                            }
                          : run
                      )
                    );
                    setSettingsDraft((draft) => ({
                      ...draft,
                      ...(specPatch.trimWidthIn
                        ? {
                            trimWidth: measurementInputFromInches(
                              specPatch.trimWidthIn,
                              draft.measurementUnit
                            ),
                          }
                        : {}),
                      ...(specPatch.trimHeightIn
                        ? {
                            trimHeight: measurementInputFromInches(
                              specPatch.trimHeightIn,
                              draft.measurementUnit
                            ),
                          }
                        : {}),
                      ...(contactId ? { contactId } : {}),
                    }));
                  }
                  runAction(
                    async () => {
                      const result = await acceptPrintQuote(id);
                      if (!result?.error && isFinalPaymentDocument) {
                        toast.success(
                          targetPayment
                            ? `Final invoice attached to ${targetPayment.kind} payment`
                            : "Final invoice accepted"
                        );
                      }
                      return result;
                    },
                    () => {
                      setQuotes(previousQuotes);
                      setRuns(previousRuns);
                      setSettingsDraft(previousSettingsDraft);
                    }
                  );
                }}
                onRejectQuote={(id) => {
                  const previous = quotes;
                  setQuotes((current) => current.map((quote) => quote.id === id ? { ...quote, reviewStatus: "rejected" } : quote));
                  runAction(() => rejectPrintQuote(id), () => setQuotes(previous));
                }}
                onReopenQuote={(id) => {
                  const previous = quotes;
                  setQuotes((current) => current.map((quote) => quote.id === id ? { ...quote, reviewStatus: "suggested" } : quote));
                  runAction(() => reopenPrintQuote(id), () => setQuotes(previous));
                }}
                onEditQuote={(id, fields) => {
                  const previous = quotes;
                  setQuotes((current) =>
                    current.map((quote) =>
                      quote.id === id ? { ...quote, ...fields } : quote
                    )
                  );
                  runAction(
                    () => updatePrintQuote(id, fields),
                    () => setQuotes(previous)
                  );
                }}
                onAddPayment={(fields) =>
                  runAction(() => addPrintPayment(run.id, fields))
                }
                onPaid={(id) => {
                  paymentChanges.run(
                    { type: "paid", id, paidAt: new Date().toISOString() },
                    () => markPrintPaymentPaid(id),
                    {
                      errorMessage: "The payment could not be marked paid.",
                      onSuccess: () => router.refresh(),
                    }
                  );
                }}
                onUnpaid={(id) => {
                  paymentChanges.run(
                    { type: "unpaid", id },
                    () => markPrintPaymentUnpaid(id),
                    {
                      errorMessage: "The payment could not be marked unpaid.",
                      onSuccess: () => router.refresh(),
                    }
                  );
                }}
                onDeletePayment={async (id) => {
                  if (!(await confirmDialog("Delete this print payment? This cannot be undone."))) return;
                  paymentChanges.run(
                    { type: "delete", id },
                    () => deletePrintPayment(id),
                    {
                      errorMessage: "The payment could not be deleted.",
                      onSuccess: () => router.refresh(),
                    }
                  );
                }}
                onDraftWire={draftWire}
              />
            ))
          )}
        </div>

        <aside className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4" />
                Parse quote text
              </CardTitle>
              <CardDescription>
                Paste copied PDF or email text; review before accepting.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                className={selectClass}
                value={quoteRunId}
                onChange={(e) => setQuoteRunId(e.target.value)}
              >
                <option value="">Choose run</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.title}
                  </option>
                ))}
              </select>
              <Textarea
                value={quoteText}
                rows={9}
                placeholder="Paste printer quote or invoice text..."
                onChange={(e) => setQuoteText(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={parseQuote}
                disabled={pending || !quoteRunId || !quoteText.trim()}
              >
                <Sparkles className="size-4" />
                Save for review
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="size-4" />
                Extract from file
              </CardTitle>
              <CardDescription>
                Upload an invoice PDF or a photo/screenshot; AI fills in quantity
                and pricing for review.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                className={selectClass}
                value={extractRunId}
                onChange={(e) => setExtractRunId(e.target.value)}
              >
                <option value="">Choose run</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.title}
                  </option>
                ))}
              </select>
              <input
                type="file"
                accept="application/pdf,image/*"
                disabled={extracting || pending || !extractRunId}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) extractFromFile(file);
                }}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted/50"
              />
              {extracting ? (
                <p className="text-xs text-muted-foreground">
                  Reading the invoice…
                </p>
              ) : null}
            </CardContent>
          </Card>

          {proofs.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="size-4" />
                  Proof files
                </CardTitle>
                <CardDescription>
                  PDF proofs received from the printer, newest first.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y rounded-lg border">
                  {proofs.map((proof) => (
                    <li
                      key={proof.attachmentId}
                      className="flex min-h-14 items-center gap-2 px-3 py-1.5 transition-colors hover:bg-muted/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {proof.originalName}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {[proof.runTitle, proof.receivedAt ? nowDate(proof.receivedAt) : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground md:inline">
                        {formatBytes(proof.sizeBytes)}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {canEdit ? (
                          <Link
                            href={`/correspondence/${proof.threadId}`}
                            className={cn(
                              buttonVariants({ variant: "ghost", size: "sm" }),
                              "min-h-11 px-2 sm:px-3"
                            )}
                            aria-label={`Open the email for ${proof.originalName}`}
                          >
                            <Mail className="size-4" />
                            <span className="hidden sm:inline">Email</span>
                          </Link>
                        ) : null}
                        <a
                          href={`/api/files/${proof.fileId}/download`}
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "sm" }),
                            "min-h-11 px-2 sm:px-3"
                          )}
                          aria-label={`Download ${proof.originalName}`}
                        >
                          <Download className="size-4" />
                          <span className="hidden sm:inline">Download</span>
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {canEdit ? <PrintCorrespondenceCard threads={threads} /> : null}
        </aside>
      </div>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  detail,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 font-heading text-lg font-semibold">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="block">
      {content}
    </a>
  ) : (
    content
  );
}

function MiniStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "over" | "under";
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-heading text-lg font-semibold tabular-nums",
          tone === "over" && "text-destructive",
          tone === "under" && "text-success",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  hint,
  help,
  children,
}: {
  label: React.ReactNode;
  hint?: string;
  /** Plain-language explanation shown in a "?" popover next to the label. */
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function RunPanel({
  run,
  measurementUnit,
  isHistorical,
  projectSlug,
  finance,
  contacts,
  canEdit,
  pending,
  quotes,
  payments,
  quoteAttachments,
  paymentAttachments,
  proof,
  isPaymentPending,
  hasRfqDraft,
  hasWireDraft,
  onDraftRfq,
  onUpdate,
  onDelete,
  onAcceptQuote,
  onRejectQuote,
  onReopenQuote,
  onEditQuote,
  onAddPayment,
  onPaid,
  onUnpaid,
  onDeletePayment,
  onDraftWire,
}: {
  run: Run;
  measurementUnit: MeasurementUnit;
  isHistorical: boolean;
  projectSlug: string;
  finance: RunFinance | null;
  contacts: Contact[];
  canEdit: boolean;
  pending: boolean;
  quotes: Quote[];
  payments: Payment[];
  quoteAttachments: AttachmentMap;
  paymentAttachments: AttachmentMap;
  proof: Proof | null;
  isPaymentPending: (paymentId: string) => boolean;
  hasRfqDraft: boolean;
  hasWireDraft: (paymentId: string) => boolean;
  onDraftRfq: () => void;
  onUpdate: (fields: Record<string, unknown>) => void;
  onDelete: () => void;
  onAcceptQuote: (id: string) => void;
  onRejectQuote: (id: string) => void;
  onReopenQuote: (id: string) => void;
  onEditQuote: (id: string, fields: Record<string, unknown>) => void;
  onAddPayment: (fields: {
    kind: "deposit" | "final" | "full" | "custom";
    amount: number;
    currency: string;
    notes?: string;
  }) => void;
  onPaid: (id: string) => void;
  onUnpaid: (id: string) => void;
  onDeletePayment: (id: string) => void;
  onDraftWire: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(isHistorical);
  const [editing, setEditing] = useState(false);
  const [qtyDraft, setQtyDraft] = useState("");
  const [showOtherQuotes, setShowOtherQuotes] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [quoteEdit, setQuoteEdit] = useState({
    quantityCps: "",
    unitPrice: "",
    totalAmount: "",
    trimWidth: "",
    trimHeight: "",
    textPages: "",
    coverPages: "",
    textSpec: "",
    coverSpec: "",
    binding: "",
    deliveryLocation: "",
    kind: "invoice",
  });
  const startEditQuote = (q: Quote) => {
    setEditingQuoteId(q.id);
    setQuoteEdit({
      quantityCps: q.quantityCps != null ? String(q.quantityCps) : "",
      unitPrice: q.unitPrice ?? "",
      totalAmount: q.totalAmount ?? "",
      trimWidth: measurementInputFromMm(q.trimWidthMm, measurementUnit),
      trimHeight: measurementInputFromMm(q.trimHeightMm, measurementUnit),
      textPages: q.textPages != null ? String(q.textPages) : "",
      coverPages: q.coverPages != null ? String(q.coverPages) : "",
      textSpec: q.textSpec ?? "",
      coverSpec: q.coverSpec ?? "",
      binding: q.binding ?? "",
      deliveryLocation: q.deliveryLocation ?? "",
      kind: q.kind,
    });
  };
  const [draft, setDraft] = useState({
    title: run.title,
    status: run.status,
    campaignStartDate: run.campaignStartDate ?? "",
    campaignDueDate: run.campaignDueDate ?? "",
    fundingGoal: run.fundingGoal ?? "",
    fundingCurrency: run.fundingCurrency,
    reprintReason: run.reprintReason ?? "",
    contactId: run.contactId ?? "",
    trimWidth: measurementInputFromInches(run.trimWidthIn, measurementUnit),
    trimHeight: measurementInputFromInches(run.trimHeightIn, measurementUnit),
    languageExpansionFactor: run.languageExpansionFactor,
    quotedTextPages: run.quotedTextPages ? String(run.quotedTextPages) : "",
    coverPages: String(run.coverPages),
    textPaper: run.textPaper ?? "",
    coverPaper: run.coverPaper ?? "",
    binding: run.binding ?? "",
    deliveryLocation: run.deliveryLocation,
    latestProofUrl: run.latestProofUrl ?? "",
    notes: run.notes ?? "",
  });
  const [paymentDraft, setPaymentDraft] = useState({
    kind: "custom" as "deposit" | "final" | "full" | "custom",
    amount: "",
    currency: "USD",
    notes: "",
  });

  const budgeted = finance?.budgeted || Number(run.fundingGoal) || 0;
  const committed = committedFundingTotal(
    finance?.lineRaised ?? 0,
    finance?.scheduled ?? 0,
    finance?.received ?? 0
  );
  const shortfall = Math.max(0, budgeted - committed);
  const financeCurrency =
    finance?.currency || run.fundingCurrency || paymentDraft.currency || "USD";
  const paidPayments = payments.filter((payment) => !!payment.paidAt);
  const paidTotal = paidPayments.reduce(
    (sum, payment) => sum + (Number(payment.amount) || 0),
    0
  );
  const allPaymentsPaid =
    payments.length > 0 && paidPayments.length === payments.length;
  const historicalState = allPaymentsPaid
    ? "Printer paid"
    : run.status === "completed"
      ? "Completed"
      : run.status.replaceAll("_", " ");
  const historicalSummary = [
    run.quantityTarget
      ? `${run.quantityTarget.toLocaleString()} copies`
      : null,
    run.quotedTextPages ? `${run.quotedTextPages} pages` : null,
    paidTotal > 0
      ? `${money(paidTotal, payments[0]?.currency || financeCurrency)} paid to printer`
      : null,
    run.deliveryLocation || null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Once a quote is accepted, keep the focus on it and tuck the alternatives
  // (suggested/rejected/other tiers) behind a toggle for a cleaner view.
  const acceptedQuotes = quotes.filter((q) => q.reviewStatus === "accepted");
  const otherQuotes = quotes.filter((q) => q.reviewStatus !== "accepted");
  const pendingInvoiceReviews = otherQuotes.filter(isPendingPrintInvoiceReview);
  const hiddenOtherQuotes = otherQuotes.filter(
    (quote) => !isPendingPrintInvoiceReview(quote)
  );
  const hasAccepted = acceptedQuotes.length > 0;
  const visibleQuotes = !hasAccepted
    ? quotes
    : showOtherQuotes
      ? [...acceptedQuotes, ...otherQuotes]
      : [...acceptedQuotes, ...pendingInvoiceReviews];

  return (
    <Card size={collapsed ? "sm" : "default"}>
      <CardHeader className="min-w-0 has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]">
        <CardTitle className="flex min-w-0 items-center gap-2">
          <BookCopy className="size-4 shrink-0" />
          <span className="min-w-0 break-words">{run.title}</span>
        </CardTitle>
        <CardDescription className="min-w-0 break-words">
          {isHistorical ? (
            historicalSummary || "Previous print details"
          ) : (
            <>
              {run.kind === "reprint" ? (
                <>Reprint {run.printNumber ?? ""} · </>
              ) : null}
              {run.contactCompany ||
                run.contactName ||
                "No printer selected"}{" "}
              · {formatTrimSize(
                run.trimWidthIn,
                run.trimHeightIn,
                measurementUnit
              )}{" "}
              · estimate{" "}
              {run.estimatedTextPages} pages
              {run.quantityTarget
                ? ` · ${run.quantityTarget.toLocaleString()} copies confirmed`
                : ""}
            </>
          )}
        </CardDescription>
        <CardAction className="col-start-1 row-start-auto row-span-1 mt-2 justify-self-stretch sm:col-start-2 sm:row-start-1 sm:row-span-2 sm:mt-0 sm:justify-self-end">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {isHistorical ? (
              <>
                <Badge variant="outline">Previous print</Badge>
                <Badge variant={allPaymentsPaid ? "default" : "secondary"}>
                  {historicalState}
                </Badge>
              </>
            ) : (
              <>
                {run.quantityTarget ? (
                  <Badge variant="secondary">
                    {run.quantityTarget.toLocaleString()} copies
                  </Badge>
                ) : null}
                {run.kind === "reprint" ? (
                  <Badge variant="outline">
                    {run.printNumber
                      ? `Reprint ${run.printNumber}`
                      : "Reprint"}
                  </Badge>
                ) : null}
                <Badge variant={statusVariant(run.status)}>
                  {run.status.replaceAll("_", " ")}
                </Badge>
              </>
            )}
            {isHistorical ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 sm:min-h-9"
                aria-expanded={!collapsed}
                onClick={() => setCollapsed((value) => !value)}
              >
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform motion-reduce:transition-none",
                    !collapsed && "rotate-180"
                  )}
                />
                {collapsed ? "Show details" : "Hide details"}
              </Button>
            ) : null}
          </div>
        </CardAction>
      </CardHeader>
      {!collapsed ? (
        <CardContent
          id={`print-run-${run.id}-details`}
          className="min-w-0 space-y-4"
        >
          {run.kind === "reprint" || finance ? (
            <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-5">
              <MiniStat
                label="Run budget"
                value={money(budgeted, financeCurrency)}
                hint={
                  run.fundingGoal
                    ? "Funding goal / accepted quote"
                    : "Scoped print budget"
                }
              />
              <MiniStat
                label="Committed"
                value={money(committed, financeCurrency)}
                hint="Funding promised or received"
                tone={shortfall > 0 ? "over" : "under"}
              />
              <MiniStat
                label="Funding received"
                value={money(finance?.received ?? 0, financeCurrency)}
                hint="Gross donations and MoU receipts"
              />
              <MiniStat
                label="Available"
                value={money(finance?.available ?? 0, financeCurrency)}
                hint="Expected or actual net after the organization donation fee"
              />
              <MiniStat
                label="Printer paid"
                value={money(finance?.spent ?? 0, financeCurrency)}
                hint="Payments marked paid"
              />
            </div>
          ) : null}
          {run.kind === "reprint" && shortfall > 0 ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
              Reprint shortfall: {money(shortfall, financeCurrency)} still needs
              sponsor commitment, MoU receivable, or donation.
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
            {run.kind === "reprint" ? (
              <Spec
                label="Campaign due"
                value={run.campaignDueDate ?? "No due date"}
              />
            ) : null}
            <Spec
              label="Quantity"
              value={
                run.quantityTarget
                  ? `${run.quantityTarget.toLocaleString()} copies`
                  : "Not confirmed"
              }
            />
            <Spec
              label="Quoted pages"
              value={run.quotedTextPages ?? "Not quoted"}
            />
            <Spec label="Cover pages" value={run.coverPages} />
            <Spec label="Delivery" value={run.deliveryLocation} />
            <Spec
              label="Proof"
              value={
                proof ? (
                  <a
                    href={`/api/files/${proof.fileId}/download`}
                    className="text-primary hover:underline"
                  >
                    Download PDF
                  </a>
                ) : run.latestProofUrl ? (
                  <a
                    href={run.latestProofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    Open link
                  </a>
                ) : (
                  "None"
                )
              }
            />
          </div>

        {canEdit ? (
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Confirm quantity
              </span>
              {(run.requestedQuantities ?? [1000, 2000, 3000, 4000, 5000]).map(
                (n) => (
                  <Button
                    key={n}
                    type="button"
                    size="xs"
                    variant={n === run.quantityTarget ? "default" : "outline"}
                    onClick={() => onUpdate({ quantityTarget: n })}
                    disabled={pending}
                  >
                    {n.toLocaleString()}
                  </Button>
                ),
              )}
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={1}
                  placeholder="Custom"
                  className="h-7 w-24"
                  value={qtyDraft}
                  onChange={(e) => setQtyDraft(e.target.value)}
                />
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={pending || !(Number(qtyDraft) > 0)}
                  onClick={() => {
                    const n = Number(qtyDraft);
                    if (n > 0) {
                      onUpdate({ quantityTarget: n });
                      setQtyDraft("");
                    }
                  }}
                >
                  Set
                </Button>
              </div>
              {run.quantityTarget ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => onUpdate({ quantityTarget: null })}
                >
                  Clear
                </Button>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {run.quantityTarget
                ? `${run.quantityTarget.toLocaleString()} copies confirmed for this run.`
                : "Pick the tier you are printing, or accept an invoice to set it automatically."}
            </p>
          </div>
        ) : null}

        {editing ? (
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-3">
            <Field label="Title">
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <select
                className={selectClass}
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                <option value="planning">Planning</option>
                <option value="seeking_funding">Seeking funding</option>
                <option value="quote_requested">Quote requested</option>
                <option value="quote_received">Quote received</option>
                <option value="proofing">Proofing</option>
                <option value="awaiting_payment">Awaiting payment</option>
                <option value="printing">Printing</option>
                <option value="shipping">Shipping</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>
            {run.kind === "reprint" ? (
              <>
                <Field label="Campaign start">
                  <Input
                    type="date"
                    value={draft.campaignStartDate}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        campaignStartDate: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Campaign due">
                  <Input
                    type="date"
                    value={draft.campaignDueDate}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        campaignDueDate: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Funding goal">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.fundingGoal}
                    onChange={(e) =>
                      setDraft({ ...draft, fundingGoal: e.target.value })
                    }
                  />
                </Field>
              </>
            ) : null}
            <Field label="Printer">
              <select
                className={selectClass}
                value={draft.contactId}
                onChange={(e) => setDraft({ ...draft, contactId: e.target.value })}
              >
                <option value="">No printer</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.company || contact.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quoted pages">
              <Input
                type="number"
                value={draft.quotedTextPages}
                onChange={(e) =>
                  setDraft({ ...draft, quotedTextPages: e.target.value })
                }
              />
            </Field>
            <Field label={`Trim width (${measurementUnit})`}>
              <Input
                type="number"
                step="0.01"
                value={draft.trimWidth}
                onChange={(e) => setDraft({ ...draft, trimWidth: e.target.value })}
              />
            </Field>
            <Field label={`Trim height (${measurementUnit})`}>
              <Input
                type="number"
                step="0.01"
                value={draft.trimHeight}
                onChange={(e) =>
                  setDraft({ ...draft, trimHeight: e.target.value })
                }
              />
            </Field>
            <Field label="Language expansion factor">
              <Input
                type="number"
                step="0.01"
                value={draft.languageExpansionFactor}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    languageExpansionFactor: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Text paper">
              <Input
                value={draft.textPaper}
                onChange={(e) => setDraft({ ...draft, textPaper: e.target.value })}
              />
            </Field>
            <Field label="Cover paper">
              <Input
                value={draft.coverPaper}
                onChange={(e) =>
                  setDraft({ ...draft, coverPaper: e.target.value })
                }
              />
            </Field>
            <Field label="Binding">
              <Input
                value={draft.binding}
                onChange={(e) => setDraft({ ...draft, binding: e.target.value })}
              />
            </Field>
            <div className="sm:col-span-3">
              <Field label="Proof link">
                <Input
                  value={draft.latestProofUrl}
                  onChange={(e) =>
                    setDraft({ ...draft, latestProofUrl: e.target.value })
                  }
                />
              </Field>
            </div>
            {run.kind === "reprint" ? (
              <div className="sm:col-span-3">
                <Field label="Reprint reason / sponsor notes">
                  <Textarea
                    rows={2}
                    value={draft.reprintReason}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        reprintReason: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 sm:col-span-3">
              <Button
                onClick={() => {
                  onUpdate({
                    title: draft.title,
                    status: draft.status,
                    campaignStartDate: draft.campaignStartDate || null,
                    campaignDueDate: draft.campaignDueDate || null,
                    fundingGoal: draft.fundingGoal
                      ? Number(draft.fundingGoal)
                      : null,
                    fundingCurrency: draft.fundingCurrency,
                    reprintReason: draft.reprintReason || undefined,
                    contactId: draft.contactId || null,
                    languageExpansionFactor: draft.languageExpansionFactor,
                    trimWidthIn: measurementToInches(
                      draft.trimWidth,
                      measurementUnit
                    ),
                    trimHeightIn: measurementToInches(
                      draft.trimHeight,
                      measurementUnit
                    ),
                    quotedTextPages: draft.quotedTextPages
                      ? Number(draft.quotedTextPages)
                      : null,
                    coverPages: Number(draft.coverPages),
                    textPaper: draft.textPaper,
                    coverPaper: draft.coverPaper,
                    binding: draft.binding,
                    deliveryLocation: draft.deliveryLocation,
                    latestProofUrl: draft.latestProofUrl,
                    notes: draft.notes,
                  });
                  setEditing(false);
                }}
                disabled={pending}
              >
                Save run
              </Button>
              <Button
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onDraftRfq} disabled={pending}>
                  <Mail className="size-4" />
                  {hasRfqDraft ? "Resume RFQ email" : "Review RFQ email"}
                </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing((v) => !v)}
              disabled={pending}
            >
              <Settings2 className="size-4" />
              Edit specs
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if ((await confirmDialog(`Delete print run "${run.title}"?`))) onDelete();
              }}
              disabled={pending}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Quotes and invoices</h3>
          {!hasAccepted || showOtherQuotes ? (
            <QuoteComparison quotes={quotes} />
          ) : null}
          {quotes.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-background/50 p-3 text-sm text-muted-foreground">
              No quote records yet.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {visibleQuotes.map((quote) => {
                const total = getPrintQuoteTotal(quote);
                const effectiveUnitPrice =
                  quote.quantityCps && total
                    ? total.totalCost / quote.quantityCps
                    : Number(quote.unitPrice) || null;
                const trimLabel = quoteTrimLabel(quote, measurementUnit);
                const hasProductionSpecs = quoteHasProductionSpecs(quote);
                const invoicePaymentKinds = invoiceFilePaymentKinds(quote.kind);
                const targetPayment = payments.find(
                  (payment) =>
                    invoicePaymentKinds.includes(
                      payment.kind as "deposit" | "final" | "full"
                    )
                );
                const isFinalPaymentReview =
                  quote.kind === "final_invoice" &&
                  quote.reviewStatus !== "accepted";
                const quoteTitle =
                  quote.title ||
                  quote.invoiceNumber ||
                  (quote.kind === "final_invoice"
                    ? "Final invoice received"
                    : quote.kind === "deposit_invoice"
                      ? "Deposit invoice received"
                      : "Print quote");
                const targetPaymentName = targetPayment
                  ? `${targetPayment.kind[0].toUpperCase()}${targetPayment.kind.slice(1)} Payment`
                  : "Final Payment";

                return (
                  <li key={quote.id} className="space-y-2 px-3 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {quoteTitle}
                          </span>
                          <Badge variant={statusVariant(quote.reviewStatus)}>
                            {isFinalPaymentReview
                              ? "review needed"
                              : quote.reviewStatus}
                          </Badge>
                          <Badge variant="outline">
                            {quote.kind.replaceAll("_", " ")}
                          </Badge>
                        </div>
                        <div className="mt-2 grid gap-1 text-xs sm:flex sm:flex-wrap sm:gap-x-5">
                          <span className="text-muted-foreground">
                            {quote.quantityCps
                              ? `${quote.quantityCps.toLocaleString()} copies`
                              : "Quantity TBD"}
                          </span>
                          {total ? (
                            <span>
                              <span className="text-muted-foreground">
                                Total print cost{" "}
                              </span>
                              <strong className="font-semibold tabular-nums">
                                {money(total.totalCost, quote.currency)}
                              </strong>
                              {total.calculated ? (
                                <span className="text-muted-foreground">
                                  {" "}(calculated)
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                          {effectiveUnitPrice ? (
                            <span className="tabular-nums text-muted-foreground">
                              {money(effectiveUnitPrice, quote.currency)} per copy
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {quote.textPages ? `${quote.textPages} text pages` : ""}
                          {quote.paymentTerms
                            ? ` · ${quote.paymentTerms}`
                            : ""}
                        </p>
                        {hasProductionSpecs ? (
                          <dl className="mt-2 grid gap-2 rounded-lg bg-muted/35 px-3 py-2 text-xs sm:grid-cols-2 sm:gap-x-5 sm:gap-y-1">
                            {trimLabel ? (
                              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-1.5">
                                <dt className="shrink-0 font-medium text-foreground">
                                  Trim
                                </dt>
                                <dd className="min-w-0 text-muted-foreground">
                                  {trimLabel}
                                </dd>
                              </div>
                            ) : null}
                            {quote.coverPages != null ? (
                              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-1.5">
                                <dt className="shrink-0 font-medium text-foreground">
                                  Cover
                                </dt>
                                <dd className="min-w-0 text-muted-foreground">
                                  {quote.coverPages} pages
                                </dd>
                              </div>
                            ) : null}
                            {quote.textSpec ? (
                              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-1.5 sm:col-span-2">
                                <dt className="shrink-0 font-medium text-foreground">
                                  Text
                                </dt>
                                <dd className="min-w-0 break-words text-muted-foreground">
                                  {quote.textSpec}
                                </dd>
                              </div>
                            ) : null}
                            {quote.coverSpec ? (
                              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-1.5 sm:col-span-2">
                                <dt className="shrink-0 font-medium text-foreground">
                                  Cover
                                </dt>
                                <dd className="min-w-0 break-words text-muted-foreground">
                                  {quote.coverSpec}
                                </dd>
                              </div>
                            ) : null}
                            {quote.binding ? (
                              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-1.5">
                                <dt className="shrink-0 font-medium text-foreground">
                                  Binding
                                </dt>
                                <dd className="min-w-0 break-words text-muted-foreground">
                                  {quote.binding}
                                </dd>
                              </div>
                            ) : null}
                            {quote.deliveryLocation ? (
                              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-1.5">
                                <dt className="shrink-0 font-medium text-foreground">
                                  Delivery
                                </dt>
                                <dd className="min-w-0 break-words text-muted-foreground">
                                  {quote.deliveryLocation}
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                        ) : null}
                        {isFinalPaymentReview ? (
                          <div className="mt-2 rounded-lg border bg-muted/25 px-3 py-2 text-xs">
                            <p className="font-medium">
                              Use this invoice for {targetPaymentName}
                            </p>
                            <p className="mt-0.5 text-muted-foreground">
                              {targetPayment
                                ? `This attaches the PDF to the existing ${money(targetPayment.amount, targetPayment.currency)} payment. Its amount and the accepted print specs won’t change.`
                                : "This attaches the PDF to the final payment. It won’t replace the accepted print specs."}
                            </p>
                          </div>
                        ) : null}
                      </div>
                      {canEdit ? (
                        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:flex-wrap sm:gap-1">
                          {quote.reviewStatus === "accepted" ? (
                            <Button
                              variant="outline"
                              size="xs"
                              className="min-h-11 justify-center sm:min-h-0"
                              onClick={() => onReopenQuote(quote.id)}
                              disabled={pending}
                            >
                              <RotateCcw className="size-3.5" />
                              Reopen
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="xs"
                                className="col-span-2 min-h-11 justify-center sm:col-span-1 sm:min-h-0"
                                onClick={() => onAcceptQuote(quote.id)}
                                disabled={pending}
                              >
                                <CheckCircle2 className="size-3.5" />
                                {isFinalPaymentReview
                                  ? "Use for final payment"
                                  : hasProductionSpecs
                                    ? "Accept & apply specs"
                                    : "Accept"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                className="min-h-11 justify-center sm:min-h-0"
                                onClick={() =>
                                  editingQuoteId === quote.id
                                    ? setEditingQuoteId(null)
                                    : startEditQuote(quote)
                                }
                                disabled={pending}
                              >
                                <Pencil className="size-3.5" />
                                Edit
                              </Button>
                            </>
                          )}
                          {quote.reviewStatus !== "rejected" ? (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="min-h-11 justify-center sm:min-h-0"
                              onClick={() => onRejectQuote(quote.id)}
                              disabled={pending}
                            >
                              Reject
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {quote.reviewFlags && quote.reviewFlags.length > 0 ? (
                      <div className="rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2 text-xs dark:border-amber-900/60 dark:bg-amber-950/20">
                        <p className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="size-3.5" />
                          Check these fields before accepting
                        </p>
                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                          {quote.reviewFlags.map((flag, i) => (
                            <li key={`${flag.field}-${flag.kind}-${i}`}>
                              <span className="font-medium text-foreground">
                                {flag.field.replace(/^_/, "")}
                              </span>
                              : {flag.note ?? flagLabel(flag.kind)}
                              {flag.regexValue != null && flag.aiValue != null ? (
                                <span>
                                  {" "}
                                  (AI {flag.aiValue} vs parser {flag.regexValue})
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  {canEdit && editingQuoteId === quote.id ? (
                    <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="Kind">
                        <select
                          className={selectClass}
                          value={quoteEdit.kind}
                          onChange={(e) =>
                            setQuoteEdit({ ...quoteEdit, kind: e.target.value })
                          }
                        >
                          <option value="quote">Quote</option>
                          <option value="invoice">Invoice</option>
                          <option value="deposit_invoice">Deposit invoice</option>
                          <option value="final_invoice">Final invoice</option>
                        </select>
                      </Field>
                      <Field label="Quantity (cps)">
                        <Input
                          type="number"
                          value={quoteEdit.quantityCps}
                          onChange={(e) =>
                            setQuoteEdit({
                              ...quoteEdit,
                              quantityCps: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Unit price">
                        <Input
                          type="number"
                          step="0.001"
                          value={quoteEdit.unitPrice}
                          onChange={(e) =>
                            setQuoteEdit({ ...quoteEdit, unitPrice: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Total">
                        <Input
                          type="number"
                          step="0.01"
                          value={quoteEdit.totalAmount}
                          onChange={(e) =>
                            setQuoteEdit({
                              ...quoteEdit,
                              totalAmount: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Text pages">
                        <Input
                          type="number"
                          value={quoteEdit.textPages}
                          onChange={(e) =>
                            setQuoteEdit({ ...quoteEdit, textPages: e.target.value })
                          }
                        />
                      </Field>
                      <Field label={`Trim width (${measurementUnit})`}>
                        <Input
                          type="number"
                          step="0.01"
                          value={quoteEdit.trimWidth}
                          onChange={(e) =>
                            setQuoteEdit({
                              ...quoteEdit,
                              trimWidth: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label={`Trim height (${measurementUnit})`}>
                        <Input
                          type="number"
                          step="0.01"
                          value={quoteEdit.trimHeight}
                          onChange={(e) =>
                            setQuoteEdit({
                              ...quoteEdit,
                              trimHeight: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Cover pages">
                        <Input
                          type="number"
                          value={quoteEdit.coverPages}
                          onChange={(e) =>
                            setQuoteEdit({
                              ...quoteEdit,
                              coverPages: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Text stock / spec">
                        <Input
                          value={quoteEdit.textSpec}
                          onChange={(e) =>
                            setQuoteEdit({
                              ...quoteEdit,
                              textSpec: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Cover stock / spec">
                        <Input
                          value={quoteEdit.coverSpec}
                          onChange={(e) =>
                            setQuoteEdit({
                              ...quoteEdit,
                              coverSpec: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Binding">
                        <Input
                          value={quoteEdit.binding}
                          onChange={(e) =>
                            setQuoteEdit({
                              ...quoteEdit,
                              binding: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Delivery">
                        <Input
                          value={quoteEdit.deliveryLocation}
                          onChange={(e) =>
                            setQuoteEdit({
                              ...quoteEdit,
                              deliveryLocation: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <div className="flex items-end gap-2">
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => {
                            onEditQuote(quote.id, {
                              kind: quoteEdit.kind,
                              quantityCps: quoteEdit.quantityCps
                                ? Number(quoteEdit.quantityCps)
                                : null,
                              unitPrice: quoteEdit.unitPrice
                                ? Number(quoteEdit.unitPrice)
                                : null,
                              totalAmount: quoteEdit.totalAmount
                                ? Number(quoteEdit.totalAmount)
                                : null,
                              textPages: quoteEdit.textPages
                                ? Number(quoteEdit.textPages)
                                : null,
                              trimWidthMm: quoteEdit.trimWidth
                                ? measurementInputToMm(
                                    quoteEdit.trimWidth,
                                    measurementUnit
                                  )
                                : null,
                              trimHeightMm: quoteEdit.trimHeight
                                ? measurementInputToMm(
                                    quoteEdit.trimHeight,
                                    measurementUnit
                                  )
                                : null,
                              coverPages: quoteEdit.coverPages
                                ? Number(quoteEdit.coverPages)
                                : null,
                              textSpec: quoteEdit.textSpec || null,
                              coverSpec: quoteEdit.coverSpec || null,
                              binding: quoteEdit.binding || null,
                              deliveryLocation:
                                quoteEdit.deliveryLocation || null,
                            });
                            setEditingQuoteId(null);
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => setEditingQuoteId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <FileAttachments
                    targetType="print_quote"
                    targetId={quote.id}
                    attachments={quoteAttachments[quote.id] ?? []}
                    canEdit={canEdit}
                  />
                </li>
                );
              })}
            </ul>
          )}
          {hasAccepted && hiddenOtherQuotes.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowOtherQuotes((v) => !v)}
              aria-expanded={showOtherQuotes}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed bg-background/50 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  showOtherQuotes ? "rotate-180" : "",
                )}
              />
              {showOtherQuotes
                ? "Hide other quotes"
                : `Show ${hiddenOtherQuotes.length} other ${
                    hiddenOtherQuotes.length === 1 ? "quote" : "quotes"
                  }`}
            </button>
          ) : null}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Payments</h3>
          {payments.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-background/50 p-3 text-sm text-muted-foreground">
              Accept a quote to create deposit/final payments, or add one manually.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  id={`payment-${payment.id}`}
                  className="scroll-mt-24 space-y-2 px-3 py-3"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 w-full flex-1 sm:w-auto">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium capitalize">
                          {payment.kind} payment
                        </span>
                        <Badge variant={statusVariant(payment.status)}>
                          {payment.paidAt ? "paid" : payment.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {payment.dueDate ? `Due ${payment.dueDate}` : "No due date"}
                        {payment.wireRequestedAt
                          ? ` · requested ${nowDate(payment.wireRequestedAt)}`
                          : ""}
                        {payment.notes ? ` · ${payment.notes}` : ""}
                      </p>
                      {payment.taskId ? (
                        <Link
                          href={`/projects/${projectSlug}/tasks?run=${payment.runId}&task=${payment.taskId}`}
                          className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <SquareCheckBig className="size-3.5" />
                          {payment.taskAssigneeName ?? "Payment task"} ·{" "}
                          {paymentTaskStatusLabel(payment.taskStatus)}
                        </Link>
                      ) : null}
                    </div>
                    <div className="flex w-full items-center justify-between gap-2 sm:contents">
                      <span className="font-medium tabular-nums">
                        {money(payment.amount, payment.currency)}
                      </span>
                      {canEdit ? (
                        <div className="flex shrink-0 flex-wrap gap-1">
                          {!payment.paidAt ? (
                            <>
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => onDraftWire(payment.id)}
                                disabled={pending || isPaymentPending(payment.id)}
                              >
                                <Send className="size-3.5" />
                                {hasWireDraft(payment.id)
                                  ? "Resume wire email"
                                  : "Wire email"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Mark paid"
                                onClick={() => onPaid(payment.id)}
                                disabled={pending || isPaymentPending(payment.id)}
                              >
                                <CheckCircle2 className="size-4" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Mark unpaid"
                              onClick={() => onUnpaid(payment.id)}
                              disabled={pending || isPaymentPending(payment.id)}
                            >
                              <RotateCcw className="size-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Delete payment"
                            onClick={() => onDeletePayment(payment.id)}
                            disabled={pending || isPaymentPending(payment.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <FileAttachments
                    targetType="print_payment"
                    targetId={payment.id}
                    attachments={paymentAttachments[payment.id] ?? []}
                    canEdit={canEdit}
                    label="invoice"
                    emptyText="No invoice attached yet."
                  />
                </li>
              ))}
            </ul>
          )}

          {canEdit ? (
            <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[9rem_8rem_1fr_auto]">
              <select
                className={selectClass}
                value={paymentDraft.kind}
                onChange={(e) =>
                  setPaymentDraft({
                    ...paymentDraft,
                    kind: e.target.value as typeof paymentDraft.kind,
                  })
                }
              >
                <option value="deposit">Deposit</option>
                <option value="final">Final</option>
                <option value="full">Full</option>
                <option value="custom">Custom</option>
              </select>
              <Input
                placeholder="Amount"
                type="number"
                step="0.01"
                value={paymentDraft.amount}
                onChange={(e) =>
                  setPaymentDraft({ ...paymentDraft, amount: e.target.value })
                }
              />
              <Input
                placeholder="Notes"
                value={paymentDraft.notes}
                onChange={(e) =>
                  setPaymentDraft({ ...paymentDraft, notes: e.target.value })
                }
              />
              <Button
                variant="outline"
                onClick={() => {
                  const amount = Number(paymentDraft.amount);
                  if (!amount || amount <= 0) {
                    toast.error("Enter a payment amount.");
                    return;
                  }
                  onAddPayment({
                    kind: paymentDraft.kind,
                    amount,
                    currency: paymentDraft.currency,
                    notes: paymentDraft.notes || undefined,
                  });
                  setPaymentDraft({
                    kind: "custom",
                    amount: "",
                    currency: "USD",
                    notes: "",
                  });
                }}
                disabled={pending}
              >
                <Plus className="size-4" />
                Add
              </Button>
            </div>
          ) : null}
        </section>
        </CardContent>
      ) : null}
    </Card>
  );
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border bg-background/50 p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value}</p>
    </div>
  );
}
