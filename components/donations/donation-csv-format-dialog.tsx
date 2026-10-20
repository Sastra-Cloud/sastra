"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DONATION_CSV_FIELDS,
  type DonationCsvField,
  type DonationCsvMapping,
} from "@/lib/donations/csv-format";
import {
  generateDonationCsvMapping,
  getDonationCsvPreview,
  learnDonationCsvFormat,
} from "@/lib/donations/format-actions";
import type {
  DonationCsvFormatProposal,
  DonationCsvPreview,
  DonationImportResult,
} from "@/lib/donations/types";
import { cn } from "@/lib/utils";

const NOT_IN_FILE = "__none__";

function money(value: string, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    Number(value)
  );
}

function giftDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

/**
 * Review step for a CSV layout Sastra has not seen: confirm which column holds
 * each detail, check a dry-run preview, then save the format and import.
 */
export function DonationCsvFormatDialog({
  proposal,
  onClose,
  onImported,
}: {
  proposal: DonationCsvFormatProposal;
  onClose: () => void;
  onImported: (result: DonationImportResult) => void;
}) {
  const [name, setName] = useState(proposal.name);
  const [mapping, setMapping] = useState(proposal.mapping);
  const [preview, setPreview] = useState<DonationCsvPreview>(proposal.preview);
  // The header rules missed a required column: start AI right away.
  const autoAi = proposal.needsAi && proposal.aiAvailable;
  const [aiState, setAiState] = useState<"idle" | "running" | "used">(
    autoAi ? "running" : "idle"
  );
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewPending, startPreview] = useTransition();
  const request = useRef(0);
  const autoAiStarted = useRef(false);

  function refreshPreview(
    next: DonationCsvMapping,
    options: { defaultStatuses?: boolean } = {}
  ) {
    const id = ++request.current;
    setMapping(next);
    startPreview(async () => {
      const result: Awaited<ReturnType<typeof getDonationCsvPreview>> =
        await getDonationCsvPreview(proposal.fileId, next, options).catch(
          () => ({})
        );
      if (id !== request.current) return;
      if (result.mapping) setMapping(result.mapping);
      if (result.preview) setPreview(result.preview);
      else toast.error(result.error ?? "Couldn't check the columns. Try again.");
    });
  }

  function chooseColumn(field: DonationCsvField, value: string | null) {
    const header = !value || value === NOT_IN_FILE ? null : value;
    const next = { ...mapping, columns: { ...mapping.columns, [field]: header } };
    refreshPreview(
      field === "status" ? { ...next, successStatuses: [] } : next,
      { defaultStatuses: field === "status" }
    );
  }

  function toggleStatus(value: string, received: boolean) {
    const others = mapping.successStatuses.filter((item) => item !== value);
    refreshPreview({
      ...mapping,
      successStatuses: received ? [...others, value] : others,
    });
  }

  async function requestAi(id: number) {
    const result: Awaited<ReturnType<typeof generateDonationCsvMapping>> =
      await generateDonationCsvMapping(proposal.fileId).catch(() => ({
        error: "AI could not suggest the columns. Choose them below.",
      }));
    if (id !== request.current) {
      setAiState("idle");
      return;
    }
    if (!result.mapping || !result.preview) {
      setAiState("idle");
      setAiError(result.error ?? "AI could not suggest the columns. Choose them below.");
      return;
    }
    setMapping(result.mapping);
    setPreview(result.preview);
    if (result.name) setName(result.name);
    setAiState("used");
  }

  function askAi() {
    setAiState("running");
    setAiError(null);
    void requestAi(++request.current);
  }

  useEffect(() => {
    // The ref keeps development double-mounting from sending two requests.
    if (!autoAi || autoAiStarted.current) return;
    autoAiStarted.current = true;
    void requestAi(++request.current);
    // Runs once per uploaded file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal.fileId]);

  async function saveAndImport() {
    setSaving(true);
    const result: DonationImportResult = await learnDonationCsvFormat({
      fileId: proposal.fileId,
      name: name.trim(),
      mapping,
    }).catch(() => ({
      error: "Couldn't import the file. Check your internet and try again.",
    }));
    setSaving(false);
    if (result.error && !result.alreadyImported) {
      toast.error(result.error);
      return;
    }
    onImported(result);
  }

  const busy = saving || aiState === "running";
  const canSave =
    !busy && !previewPending && !preview.error && name.trim().length > 0;
  const headerOptions = [...new Set(proposal.headers.filter(Boolean))];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-4 pr-12">
          <DialogTitle>Set up a new CSV format</DialogTitle>
          <DialogDescription>
            Sastra has not seen this file layout before. Check which column holds
            each detail. Sastra remembers this format for your next import.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <AiStatus
            state={aiState}
            error={aiError}
            available={proposal.aiAvailable}
            disabled={saving}
            onAsk={askAi}
          />

          <div className="grid gap-1.5 sm:max-w-sm">
            <Label htmlFor="donation-format-name">Format name</Label>
            <Input
              id="donation-format-name"
              value={name}
              maxLength={80}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <fieldset className="space-y-3" disabled={busy}>
            <legend className="text-sm font-medium">Columns</legend>
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {DONATION_CSV_FIELDS.map(({ field, label, required, hint }) => (
                <div key={field} className="grid min-w-0 gap-1">
                  <Label
                    htmlFor={`donation-column-${field}`}
                    className="flex items-center gap-1 text-xs"
                  >
                    {label}
                    {required ? (
                      <span className="text-muted-foreground">(required)</span>
                    ) : null}
                    {hint ? <HelpTip label={`About ${label}`}>{hint}</HelpTip> : null}
                  </Label>
                  <Select
                    value={mapping.columns[field] ?? NOT_IN_FILE}
                    onValueChange={(value: string | null) => chooseColumn(field, value)}
                    disabled={busy}
                  >
                    <SelectTrigger
                      id={`donation-column-${field}`}
                      className="w-full min-w-0"
                    >
                      <SelectValue>
                        {(value: string | null) =>
                          !value || value === NOT_IN_FILE
                            ? required
                              ? "Choose a column"
                              : "Not in this file"
                            : value
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {required ? null : (
                        <SelectItem value={NOT_IN_FILE}>Not in this file</SelectItem>
                      )}
                      {headerOptions.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {preview.numericDates ? (
              <div className="grid gap-1 sm:max-w-sm">
                <Label htmlFor="donation-date-order" className="text-xs">
                  Date order
                </Label>
                <Select
                  value={mapping.dateOrder}
                  onValueChange={(value: string | null) => {
                    if (value === "mdy" || value === "dmy") {
                      refreshPreview({ ...mapping, dateOrder: value });
                    }
                  }}
                  disabled={busy}
                >
                  <SelectTrigger id="donation-date-order" className="w-full">
                    <SelectValue>
                      {(value: string | null) =>
                        value === "dmy" ? "Day / Month / Year" : "Month / Day / Year"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mdy">Month / Day / Year</SelectItem>
                    <SelectItem value="dmy">Day / Month / Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {mapping.columns.status && preview.statusValues.length > 0 ? (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">
                  Which statuses mean the money was received?
                </p>
                <p className="text-xs text-muted-foreground">
                  Other rows count as failed payments and are not added.
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {preview.statusValues.map((item) => (
                    <label
                      key={item.value}
                      className="flex min-h-8 items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={mapping.successStatuses.includes(item.value)}
                        onCheckedChange={(checked) =>
                          toggleStatus(item.value, checked === true)
                        }
                        disabled={busy}
                      />
                      {item.value}
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {item.count}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </fieldset>

          <PreviewTable
            preview={preview}
            currency={proposal.currency}
            pending={previewPending}
          />
        </div>

        <DialogFooter className="m-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={saveAndImport} disabled={!canSave}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Importing donations…
              </>
            ) : (
              "Save format and import"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AiStatus({
  state,
  error,
  available,
  disabled,
  onAsk,
}: {
  state: "idle" | "running" | "used";
  error: string | null;
  available: boolean;
  disabled: boolean;
  onAsk: () => void;
}) {
  if (state === "running") {
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm"
      >
        <Loader2 className="size-4 shrink-0 animate-spin" />
        AI is reading the column names…
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {state === "used" ? (
        <p className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 shrink-0 text-primary" />
          AI suggested these columns. Check them before you import.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-warning-text">
          {error}
        </p>
      ) : null}
      {available && state !== "used" ? (
        <span className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAsk}
            disabled={disabled}
          >
            <Sparkles className="size-4" />
            Suggest with AI
          </Button>
          <HelpTip label="What AI sees">
            AI sees only column names and masked patterns such as
            &ldquo;October 99, 9999&rdquo;. It does not see donor names, contact
            details, or notes.
          </HelpTip>
        </span>
      ) : null}
    </div>
  );
}

function PreviewTable({
  preview,
  currency,
  pending,
}: {
  preview: DonationCsvPreview;
  currency: string;
  pending: boolean;
}) {
  return (
    <section
      aria-busy={pending}
      className={cn(
        "space-y-2 transition-opacity motion-reduce:transition-none",
        pending && "opacity-60"
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-medium">Preview</h3>
        {preview.error ? null : (
          <p className="text-xs tabular-nums text-muted-foreground">
            {preview.receivedRows} received
            {preview.failedRows ? ` · ${preview.failedRows} not received` : ""} ·{" "}
            <span className="font-medium text-foreground">
              {money(preview.receivedAmount, currency)}
            </span>
          </p>
        )}
      </div>
      {preview.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          {preview.error}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm sm:min-w-[32rem]">
            <thead>
              <tr className="border-b bg-muted/35 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Gift date</th>
                <th className="px-3 py-2 font-medium">Donor</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">
                  Campaign or fund
                </th>
              </tr>
            </thead>
            <tbody>
              {preview.sample.map((row) => (
                <tr key={row.rowNumber} className="border-b last:border-b-0">
                  <td className="whitespace-nowrap px-3 py-2">{giftDate(row.date)}</td>
                  <td className="max-w-32 truncate px-3 py-2 sm:max-w-48">{row.donor}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {money(row.amount, currency)}
                  </td>
                  <td className="hidden max-w-56 truncate px-3 py-2 text-muted-foreground sm:table-cell">
                    {row.campaign ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {preview.error ? null : preview.receivedRows > preview.sample.length ? (
        <p className="text-xs text-muted-foreground">
          Showing the first {preview.sample.length} of {preview.receivedRows}{" "}
          received rows.
        </p>
      ) : null}
    </section>
  );
}
