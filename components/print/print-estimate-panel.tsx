"use client";

import { useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Loader2, Mail, Plus, Send } from "lucide-react";
import { Combobox } from "@base-ui/react/combobox";
import { toast } from "sonner";
import { draftPrintEstimate } from "@/lib/print/estimate-actions";
import { selectPrintEstimateQuote } from "@/lib/print/estimate-review-actions";
import {
  createQuoteFromFile,
  createQuoteFromText,
  rejectPrintQuote,
  sendPrintRfq,
} from "@/lib/print/actions";
import { saveEmailDraft } from "@/lib/email/draft-actions";
import type { EmailDraftDTO } from "@/lib/email/draft-types";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { uploadFile } from "@/lib/files/upload-client";
import { MAX_REFERENCE_PDF_BYTES } from "@/lib/print/estimate-policy";
import { getPrintQuoteTotal } from "@/lib/print/quote-economics";
import type { PrintReviewFlag } from "@/lib/print/review-flags";
import { confirmDialog } from "@/lib/dialog-requests";
import {
  OutgoingAttachmentReview,
  type OutgoingEmailAttachment,
} from "@/components/email/outgoing-attachment-review";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  formatTrimSize, measurementInputFromInches, measurementToInches,
  measurementUnit as parseMeasurementUnit, type MeasurementUnit,
} from "@/lib/print/estimate";
import { suggestedBookSpecs, type PrintSpecPreset } from "@/lib/print/spec-presets";

export type EstimateRequest = {
  id: string;
  status: string;
  contactName: string;
  pageCount: number;
  quantities: number[];
  referenceFileId: string | null;
  attachment: OutgoingEmailAttachment | null;
  draft: EmailDraftDTO | null;
};
export type EstimateQuote = {
  id: string;
  runId: string;
  reviewStatus: string;
  quantityCps: number | null;
  unitPrice: string | null;
  totalAmount: string | null;
  currency: string;
  textPages: number | null;
  textSpec: string | null;
  coverSpec: string | null;
  binding: string | null;
  paymentTerms: string | null;
  sourceThreadId: string | null;
  reviewFlags: PrintReviewFlag[];
};
const ESTIMATE_REVIEW_HINTS: Record<PrintReviewFlag["kind"], string> = {
  regex_disagrees: "The quote could be read in more than one way. Check the quantities, prices, and specifications against the original.",
  regex_recovered: "Check the quoted title, quantities, prices, and specifications against the original before using this estimate.",
  computed_total_mismatch: "The total does not match copies × price per copy. Confirm the total with the printer.",
  payment_split_mismatch: "The deposit and balance do not add up to the total. Check the full printing cost.",
  currency_defaulted: "The quote did not state a currency. Confirm the currency with the printer.",
  ambiguous_date: "The quote date is ambiguous. Check the date and whether the price is still valid.",
  ai_failed: "Some quote details could not be verified. Check all quantities, prices, and specifications against the original.",
};

type Composer = {
  runId: string;
  referenceFileId: string | null;
  attachment: OutgoingEmailAttachment | null;
  draft: EmailDraftDTO;
};

