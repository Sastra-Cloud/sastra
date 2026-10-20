"use client";

import { FileLink } from "@/components/files/file-link";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, Download, Eye, EyeOff, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";

import {
  type PartnerLinePatch,
  type PartnerRateChange,
  type PartnerRateResult,
  type PartnerQuoteLine as PartnerLine,
} from "@/lib/budget/partner-line-state";
import {
  applySuggestedPerCopyPrice,
  enableBudgetPresentation,
} from "@/lib/budget/actions";
import { applySuggestedPartnerRates, undoSuggestedPartnerRates } from "@/lib/budget/partner-rate-actions";
import { savePartnerQuote } from "@/lib/budget/partner-quote-save";
import type { PartnerQuotePresentation as Presentation } from "@/lib/budget/presentation-input";
import {
  expectedNetCents,
  grossTargetCents,
  lineAmountCents,
  partnerQuoteTotalCents,
  suggestPartnerRates,
} from "@/lib/budget/compute";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type LineDraft = Partial<Pick<PartnerLine, "partnerLabel" | "partnerUnitPrice">>;


function money(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function PartnerQuotePanel({
  projectId,
  slug,
  printRunId,
  currency,
  canEdit,
  presentation: initialPresentation,
  items,
  onUpdateLine,
  onUpdateRates,
  isLinePending,
  linesPending,
}: {
  projectId: string;
  slug: string;
  printRunId: string | null;
  currency: string;
  canEdit: boolean;
  presentation: Presentation | null;
  items: PartnerLine[];
  onUpdateLine: (id: string, patch: PartnerLinePatch["patch"], onSuccess: () => void) => void;
  onUpdateRates: (
    rates: Record<string, string | null>,
    action: () => Promise<PartnerRateResult>,
    onSuccess: (result: Extract<PartnerRateResult, { rates: unknown }>) => void
  ) => void;
  isLinePending: (id: string) => boolean;
  linesPending: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const presentationVersion = JSON.stringify(initialPresentation);
  const [previousPresentationVersion, setPreviousPresentationVersion] = useState(presentationVersion);
  const [presentation, setPresentation] = useState(initialPresentation);
  const [savedPresentation, setSavedPresentation] = useState(initialPresentation);
  // A line save refreshes props too. Equal settings must not erase another draft.
  if (presentationVersion !== previousPresentationVersion) {
    setPreviousPresentationVersion(presentationVersion);
    setPresentation(initialPresentation);
    setSavedPresentation(initialPresentation);
  }
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraft>>({});
  const [undoRates, setUndoRates] = useState<PartnerRateChange[] | null>(null);
  const saving = pending || linesPending;
  const hasLineDrafts = items.some((item) => {
    if (!item.partnerVisible) return false;
    const draft = lineDrafts[item.id];
    return draft && (
      (draft.partnerLabel !== undefined && draft.partnerLabel !== (item.partnerLabel ?? item.label)) ||
      (draft.partnerUnitPrice !== undefined && draft.partnerUnitPrice !== (item.partnerUnitPrice ?? item.unitPrice))
    );
  });
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(items.filter((item) => item.partnerVisible).map((item) => item.id))
  );

  const internalCents = useMemo(
    () => items.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0),
    [items]
  );
  const itemizedCents = partnerQuoteTotalCents(items);
  const perCopyCents =
    Math.max(0, presentation?.perCopyQuantity ?? 0) *
    Math.round(Number(presentation?.perCopyUnitPrice ?? 0) * 100);
  const quoteCents =
    presentation?.mode === "per_copy" ? perCopyCents : itemizedCents;
  const expectedCents = expectedNetCents(
    quoteCents,
    presentation?.deductionBps ?? 0
  );
  const targetCents = grossTargetCents(
    internalCents,
    presentation?.deductionBps ?? 0
  );
  const reserveCents = targetCents - internalCents;
  const coverageCents = expectedCents - internalCents;
  const presentationDirty =
    JSON.stringify(presentation) !== JSON.stringify(savedPresentation);
  const quoteNotSaved = presentationDirty || saving || hasLineDrafts;
  const fundingTargetDirty = presentation?.deductionBps !== savedPresentation?.deductionBps;

  function run<Result>(
    action: () => Promise<Result>,
    success: string,
    onSuccess?: (result: Result) => void
  ) {
    startTransition(async () => {
      try {
        const result = await action();
        if (
          result &&
          typeof result === "object" &&
          "error" in result &&
          result.error
        ) {
          throw new Error(String(result.error));
        }
        onSuccess?.(result);
        toast.success(success);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save.");
      }
    });
  }

  function patchPresentation(patch: Partial<Presentation>) {
    if (!presentation) return;
    setPresentation({ ...presentation, ...patch });
  }

  function persistPresentation() {
    if (!presentation) return;
    run(
      () =>
        savePartnerQuote(slug, {
          printRunId,
          mode: presentation.mode,
          deductionPercent: presentation.deductionBps / 100,
          publicDescription: presentation.publicDescription,
          perCopyQuantity: presentation.perCopyQuantity,
          perCopyUnitPrice:
            presentation.perCopyUnitPrice == null
              ? null
              : Number(presentation.perCopyUnitPrice),
        }),
      "Partner quote saved",
      (saved) => { setPresentation(saved); setSavedPresentation(saved); }
    );
  }

  function updateLine(id: string, patch: PartnerLinePatch["patch"]) {
    if (isLinePending(id)) return;
    onUpdateLine(id, patch, () => {
      setLineDrafts((current) => {
        const draft = current[id];
        if (!draft) return current;
        const remaining = { ...draft };
        if (patch.partnerLabel !== undefined && draft.partnerLabel === patch.partnerLabel) delete remaining.partnerLabel;
        if (patch.partnerUnitPrice !== undefined && draft.partnerUnitPrice === patch.partnerUnitPrice) delete remaining.partnerUnitPrice;
        const next = { ...current };
        if (Object.keys(remaining).length) next[id] = remaining;
        else delete next[id];
        return next;
      });
    });
  }

  function changeFundingRates(undo: boolean) {
    if (!presentation || saving || hasLineDrafts || (undo ? !undoRates : fundingTargetDirty)) return;
    try {
      const rates = undo
        ? Object.fromEntries(undoRates!.map((change) => [change.id, change.previousPartnerUnitPrice]))
        : suggestPartnerRates(items, selected, presentation.deductionBps);
      // These drafts equal saved values (dirty drafts block the action). Let the
      // new rates render immediately instead of keeping equal old input values.
      setLineDrafts((current) => Object.fromEntries(Object.entries(current).map(([id, draft]) => {
        if (!Object.hasOwn(rates, id)) return [id, draft];
        const remaining = { ...draft };
        delete remaining.partnerUnitPrice;
        return [id, remaining];
      })));
      onUpdateRates(
        rates,
        () => undo
          ? undoSuggestedPartnerRates(projectId, printRunId, undoRates!)
          : applySuggestedPartnerRates(projectId, printRunId, [...selected]),
        (result) => {
          if (undo) setUndoRates(null);
          else if (result.changes.length) setUndoRates(result.changes);
          toast.success(undo ? "Previous partner rates restored" : result.changes.length ? "Funding target applied" : "Partner rates already match the funding target");
        }
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not calculate partner rates.");
    }
  }

  if (!presentation) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <h3 className="font-semibold">Set up the partner quote</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Keep your real costs internal, then choose what the partner sees.
              This also covers the workspace organization donation fee without
              adding a visible fee line.
            </p>
          </div>
          {canEdit ? (
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => enableBudgetPresentation(projectId, printRunId),
                  "Partner quote enabled"
                )
              }
            >
              Set up partner quote
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-1.5 font-semibold">
              Partner quote
              <HelpTip label="About the partner quote">
                This is the amount and detail a funding partner can see.
                Internal costs, internal notes, and the organization donation
                fee are never included in partner-facing files.
              </HelpTip>
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Project costs are {money(internalCents, currency)}. The{" "}
              {(presentation.deductionBps / 100)
                .toFixed(2)
                .replace(/\.?0+$/, "")}
              % organization donation fee adds internal coverage of{" "}
              {money(reserveCents, currency)}, making the minimum funding target{" "}
              {money(targetCents, currency)}.
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-right">
            <p className="text-xs text-muted-foreground">Partner total</p>
            <p className="text-lg font-semibold tabular-nums">
              {money(quoteCents, currency)}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor="partner-quote-mode">Partner sees</Label>
            <select
              id="partner-quote-mode"
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              value={presentation.mode}
              disabled={!canEdit || pending}
              onChange={(event) =>
                patchPresentation({
                  mode: event.target.value as Presentation["mode"],
                })
              }
            >
              <option value="itemized">Itemized costs</option>
              <option value="per_copy">One price per copy</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="donation-deduction" className="flex items-center gap-1">
              Organization donation fee
              <HelpTip label="About the organization donation fee">
                The percentage your organization retains from every donation.
                The project receives the remainder. This fee is used only for
                internal coverage math and is not itemized to partners.
              </HelpTip>
            </Label>
            <div className="relative">
              <Input
                id="donation-deduction"
                type="number"
                min="0"
                max="99.99"
                step="0.01"
                className="pr-8"
                value={presentation.deductionBps / 100}
                disabled={!canEdit || pending}
                onChange={(event) =>
                  patchPresentation({
                    deductionBps: Math.round(Number(event.target.value) * 100),
                  })
                }
              />
              <span className="pointer-events-none absolute right-3 top-2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="public-description">Partner description</Label>
            <Input
              id="public-description"
              value={presentation.publicDescription ?? ""}
              disabled={!canEdit || pending}
              placeholder="What this funding covers"
              onChange={(event) =>
                patchPresentation({ publicDescription: event.target.value })
              }
            />
          </div>
        </div>

        {presentation.mode === "per_copy" ? (
          <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="per-copy-quantity">Copies</Label>
              <Input
                id="per-copy-quantity"
                type="number"
                min="1"
                step="1"
                value={presentation.perCopyQuantity ?? ""}
                disabled={!canEdit || pending}
                onChange={(event) =>
                  patchPresentation({
                    perCopyQuantity: Math.max(1, Number(event.target.value) || 1),
                  })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="per-copy-price">Price per copy ({currency})</Label>
              <Input
                id="per-copy-price"
                type="number"
                min="0"
                step="0.01"
                value={presentation.perCopyUnitPrice ?? ""}
                disabled={!canEdit || pending}
                onChange={(event) =>
                  patchPresentation({ perCopyUnitPrice: event.target.value })
                }
              />
            </div>
            {canEdit ? (
              <Button
                variant="outline"
                disabled={pending || !presentation.perCopyQuantity}
                onClick={() =>
                  run(
                    () =>
                      applySuggestedPerCopyPrice(
                        projectId,
                        printRunId,
                        presentation.perCopyQuantity ?? 0
                      ),
                    "Coverage price applied"
                  )
                }
              >
                <Sparkles className="size-4" />
                Suggest price
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Choose visible lines and edit the partner-safe wording and rates.
              </p>
              {canEdit ? (
                <div className="flex flex-wrap items-center gap-2">
                  {undoRates ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={saving || hasLineDrafts}
                      onClick={() => changeFundingRates(true)}
                      title="Restore partner rates from before the last funding target application"
                    >
                      <Undo2 className="size-4" />
                      Undo funding target
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={saving || selected.size === 0 || hasLineDrafts || fundingTargetDirty}
                    onClick={() => changeFundingRates(false)}
                  >
                    <Sparkles className="size-4" />
                    Apply funding target to selected lines
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="divide-y overflow-hidden rounded-lg border">
              {items.map((item) => {
                const publicRate = item.partnerUnitPrice ?? item.unitPrice;
                const draft = lineDrafts[item.id];
                const linePending = isLinePending(item.id);
                const amount = lineAmountCents(item.quantity, publicRate);
                return (
                  <div
                    key={item.id}
                    aria-busy={linePending}
                    className={cn(
                      "grid gap-3 p-3 md:grid-cols-[auto_minmax(12rem,1fr)_9rem_8rem] md:items-center",
                      !item.partnerVisible && "bg-muted/25 text-muted-foreground"
                    )}
                  >
                    <label className="inline-flex min-h-9 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        aria-label={`Show ${item.label} in partner quote`}
                        checked={item.partnerVisible}
                        disabled={!canEdit || pending || linePending}
                        onChange={(event) =>
                          updateLine(item.id, {
                            partnerVisible: event.target.checked,
                          })
                        }
                      />
                      {item.partnerVisible ? (
                        <Eye className="size-4" />
                      ) : (
                        <EyeOff className="size-4" />
                      )}
                      <span className="md:sr-only">
                        {item.partnerVisible ? "Shown" : "Hidden"}
                      </span>
                    </label>
                    <Input
                      aria-label={`Partner label for ${item.label}`}
                      value={draft?.partnerLabel ?? item.partnerLabel ?? item.label}
                      disabled={!canEdit || pending || linePending || !item.partnerVisible}
                      onChange={(event) =>
                        setLineDrafts((current) => ({
                          ...current,
                          [item.id]: { ...current[item.id], partnerLabel: event.target.value },
                        }))
                      }
                      onBlur={(event) =>
                        updateLine(item.id, {
                          partnerLabel: event.target.value,
                        })
                      }
                    />
                    <Input
                      aria-label={`Partner rate for ${item.label}`}
                      type="number"
                      min="0"
                      step={item.unit === "words" ? "0.0001" : "0.01"}
                      value={draft?.partnerUnitPrice ?? publicRate}
                      disabled={!canEdit || pending || linePending || !item.partnerVisible}
                      onChange={(event) =>
                        setLineDrafts((current) => ({
                          ...current,
                          [item.id]: { ...current[item.id], partnerUnitPrice: event.target.value },
                        }))
                      }
                      onBlur={(event) =>
                        updateLine(item.id, {
                          partnerUnitPrice: event.target.value,
                        })
                      }
                    />
                    <div className="flex items-center justify-between gap-2 text-sm md:justify-end">
                      {canEdit && item.partnerVisible ? (
                        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={selected.has(item.id)}
                            onChange={(event) => {
                              const next = new Set(selected);
                              if (event.target.checked) next.add(item.id);
                              else next.delete(item.id);
                              setSelected(next);
                            }}
                          />
                          adjust
                        </label>
                      ) : null}
                      <span className="font-medium tabular-nums">
                        {money(amount, currency)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            coverageCents < 0
              ? "border-amber-400/70 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100"
              : "border-emerald-300 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-100"
          )}
        >
          <span className="flex items-start gap-2">
            {coverageCents < 0 ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            ) : (
              <Check className="mt-0.5 size-4 shrink-0" />
            )}
            Partner quote {money(quoteCents, currency)} → expected available{" "}
            {money(expectedCents, currency)} → internal costs{" "}
            {money(internalCents, currency)}.
            {coverageCents < 0
              ? ` Short by ${money(Math.abs(coverageCents), currency)}.`
              : ` Covers costs by ${money(coverageCents, currency)}.`}
          </span>
        </div>
        {canEdit ? (
          <div className="flex flex-col gap-3 border-t pt-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1">
              <p className="font-medium">Share this quote with the partner</p>
              <p className="text-xs text-muted-foreground">
                {quoteNotSaved
                  ? "Save your changes before preparing the partner email."
                  : quoteCents <= 0
                    ? "Set a partner quote amount before preparing the email."
                  : "Review the recipient, message, and attached quote before sending."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {saving ? (
                <span
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "cursor-wait opacity-70"
                  )}
                >
                  Saving…
                </span>
              ) : hasLineDrafts ? (
                <span className="inline-flex h-8 items-center px-2 text-sm font-medium">
                  Unsaved line edits
                </span>
              ) : presentationDirty ? (
                <Button size="sm" onClick={persistPresentation}>
                  Save partner quote
                </Button>
              ) : (
                <span className="inline-flex h-8 items-center gap-1.5 px-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  <Check className="size-4" />
                  Saved
                </span>
              )}
              {quoteNotSaved ? (
                <Button variant="outline" size="sm" disabled>
                  <Download className="size-4" />
                  Download {presentation.mode === "per_copy" ? "PDF" : "Excel"}
                </Button>
              ) : (
                <FileLink
                  href={
                    presentation.mode === "per_copy"
                      ? `/api/projects/${slug}/budget/partner-pdf${
                          printRunId ? `?run=${printRunId}` : ""
                        }`
                      : `/api/projects/${slug}/budget/export?audience=partner${
                          printRunId ? `&run=${printRunId}` : ""
                        }`
                  }
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Download className="size-4" />
                  Download {presentation.mode === "per_copy" ? "PDF" : "Excel"}
                </FileLink>
              )}
              {quoteNotSaved || quoteCents <= 0 ? (
                <Button size="sm" disabled>
                  Continue to partner email
                  <ArrowRight className="size-4" />
                </Button>
              ) : (
                <a href="#partner-email" className={buttonVariants({ size: "sm" })}>
                  Continue to partner email
                  <ArrowRight className="size-4" />
                </a>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
