"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Eye, EyeOff, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { usePropState } from "@/hooks/use-prop-state";
import {
  applySuggestedPartnerRates,
  applySuggestedPerCopyPrice,
  enableBudgetPresentation,
  saveBudgetPresentation,
  updateBudgetLine,
} from "@/lib/budget/actions";
import {
  expectedNetCents,
  grossTargetCents,
  lineAmountCents,
  partnerQuoteTotalCents,
} from "@/lib/budget/compute";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type PartnerLine = {
  id: string;
  label: string;
  partnerLabel: string | null;
  partnerUnitPrice: string | null;
  partnerVisible: boolean;
  unit: "words" | "pages" | "cover" | "project" | "flat";
  quantity: string;
  unitPrice: string;
  amount: string;
};

type Presentation = {
  mode: "itemized" | "per_copy";
  deductionBps: number;
  publicDescription: string | null;
  perCopyQuantity: number | null;
  perCopyUnitPrice: string | null;
};

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
  items: initialItems,
}: {
  projectId: string;
  slug: string;
  printRunId: string | null;
  currency: string;
  canEdit: boolean;
  presentation: Presentation | null;
  items: PartnerLine[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [presentation, setPresentation] = usePropState(initialPresentation);
  const [savedPresentation, setSavedPresentation] =
    usePropState(initialPresentation);
  const [items, setItems] = usePropState(initialItems);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialItems.filter((item) => item.partnerVisible).map((item) => item.id))
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

  function run(
    action: () => Promise<unknown>,
    success: string,
    onSuccess?: (result: unknown) => void
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
        saveBudgetPresentation(projectId, {
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
      () => setSavedPresentation(presentation)
    );
  }

  function updateLine(id: string, patch: Partial<PartnerLine>) {
    const previous = items;
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
    startTransition(async () => {
      try {
        const result = await updateBudgetLine(id, {
          ...(patch.partnerLabel !== undefined
            ? { partnerLabel: patch.partnerLabel }
            : {}),
          ...(patch.partnerUnitPrice !== undefined
            ? {
                partnerUnitPrice:
                  patch.partnerUnitPrice == null
                    ? null
                    : Number(patch.partnerUnitPrice),
              }
            : {}),
          ...(patch.partnerVisible !== undefined
            ? { partnerVisible: patch.partnerVisible }
            : {}),
        });
        if (!result) throw new Error("Line not found.");
        router.refresh();
      } catch (error) {
        setItems(previous);
        toast.error(
          error instanceof Error ? error.message : "Could not save the public line."
        );
      }
    });
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
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending || selected.size === 0}
                  onClick={() =>
                    run(
                      () =>
                        applySuggestedPartnerRates(
                          projectId,
                          printRunId,
                          [...selected]
                        ),
                      "Suggested public rates applied"
                    )
                  }
                >
                  <Sparkles className="size-4" />
                  Apply funding target to selected lines
                </Button>
              ) : null}
            </div>
            <div className="divide-y overflow-hidden rounded-lg border">
              {items.map((item) => {
                const publicRate = item.partnerUnitPrice ?? item.unitPrice;
                const amount = lineAmountCents(item.quantity, publicRate);
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "grid gap-3 p-3 md:grid-cols-[auto_minmax(12rem,1fr)_9rem_8rem] md:items-center",
                      !item.partnerVisible && "bg-muted/25 text-muted-foreground"
                    )}
                  >
                    <label className="inline-flex min-h-9 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={item.partnerVisible}
                        disabled={!canEdit || pending}
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
                      value={item.partnerLabel ?? item.label}
                      disabled={!canEdit || pending || !item.partnerVisible}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((candidate) =>
                            candidate.id === item.id
                              ? { ...candidate, partnerLabel: event.target.value }
                              : candidate
                          )
                        )
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
                      value={publicRate}
                      disabled={!canEdit || pending || !item.partnerVisible}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((candidate) =>
                            candidate.id === item.id
                              ? {
                                  ...candidate,
                                  partnerUnitPrice: event.target.value,
                                }
                              : candidate
                          )
                        )
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
            "flex flex-col gap-3 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between",
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
          {canEdit ? (
            <div className="flex flex-wrap justify-end gap-2">
              {pending ? (
                <span
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "cursor-wait opacity-70"
                  )}
                >
                  Saving…
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
              {presentationDirty || pending ? (
                <span
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "cursor-not-allowed opacity-50"
                  )}
                  title={
                    pending
                      ? "Wait for the current save to finish."
                      : "Save the partner quote before previewing it."
                  }
                >
                  {pending ? "Saving…" : "Save to preview"}
                </span>
              ) : (
                <Link
                  href={
                    presentation.mode === "per_copy"
                      ? `/api/projects/${slug}/budget/partner-pdf${
                          printRunId ? `?run=${printRunId}` : ""
                        }`
                      : `/api/projects/${slug}/budget/export?audience=partner${
                          printRunId ? `&run=${printRunId}` : ""
                        }`
                  }
                  target="_blank"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Preview saved file
                </Link>
              )}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
