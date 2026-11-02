"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { updatePrintSettings } from "@/lib/print/actions";
import {
  estimatePrintPages,
  formatTrimSize,
  measurementInputFromInches,
  measurementToInches,
  measurementUnit,
  type MeasurementUnit,
} from "@/lib/print/estimate";

type Details = {
  sourcePageCount: number | null;
  trimWidthIn: string;
  trimHeightIn: string;
  measurementUnit: MeasurementUnit;
  languageExpansionFactor: string;
};

function draftFrom(details: Details) {
  return {
    sourcePageCount: String(details.sourcePageCount ?? ""),
    trimWidth: measurementInputFromInches(details.trimWidthIn, details.measurementUnit),
    trimHeight: measurementInputFromInches(details.trimHeightIn, details.measurementUnit),
    measurementUnit: details.measurementUnit,
    languageExpansionFactor: details.languageExpansionFactor,
  };
}

function replaceDetails(_current: Details, next: Details) { return next; }

export function BookDetails({
  projectId, projectSlug, canEdit, sourceLanguage, targetLanguage, details,
  wordCount, wordsPerPage,
}: {
  projectId: string;
  projectSlug: string;
  canEdit: boolean;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  details: Details;
  wordCount: number;
  wordsPerPage: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => draftFrom(details));
  const [error, setError] = useState<string | null>(null);
  const changes = useOptimisticAction({ state: details, update: replaceDetails });
  const saved = changes.state;
  const estimatedPages = estimatePrintPages({ ...saved, wordCount, wordsPerPage });
  const draftEstimate = estimatePrintPages({ ...draft, wordCount, wordsPerPage });
  const sourceHint = sourceLanguage
    ? `Pages in the ${sourceLanguage} edition. Leave blank if unknown.`
    : "Pages in the original edition. Leave blank if unknown.";
  const estimateLabel = targetLanguage ? `Estimated ${targetLanguage} pages` : "Estimated translated pages";

  function changeUnit(unit: MeasurementUnit) {
    setDraft(current => ({
      ...current,
      measurementUnit: unit,
      trimWidth: measurementInputFromInches(measurementToInches(current.trimWidth, current.measurementUnit), unit),
      trimHeight: measurementInputFromInches(measurementToInches(current.trimHeight, current.measurementUnit), unit),
    }));
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || changes.pending) return;
    const next: Details = {
      sourcePageCount: draft.sourcePageCount ? Number(draft.sourcePageCount) : null,
      trimWidthIn: measurementToInches(draft.trimWidth, draft.measurementUnit).toFixed(2),
      trimHeightIn: measurementToInches(draft.trimHeight, draft.measurementUnit).toFixed(2),
      measurementUnit: draft.measurementUnit,
      languageExpansionFactor: Number(draft.languageExpansionFactor).toFixed(2),
    };
    setError(null);
    setEditing(false);
    changes.run(next, () => updatePrintSettings(projectId, {
      ...next,
      sourcePageCount: next.sourcePageCount ?? 0,
    }), {
      errorMessage: "Could not save book details. Check your connection and try again.",
      onError: message => { setError(message); setEditing(true); },
      onSuccess: () => { toast.success("Book details saved"); router.refresh(); },
    });
  }

  return (
    <section id="book-details" aria-labelledby="book-details-heading" className="@container/book-details scroll-mt-32 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="book-details-heading" className="text-base font-semibold">Book details</h2>
          <p className="mt-1 text-sm text-muted-foreground">Source pages and finished book size, shared with Budget and Print.</p>
        </div>
        {canEdit ? <Button variant="outline" className="h-11 sm:h-10" aria-expanded={editing} aria-controls="book-details-form" disabled={changes.pending || editing} onClick={() => {
          setDraft(draftFrom(saved)); setError(null); setEditing(true);
        }}>
          {changes.pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Pencil aria-hidden className="size-4" />}
          {changes.pending ? "Saving book details…" : "Edit book details"}
        </Button> : null}
      </div>

      <dl className="mt-4 grid gap-4 @[36rem]/book-details:grid-cols-3" aria-live="polite">
        <div>
          <dt className="text-sm text-muted-foreground">Source page count{sourceLanguage ? ` (${sourceLanguage})` : ""}</dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">{saved.sourcePageCount ? `${saved.sourcePageCount.toLocaleString()} pages` : "Not set"}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Book size (trim size)</dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">{formatTrimSize(saved.trimWidthIn, saved.trimHeightIn, saved.measurementUnit)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{estimateLabel}</dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">{estimatedPages ? `${estimatedPages.toLocaleString()} pages` : "Add source pages to estimate"}</dd>
        </div>
      </dl>

      {editing && canEdit ? <form id="book-details-form" onSubmit={save} className="mt-5 space-y-4 border-t pt-5">
        <fieldset disabled={changes.pending} className="grid max-w-3xl gap-4 @[36rem]/book-details:grid-cols-2">
          <legend className="sr-only">Edit book details</legend>
          <div className="space-y-2">
            <Label htmlFor="book-source-pages">Source page count</Label>
            <Input id="book-source-pages" className="h-11 sm:h-9" autoFocus type="number" inputMode="numeric" min="0" step="1" value={draft.sourcePageCount}
              onChange={event => setDraft({ ...draft, sourcePageCount: event.target.value })} aria-describedby="book-source-pages-hint" />
            <p id="book-source-pages-hint" className="text-xs text-muted-foreground">{sourceHint}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="book-expansion">Language expansion factor</Label>
            <Input id="book-expansion" className="h-11 sm:h-9" type="number" min="0.5" max="3" step="0.01" required value={draft.languageExpansionFactor}
              onChange={event => setDraft({ ...draft, languageExpansionFactor: event.target.value })} aria-describedby="book-expansion-hint" />
            <p id="book-expansion-hint" className="text-xs text-muted-foreground">For example, 1.5 means the translation uses about 50% more pages.</p>
          </div>
          <div className="space-y-3 @[36rem]/book-details:col-span-2">
            <p className="text-sm font-medium">Book size (trim size)</p>
            <p id="book-size-hint" className="text-xs text-muted-foreground">The finished page size after cutting. Width × height.</p>
            <div className="grid gap-3 @[36rem]/book-details:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="book-measurement-unit">Measurement unit</Label>
                <select id="book-measurement-unit" value={draft.measurementUnit} onChange={event => changeUnit(measurementUnit(event.target.value))}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:h-9">
                  <option value="in">Inches (in)</option><option value="mm">Millimetres (mm)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="book-trim-width">Width ({draft.measurementUnit})</Label>
                <Input id="book-trim-width" className="h-11 sm:h-9" type="number" min={draft.measurementUnit === "mm" ? "25.4" : "1"} max={draft.measurementUnit === "mm" ? "508" : "20"} step="0.01" required value={draft.trimWidth}
                  onChange={event => setDraft({ ...draft, trimWidth: event.target.value })} aria-describedby="book-size-hint" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="book-trim-height">Height ({draft.measurementUnit})</Label>
                <Input id="book-trim-height" className="h-11 sm:h-9" type="number" min={draft.measurementUnit === "mm" ? "25.4" : "1"} max={draft.measurementUnit === "mm" ? "508" : "20"} step="0.01" required value={draft.trimHeight}
                  onChange={event => setDraft({ ...draft, trimHeight: event.target.value })} aria-describedby="book-size-hint" />
              </div>
            </div>
          </div>
        </fieldset>
        <p className="text-sm text-muted-foreground" role="status">{estimateLabel}: {draftEstimate ? `${draftEstimate.toLocaleString()} pages` : "enter source pages to estimate"}. Final pages are confirmed after layout.</p>
        <p className="max-w-prose text-xs text-muted-foreground">Saving also updates automatic typesetting quantities and print page estimates. Existing print runs keep their own book size.</p>
        {error ? <p role="alert" className="text-sm text-destructive">{error} Your entries are kept so you can try again.</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="h-11 sm:h-10" disabled={changes.pending}>Save book details</Button>
          <Button type="button" variant="ghost" className="h-11 sm:h-10" disabled={changes.pending} onClick={() => { setEditing(false); setError(null); }}>Cancel</Button>
        </div>
      </form> : null}

      <p className="mt-4 text-xs text-muted-foreground">For paper, binding, and print runs, <Link href={`/projects/${projectSlug}/print`} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">open Print</Link>.</p>
    </section>
  );
}