export function PrintEstimatePanel({
  projectId,
  contacts,
  defaultContactId,
  estimatedPages,
  trimWidthIn,
  trimHeightIn,
  measurementUnit,
  specPresets,
  requests,
  quotes,
}: {
  projectId: string;
  contacts: { id: string; name: string; email: string | null }[];
  defaultContactId: string | null;
  estimatedPages: number;
  trimWidthIn: string;
  trimHeightIn: string;
  measurementUnit: MeasurementUnit;
  specPresets: PrintSpecPreset[];
  requests: EstimateRequest[];
  quotes: EstimateQuote[];
}) {
  const router = useRouter();
  const rejected = useOptimisticAction<EstimateQuote[], string>({
    state: quotes,
    getKey: (id) => id,
    update: (current, id) => current.filter((quote) => quote.id !== id),
  });
  const visibleQuotes = rejected.state;
  const prefix = useId();
  const [pending, start] = useTransition();
  const [operation, setOperation] = useState("");
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState(
    defaultContactId ?? contacts.find((c) => c.email)?.id ?? "",
  );
  const [pages, setPages] = useState(String(estimatedPages || ""));
  const [quantities, setQuantities] = useState("1000, 2000, 3000");
  const suggestion = suggestedBookSpecs(specPresets, projectId);
  const [specSource, setSpecSource] = useState(suggestion);
  const [selectedPreset, setSelectedPreset] = useState<PrintSpecPreset | null>(null);
  const [sizeCopied, setSizeCopied] = useState(false);
  const [unit, setUnit] = useState(measurementUnit);
  const [width, setWidth] = useState(() => measurementInputFromInches(trimWidthIn, measurementUnit));
  const [height, setHeight] = useState(() => measurementInputFromInches(trimHeightIn, measurementUnit));
  const [textPaper, setTextPaper] = useState(suggestion?.textPaper ?? "");
  const [coverPaper, setCoverPaper] = useState(suggestion?.coverPaper ?? "");
  const [binding, setBinding] = useState(suggestion?.binding ?? "");
  const [notes, setNotes] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const uploaded = useRef<{ file: File; id: string } | null>(null);
  const [compose, setCompose] = useState<Composer | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState(true);
  const [importRun, setImportRun] = useState("");
  const [reply, setReply] = useState("");

  function copySpecs(preset: PrintSpecPreset | null) {
    setSelectedPreset(preset);
    if (!preset) return;
    setSizeCopied(true);
    setSpecSource(preset);
    setWidth(measurementInputFromInches(preset.trimWidthIn, unit));
    setHeight(measurementInputFromInches(preset.trimHeightIn, unit));
    setTextPaper(preset.textPaper ?? "");
    setCoverPaper(preset.coverPaper ?? "");
    setBinding(preset.binding ?? "");
  }

  function changeUnit(next: MeasurementUnit) {
    setWidth(measurementInputFromInches(measurementToInches(width, unit), next));
    setHeight(measurementInputFromInches(measurementToInches(height, unit), next));
    setUnit(next);
  }

  function run(label: string, action: () => Promise<void>) {
    if (pending) return;
    setOperation(label);
    start(async () => {
      try {
        await action();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not complete this action. Your input is preserved; please try again.",
        );
      } finally {
        setOperation("");
      }
    });
  }
  function edit(patch: Partial<EmailDraftDTO>) {
    setCompose((current) =>
      current ? { ...current, draft: { ...current.draft, ...patch } } : null,
    );
    setConfirmed(false);
    setSaved(false);
  }
  async function prepare() {
    const requestedWidth = measurementToInches(width, unit);
    const requestedHeight = measurementToInches(height, unit);
    if (requestedWidth < 1 || requestedWidth > 20 || requestedHeight < 1 || requestedHeight > 20) {
      toast.error("Enter a book width and height between 1 and 20 inches (25.4–508 mm).");
      return;
    }
    const tiers = quantities
      .split(/[,;\s]+/)
      .filter(Boolean)
      .map(Number);
    if (
      !Number.isInteger(Number(pages)) ||
      Number(pages) < 1 ||
      Number(pages) > 10000 ||
      !tiers.length ||
      tiers.length > 12 ||
      tiers.some((n) => !Number.isInteger(n) || n <= 0 || n > 10000000)
    ) {
      toast.error("Enter a positive page count and up to 12 copy quantities.");
      return;
    }
    let referenceFileId = null;
    if (pdf) {
      if (uploaded.current?.file === pdf) referenceFileId = uploaded.current.id;
      else {
        referenceFileId = await uploadFile(pdf);
        if (!referenceFileId) return;
        uploaded.current = { file: pdf, id: referenceFileId };
      }
    }
    const result = await draftPrintEstimate(projectId, {
      contactId,
      pageCount: Number(pages),
      trimWidthIn: requestedWidth,
      trimHeightIn: requestedHeight,
      quantities: tiers,
      referenceFileId,
      textPaper,
      coverPaper,
      binding,
      notes,
    });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setCompose(result);
    setOpen(false);
    setConfirmed(false);
    setSaved(true);
    router.refresh();
  }
  const selected = visibleQuotes.find((q) => q.reviewStatus === "estimated");
  const selectedTotal = selected
    ? getPrintQuoteTotal(selected)?.totalCost
    : null;

  return (
    <Card id="print-budget-estimate">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle>Estimated printing cost</CardTitle>
            <CardDescription>
              Ask a printer for a planning quote before the book is ready to
              print. Available during proposals and active projects.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={pending || !!compose}
            onClick={() => setOpen((v) => !v)}
          >
            <Plus className="size-4" />
            {open ? "Close request form" : "Request estimate"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          {selected && selectedTotal
            ? `Selected estimate: ${selected.currency} ${selectedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} for ${selected.quantityCps?.toLocaleString() ?? "the quoted"} copies. `
            : "No printer estimate selected. "}
          A reviewed first-print quote takes precedence in the budget. Estimates
          never create payments or actual spend.
        </p>
        {open ? (
          <form
            className="space-y-4 rounded-lg border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              run("Preparing draft…", prepare);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-same-specs`}>Same specs as…</Label>
              <Combobox.Root items={specPresets} value={selectedPreset}
                itemToStringLabel={book => book.projectTitle} isItemEqualToValue={(a, b) => a.id === b.id}
                onValueChange={copySpecs} disabled={pending || !specPresets.length}>
                <div className="relative max-w-xl">
                  <Combobox.Input id={`${prefix}-same-specs`} placeholder="Search books with saved specs…"
                    className="h-11 w-full rounded-md border border-input bg-background pl-3 pr-11 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 sm:text-sm" />
                  <Combobox.Trigger type="button" aria-label="Show books with saved specs" className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"><ChevronsUpDown aria-hidden className="size-4" /></Combobox.Trigger>
                </div>
                <Combobox.Portal><Combobox.Positioner sideOffset={4} className="isolate z-50">
                  <Combobox.Popup className="max-h-[min(20rem,var(--available-height))] w-[var(--anchor-width)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                    <Combobox.Empty className="p-3 text-sm text-muted-foreground">No matching books with saved specifications.</Combobox.Empty>
                    <Combobox.List>{(book: PrintSpecPreset) => <Combobox.Item key={book.id} value={book} className="flex min-h-11 cursor-default items-start justify-between gap-3 rounded-sm px-3 py-2.5 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground">
                      <span className="min-w-0 break-words"><span className="block font-medium">{book.projectTitle}</span><span className="mt-1 block text-xs text-muted-foreground">{[formatTrimSize(book.trimWidthIn, book.trimHeightIn, unit), book.textPaper, book.coverPaper, book.binding].filter(Boolean).join(" · ")}</span></span>
                      <Combobox.ItemIndicator><Check aria-hidden className="size-4 shrink-0" /></Combobox.ItemIndicator>
                    </Combobox.Item>}</Combobox.List>
                  </Combobox.Popup>
                </Combobox.Positioner></Combobox.Portal>
              </Combobox.Root>
              <p className="text-xs text-muted-foreground">{specSource
                ? sizeCopied ? `Specs copied from ${specSource.projectTitle}. You can change every field below.` : `Paper, cover, and binding prefilled from ${specSource.projectTitle}. Your project's book size is kept.`
                : "No saved book specifications yet. Enter them below to start."}</p>
              <p className="text-xs text-muted-foreground">Choosing a book copies size, paper, cover, and binding. Pages, quantities, and other notes stay yours.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${prefix}-printer`}>Printer</Label>
                <select
                  id={`${prefix}-printer`}
                  className="h-11 w-full rounded-md border bg-background px-3 text-sm"
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  required
                >
                  <option value="">Choose a printer</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id} disabled={!c.email}>
                      {c.name}
                      {c.email ? ` · ${c.email}` : " · email missing"}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Manage printer contacts on the Print tab.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${prefix}-pages`}>
                  Estimated target-language pages
                </Label>
                <Input
                  id={`${prefix}-pages`}
                  type="number"
                  min="1"
                  max="10000"
                  required
                  value={pages}
                  onChange={(e) => setPages(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Project page estimate: {estimatedPages ? `${estimatedPages} pages` : "not set"}. You can change this request.
                </p>
              </div>
              <fieldset disabled={pending} className="space-y-3 sm:col-span-2">
                <legend className="mb-2 text-sm font-medium">Book size for this request</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5"><Label htmlFor={`${prefix}-unit`}>Measurement unit</Label>
                    <select id={`${prefix}-unit`} className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={unit} onChange={event => changeUnit(parseMeasurementUnit(event.target.value))}>
                      <option value="in">Inches (in)</option><option value="mm">Millimetres (mm)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5"><Label htmlFor={`${prefix}-width`}>Width ({unit})</Label>
                    <Input id={`${prefix}-width`} className="min-h-11" type="number" required min={unit === "mm" ? "25.4" : "1"} max={unit === "mm" ? "508" : "20"} step="0.01" value={width} onChange={event => setWidth(event.target.value)} />
                  </div>
                  <div className="space-y-1.5"><Label htmlFor={`${prefix}-height`}>Height ({unit})</Label>
                    <Input id={`${prefix}-height`} className="min-h-11" type="number" required min={unit === "mm" ? "25.4" : "1"} max={unit === "mm" ? "508" : "20"} step="0.01" value={height} onChange={event => setHeight(event.target.value)} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Finished page size after cutting. Changes apply to this request; project defaults stay the same.</p>
              </fieldset>
              <div className="space-y-1.5">
                <Label htmlFor={`${prefix}-quantities`}>
                  Copy quantities to quote
                </Label>
                <Input
                  id={`${prefix}-quantities`}
                  required
                  value={quantities}
                  onChange={(e) => setQuantities(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${prefix}-pdf`}>
                  English book PDF (optional)
                </Label>
                <Input
                  id={`${prefix}-pdf`}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (
                      file &&
                      (file.type !== "application/pdf" ||
                        file.size > MAX_REFERENCE_PDF_BYTES)
                    ) {
                      toast.error("Choose a PDF up to 15 MB.");
                      e.target.value = "";
                      setPdf(null);
                      return;
                    }
                    setPdf(file);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Up to 15 MB. The printer will use the estimated page count
                  above.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${prefix}-text`}>Text paper / color</Label>
                <Input
                  id={`${prefix}-text`}
                  value={textPaper}
                  onChange={(e) => setTextPaper(e.target.value)}
                  placeholder="Optional specifications"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${prefix}-cover`}>Cover paper / finish</Label>
                <Input
                  id={`${prefix}-cover`}
                  value={coverPaper}
                  onChange={(e) => setCoverPaper(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${prefix}-binding`}>Binding</Label>
                <Input
                  id={`${prefix}-binding`}
                  value={binding}
                  onChange={(e) => setBinding(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${prefix}-notes`}>Other specifications</Label>
                <Textarea
                  id={`${prefix}-notes`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" disabled={pending || !contactId}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mail className="size-4" />
              )}
              {pending ? operation : "Prepare email for review"}
            </Button>
          </form>
        ) : null}
        {compose ? (
          <section
            aria-label="Estimate email draft"
            className="space-y-4 rounded-lg border p-4"
            aria-busy={pending}
          >
            <h3 className="font-semibold">Review estimate request email</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${prefix}-to`}>To</Label>
                <Input
                  id={`${prefix}-to`}
                  readOnly
                  value={compose.draft.toAddresses.join(", ")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${prefix}-cc`}>Cc (this email only)</Label>
                <Input
                  id={`${prefix}-cc`}
                  disabled={pending}
                  value={compose.draft.ccAddresses.join(", ")}
                  onChange={(e) =>
                    edit({
                      ccAddresses: e.target.value
                        .split(/[,;]+/)
                        .map((s) => s.trim()),
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${prefix}-subject`}>Subject</Label>
              <Input
                id={`${prefix}-subject`}
                disabled={pending}
                value={compose.draft.subject}
                onChange={(e) => edit({ subject: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${prefix}-body`}>Message</Label>
              <Textarea
                id={`${prefix}-body`}
                disabled={pending}
                rows={12}
                value={compose.draft.body}
                onChange={(e) => edit({ body: e.target.value })}
              />
            </div>
            <OutgoingAttachmentReview
              attachments={compose.attachment ? [compose.attachment] : []}
            />
            {!compose.attachment ? (
              <p className="text-sm text-muted-foreground">
                No English PDF attached. The request uses the estimated page
                count.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={pending || saved}
                onClick={() =>
                  run("Saving draft…", async () => {
                    const result = await saveEmailDraft({
                      ...compose.draft,
                      ccAddresses: compose.draft.ccAddresses.filter(Boolean),
                    });
                    if (result.error) {
                      toast.error(result.error);
                      return;
                    }
                    setSaved(true);
                    toast.success("Draft saved");
                    router.refresh();
                  })
                }
              >
                {saved ? "Draft saved" : "Save draft"}
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={async () => {
                  if (
                    !saved &&
                    !(await confirmDialog(
                      "Close without saving your latest email edits?",
                    ))
                  )
                    return;
                  setCompose(null);
                }}
              >
                Close email
              </Button>
            </div>
            <Label className="flex items-start gap-2 text-sm font-normal">
              <Checkbox
                checked={confirmed}
                disabled={pending}
                onCheckedChange={(v) => setConfirmed(v === true)}
              />
              I reviewed the recipients, message, and any attachment.
            </Label>
            <Button
              disabled={
                pending ||
                !confirmed ||
                !compose.draft.subject.trim() ||
                !compose.draft.body.trim()
              }
              onClick={() =>
                run("Sending estimate request…", async () => {
                  const result = await sendPrintRfq(compose.runId, {
                    subject: compose.draft.subject,
                    body: compose.draft.body,
                    ccEmails: compose.draft.ccAddresses.filter(Boolean),
                    reviewedRecipientEmail: compose.draft.toAddresses[0],
                    reviewedReferenceFileId: compose.referenceFileId,
                  });
                  if (result.error) {
                    setConfirmed(false);
                    toast.error(result.error);
                    return;
                  }
                  setCompose(null);
                  toast.success("Estimate request sent");
                  router.refresh();
                })
              }
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {pending ? operation : "Send estimate request"}
            </Button>
          </section>
        ) : null}
        {requests.length ? (
          <div className="space-y-4">
            {requests.map((request) => (
              <section key={request.id} className="space-y-3 border-t pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">
                      {request.contactName}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {request.pageCount} estimated pages ·{" "}
                      {request.quantities.join(", ")} copies ·{" "}
                      {request.status === "planning"
                        ? "Draft"
                        : request.status === "sending"
                          ? "Sending"
                          : "Requested"}
                    </p>
                  </div>
                  {request.draft && request.status === "planning" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending || !!compose}
                      onClick={() => {
                        setCompose({
                          runId: request.id,
                          referenceFileId: request.referenceFileId,
                          attachment: request.attachment,
                          draft: request.draft!,
                        });
                        setConfirmed(false);
                        setSaved(true);
                      }}
                    >
                      Resume draft
                    </Button>
                  ) : null}
                </div>
                {visibleQuotes
                  .filter(
                    (q) =>
                      q.runId === request.id && q.reviewStatus !== "rejected",
                  )
                  .map((q) => (
                    <EstimateQuoteReview
                      key={`${q.id}:${q.reviewStatus}:${q.totalAmount}`}
                      quote={q}
                      pending={pending || rejected.isPending(q.id)}
                      onUse={(values) =>
                        run("Updating budget estimate…", async () => {
                          const result = await selectPrintEstimateQuote(
                            q.id,
                            values,
                          );
                          if (result.error) {
                            toast.error(result.error);
                            return;
                          }
                          toast.success(
                            "Budget estimate updated; no payment created",
                          );
                          router.refresh();
                        })
                      }
                      onReject={() =>
                        rejected.run(q.id, () => rejectPrintQuote(q.id), {
                          errorMessage:
                            "Could not remove the estimate. It has been restored.",
                          onSuccess: () => router.refresh(),
                        })
                      }
                    />
                  ))}
                {!visibleQuotes.some(
                  (q) =>
                    q.runId === request.id && q.reviewStatus !== "rejected",
                ) ? (
                  <p className="text-sm text-muted-foreground">
                    Replies captured in Correspondence will appear here as
                    suggested quotes for review.
                  </p>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    setImportRun(importRun === request.id ? "" : request.id)
                  }
                >
                  Add quote from text or PDF
                </Button>
                {importRun === request.id ? (
                  <div className="space-y-3">
                    <Label htmlFor={`${prefix}-reply`}>Printer’s reply</Label>
                    <Textarea
                      id={`${prefix}-reply`}
                      rows={4}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="outline"
                        disabled={pending || !reply.trim()}
                        onClick={() =>
                          run("Reading quote…", async () => {
                            const result = await createQuoteFromText(
                              request.id,
                              reply,
                            );
                            if (result.error) {
                              toast.error(result.error);
                              return;
                            }
                            setReply("");
                            router.refresh();
                          })
                        }
                      >
                        Read quote text
                      </Button>
                      <Label className="flex items-center gap-2 text-sm">
                        Or upload quote PDF
                        <Input
                          className="max-w-64"
                          type="file"
                          accept="application/pdf"
                          disabled={pending}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            run("Reading quote PDF…", async () => {
                              const fileId = await uploadFile(file);
                              if (!fileId) return;
                              const result = await createQuoteFromFile(
                                request.id,
                                fileId,
                              );
                              if (result.error) {
                                toast.error(result.error);
                                return;
                              }
                              router.refresh();
                            });
                          }}
                        />
                      </Label>
                    </div>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        ) : null}
        {pending ? (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" />
            {operation}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EstimateQuoteReview({
  quote,
  pending,
  onUse,
  onReject,
}: {
  quote: EstimateQuote;
  pending: boolean;
  onUse: (values: {
    quantityCps: number;
    totalAmount: number;
    currency: string;
  }) => void;
  onReject: () => void;
}) {
  const id = useId();
  const [quantity, setQuantity] = useState(String(quote.quantityCps ?? ""));
  const [total, setTotal] = useState(
    String(getPrintQuoteTotal(quote)?.totalCost ?? ""),
  );
  const [currency, setCurrency] = useState(quote.currency);
  const chosen = quote.reviewStatus === "estimated";
  return (
    <form
      className="space-y-3 rounded-lg bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onUse({
          quantityCps: Number(quantity),
          totalAmount: Number(total),
          currency,
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline">
          {chosen ? "Selected budget estimate" : "Review estimate"}
        </Badge>
        {quote.sourceThreadId ? (
          <Link
            className="text-sm underline underline-offset-4"
            href={`/correspondence/${quote.sourceThreadId}`}
          >
            View printer email
          </Link>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {[
          quote.textPages ? `${quote.textPages} quoted pages` : null,
          quote.textSpec,
          quote.coverSpec,
          quote.binding,
          quote.paymentTerms,
        ]
          .filter(Boolean)
          .join(" · ") ||
          "Check the printer’s original specifications before selecting this estimate."}
      </p>
      {quote.reviewFlags.length ? (
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {quote.reviewFlags.map((flag, i) => (
            <li key={i}>{ESTIMATE_REVIEW_HINTS[flag.kind]}</li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`${id}-qty`}>Copies</Label>
          <Input
            id={`${id}-qty`}
            type="number"
            min="1"
            required
            value={quantity}
            disabled={chosen || pending}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-total`}>Total printing cost</Label>
          <Input
            id={`${id}-total`}
            type="number"
            step="0.01"
            min="0.01"
            required
            value={total}
            disabled={chosen || pending}
            onChange={(e) => setTotal(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-currency`}>Currency</Label>
          <Input
            id={`${id}-currency`}
            pattern="[A-Z]{3}"
            required
            value={currency}
            disabled={chosen || pending}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" type="submit" disabled={pending || chosen}>
          Use for budget estimate
        </Button>
        <Button
          size="sm"
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onReject}
        >
          {chosen ? "Remove selected estimate" : "Reject"}
        </Button>
      </div>
    </form>
  );
}
