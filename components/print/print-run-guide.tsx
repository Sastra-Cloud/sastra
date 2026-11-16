"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { GuidedSteps, type GuidedStep } from "@/components/guidance/guided-steps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPrintContact, createPrintRun } from "@/lib/print/actions";
import {
  measurementInputFromInches,
  measurementToInches,
  type MeasurementUnit,
} from "@/lib/print/estimate";
import { suggestedBookSpecs, type PrintSpecPreset } from "@/lib/print/spec-presets";

const selectClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
const NEW_PRINTER = "new";
const DEFAULT_QUANTITIES = [1000, 2000, 3000];

type PrinterOption = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
};

export type PrintRunGuideLastRun = {
  title: string;
  contactId: string | null;
  quantityTarget: number | null;
  requestedQuantities: number[] | null;
  textPaper: string | null;
  coverPaper: string | null;
  binding: string | null;
  deliveryLocation: string | null;
};

/**
 * Guided print run setup. It starts from what Sastra already knows: the default
 * printer, the book size and page estimate, and the specs of earlier print
 * runs. Creating the run never emails the printer.
 */
export function PrintRunGuide({
  projectId,
  projectTitle,
  contacts,
  defaultContactId,
  trimWidthIn,
  trimHeightIn,
  unit,
  estimatedPages,
  lastRun,
  specPresets,
  onCreated,
  onSkip,
}: {
  projectId: string;
  projectTitle: string;
  contacts: PrinterOption[];
  defaultContactId: string | null;
  trimWidthIn: string;
  trimHeightIn: string;
  unit: MeasurementUnit;
  estimatedPages: number;
  /** This project's most recent print run, if any. */
  lastRun: PrintRunGuideLastRun | null;
  specPresets: PrintSpecPreset[];
  onCreated: (runId: string, writeRequest: boolean) => void;
  onSkip: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);

  // Printer: the default, the last one used, or the only one saved.
  const knownPrinter =
    [defaultContactId, lastRun?.contactId].find(
      (id) => id && contacts.some((contact) => contact.id === id)
    ) ?? (contacts.length === 1 ? contacts[0].id : "");
  const printerSource =
    knownPrinter && knownPrinter === defaultContactId
      ? "This is the default printer for this project."
      : knownPrinter && knownPrinter === lastRun?.contactId
        ? "Used on the last print run."
        : knownPrinter
          ? "This is the only saved printer."
          : null;
  const [printer, setPrinter] = useState<string>(
    knownPrinter || (contacts.length === 0 ? NEW_PRINTER : "")
  );
  const [newPrinter, setNewPrinter] = useState({ name: "", company: "", email: "" });

  // Copies
  const [target, setTarget] = useState(
    lastRun?.quantityTarget ? String(lastRun.quantityTarget) : ""
  );
  const [quantities, setQuantities] = useState<number[]>(
    lastRun?.requestedQuantities?.length
      ? [...lastRun.requestedQuantities].sort((a, b) => a - b)
      : DEFAULT_QUANTITIES
  );
  const [quantityDraft, setQuantityDraft] = useState("");

  // Book details
  const suggestion = suggestedBookSpecs(specPresets, projectId);
  const [specSource, setSpecSource] = useState(
    lastRun && (lastRun.textPaper || lastRun.coverPaper || lastRun.binding)
      ? "the last print run"
      : (suggestion?.projectTitle ?? null)
  );
  const [width, setWidth] = useState(() => measurementInputFromInches(trimWidthIn, unit));
  const [height, setHeight] = useState(() => measurementInputFromInches(trimHeightIn, unit));
  const [textPaper, setTextPaper] = useState(lastRun?.textPaper ?? suggestion?.textPaper ?? "");
  const [coverPaper, setCoverPaper] = useState(lastRun?.coverPaper ?? suggestion?.coverPaper ?? "");
  const [binding, setBinding] = useState(lastRun?.binding ?? suggestion?.binding ?? "");
  const [delivery, setDelivery] = useState(lastRun?.deliveryLocation ?? "");

  // Review
  const [title, setTitle] = useState(projectTitle);
  const [writeRequest, setWriteRequest] = useState(true);

  const selectedPrinter = contacts.find((contact) => contact.id === printer) ?? null;
  const newPrinterEmailValid =
    !newPrinter.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newPrinter.email.trim());
  const printerReady =
    printer !== NEW_PRINTER || (newPrinter.name.trim().length > 0 && newPrinterEmailValid);
  const printerLabel =
    printer === NEW_PRINTER
      ? newPrinter.company.trim() || newPrinter.name.trim()
      : selectedPrinter
        ? selectedPrinter.company || selectedPrinter.name
        : "";
  const printerEmail =
    printer === NEW_PRINTER ? newPrinter.email.trim() : (selectedPrinter?.email ?? "");
  const targetNumber = Math.max(0, Math.round(Number(target) || 0));
  const widthIn = measurementToInches(width, unit);
  const heightIn = measurementToInches(height, unit);
  const sizeValid =
    Number.isFinite(widthIn) && Number.isFinite(heightIn) &&
    widthIn >= 1 && widthIn <= 20 && heightIn >= 1 && heightIn <= 20;
  const canWriteRequest = Boolean(printerLabel);

  function addQuantity(raw: string | number) {
    const value = Math.round(Number(raw));
    if (!Number.isFinite(value) || value < 1) return;
    setQuantities((all) =>
      all.includes(value) ? all : [...all, value].sort((a, b) => a - b)
    );
    setQuantityDraft("");
  }
  function copySpecs(id: string) {
    const preset = specPresets.find((item) => item.id === id);
    if (!preset) return;
    setWidth(measurementInputFromInches(preset.trimWidthIn, unit));
    setHeight(measurementInputFromInches(preset.trimHeightIn, unit));
    setTextPaper(preset.textPaper ?? "");
    setCoverPaper(preset.coverPaper ?? "");
    setBinding(preset.binding ?? "");
    setSpecSource(preset.projectTitle);
  }

  function create() {
    setError(null);
    start(async () => {
      try {
        let contactId = printer && printer !== NEW_PRINTER ? printer : null;
        if (printer === NEW_PRINTER) {
          const saved = await createPrintContact({
            name: newPrinter.name.trim(),
            company: newPrinter.company.trim(),
            email: newPrinter.email.trim(),
            domain: "",
          });
          contactId = saved.id;
          // A retry must reuse the printer that was just saved.
          setPrinter(saved.id);
        }
        const result = await createPrintRun(projectId, {
          title: title.trim() || projectTitle,
          contactId,
          quantityTarget: targetNumber > 0 ? targetNumber : null,
          requestedQuantities: quantities,
          trimWidthIn: widthIn,
          trimHeightIn: heightIn,
          textPaper: textPaper.trim(),
          coverPaper: coverPaper.trim(),
          binding: binding.trim(),
          deliveryLocation: delivery.trim(),
        });
        if (!result || "error" in result) {
          setError(result?.error ?? "Couldn’t create the print run. Try again.");
          return;
        }
        toast.success("Print run created");
        onCreated(result.id, writeRequest && canWriteRequest);
        router.refresh();
      } catch {
        setError(
          "Couldn’t create the print run. Your details are still here. Check your internet and try again."
        );
      }
    });
  }

  const steps: GuidedStep[] = [
    {
      key: "printer",
      label: "Printer",
      hint: "Who prints it",
      canContinue: printerReady,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-medium">Which printer will you ask?</h4>
            <p className="text-sm text-muted-foreground">
              A print run is one order to print copies of this book.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="run-guide-printer">Printer</Label>
            <select
              id="run-guide-printer"
              className={selectClass}
              value={printer}
              onChange={(event) => setPrinter(event.target.value)}
            >
              <option value="">Decide later</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.company || contact.name}
                </option>
              ))}
              <option value={NEW_PRINTER}>A new printer…</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {printer === knownPrinter && printerSource
                ? printerSource
                : printer === ""
                  ? "You can add the printer later. You need one to ask for prices."
                  : selectedPrinter && !selectedPrinter.email
                    ? "This printer has no email yet. Add it in Print defaults before you send a request."
                    : null}
            </p>
          </div>
          {printer === NEW_PRINTER ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="run-guide-printer-name">Contact name</Label>
                <Input
                  id="run-guide-printer-name"
                  maxLength={200}
                  value={newPrinter.name}
                  onChange={(event) => setNewPrinter({ ...newPrinter, name: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="run-guide-printer-company">Company</Label>
                <Input
                  id="run-guide-printer-company"
                  maxLength={200}
                  value={newPrinter.company}
                  onChange={(event) => setNewPrinter({ ...newPrinter, company: event.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="run-guide-printer-email">Email</Label>
                <Input
                  id="run-guide-printer-email"
                  type="email"
                  maxLength={320}
                  aria-invalid={!newPrinterEmailValid}
                  value={newPrinter.email}
                  onChange={(event) => setNewPrinter({ ...newPrinter, email: event.target.value })}
                />
                <p className={`text-xs ${newPrinterEmailValid ? "text-muted-foreground" : "text-destructive"}`}>
                  {newPrinterEmailValid
                    ? "Sastra saves this printer so you can choose it next time."
                    : "Enter a full email address, for example name@example.org."}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "copies",
      label: "Copies",
      hint: "How many to print",
      canContinue: quantities.length > 0,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-medium">How many copies?</h4>
            <p className="text-sm text-muted-foreground">
              Printers give a better price for more copies. Ask for a few
              amounts so you can compare.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Copy amounts to ask prices for</Label>
            <ul className="flex flex-wrap gap-2" aria-label="Copy amounts">
              {quantities.map((quantity) => (
                <li key={quantity}>
                  <span className="inline-flex min-h-11 items-center gap-1 rounded-full border bg-muted/40 pl-3 pr-1 text-sm tabular-nums sm:min-h-9">
                    {quantity.toLocaleString()}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${quantity.toLocaleString()} copies`}
                      onClick={() => setQuantities((all) => all.filter((item) => item !== quantity))}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex max-w-xs gap-2">
              <Input
                aria-label="Another copy amount"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                placeholder="For example 1500"
                value={quantityDraft}
                onChange={(event) => setQuantityDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addQuantity(quantityDraft);
                  }
                }}
              />
              <Button type="button" variant="outline" disabled={!quantityDraft} onClick={() => addQuantity(quantityDraft)}>
                <Plus className="size-4" />
                Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {quantities.length === 0
                ? "Add at least one copy amount."
                : lastRun?.requestedQuantities?.length
                  ? "These started from the last print run."
                  : "These are common amounts. Change them to fit this book."}
            </p>
          </div>
          <div className="max-w-xs space-y-2">
            <Label htmlFor="run-guide-target">Copies you plan to print (optional)</Label>
            <Input
              id="run-guide-target"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="If you already know"
            />
            {targetNumber > 0 && !quantities.includes(targetNumber) ? (
              <Button type="button" variant="link" className="min-h-11 px-0" onClick={() => addQuantity(targetNumber)}>
                Also ask for a price for {targetNumber.toLocaleString()} copies
              </Button>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "book",
      label: "Book details",
      hint: "Size and paper",
      canContinue: sizeValid,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-medium">What should the printer make?</h4>
            <p className="text-sm text-muted-foreground">
              Fill in what you know. The printer can suggest the rest.
            </p>
          </div>
          {specPresets.length ? (
            <div className="space-y-2">
              <Label htmlFor="run-guide-same">Same specs as…</Label>
              <select
                id="run-guide-same"
                className={selectClass}
                value=""
                onChange={(event) => copySpecs(event.target.value)}
              >
                <option value="">Choose a book to copy its size, paper, and binding</option>
                {specPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.projectTitle}
                  </option>
                ))}
              </select>
              {specSource ? (
                <p className="text-xs text-muted-foreground">
                  Paper, cover, and binding are filled in from {specSource}. You can change every field.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="run-guide-width">Width ({unit})</Label>
              <Input id="run-guide-width" type="number" inputMode="decimal" step="any" min={0} aria-invalid={!sizeValid} value={width} onChange={(event) => setWidth(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="run-guide-height">Height ({unit})</Label>
              <Input id="run-guide-height" type="number" inputMode="decimal" step="any" min={0} aria-invalid={!sizeValid} value={height} onChange={(event) => setHeight(event.target.value)} />
            </div>
            <div className="space-y-1">
              <span className="block text-sm font-medium">Pages</span>
              <p className="py-2 text-sm tabular-nums">
                {estimatedPages > 0 ? `About ${estimatedPages.toLocaleString()}` : "Not known yet"}
              </p>
            </div>
          </div>
          <p className={`text-xs ${sizeValid ? "text-muted-foreground" : "text-destructive"}`}>
            {!sizeValid
              ? "Enter the book’s width and height."
              : estimatedPages > 0
                ? "The size comes from book details. Pages are estimated from the original book."
                : "The size comes from book details. Add the pages of the original book in Print defaults so Sastra can estimate the pages."}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="run-guide-text">Inside paper</Label>
              <Input id="run-guide-text" maxLength={500} value={textPaper} onChange={(event) => setTextPaper(event.target.value)} placeholder="For example 80gsm woodfree, black ink" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="run-guide-cover">Cover</Label>
              <Input id="run-guide-cover" maxLength={500} value={coverPaper} onChange={(event) => setCoverPaper(event.target.value)} placeholder="For example 250gsm, matte lamination" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="run-guide-binding">Binding</Label>
              <Input id="run-guide-binding" maxLength={300} value={binding} onChange={(event) => setBinding(event.target.value)} placeholder="For example perfect bound" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="run-guide-delivery">Delivery place</Label>
              <Input id="run-guide-delivery" maxLength={200} value={delivery} onChange={(event) => setDelivery(event.target.value)} placeholder="Leave empty to use your workspace default" />
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "review",
      label: "Review",
      hint: "Check and create",
      nextLabel: "Create print run",
      canContinue: printerReady && quantities.length > 0 && sizeValid && title.trim().length > 0,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-medium">Check the print run</h4>
            <p className="text-sm text-muted-foreground">
              Creating the print run does not email the printer.
            </p>
          </div>
          <div className="max-w-md space-y-2">
            <Label htmlFor="run-guide-title">Name of this print run</Label>
            <Input id="run-guide-title" maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <dl className="divide-y rounded-lg border text-sm">
            <Row label="Printer" value={printerLabel || "Decide later"} detail={printerLabel ? printerEmail || "No email yet" : undefined} onEdit={() => setCurrent(0)} />
            <Row
              label="Copies"
              value={`Prices for ${quantities.map((quantity) => quantity.toLocaleString()).join(", ")}`}
              detail={targetNumber > 0 ? `Plan to print ${targetNumber.toLocaleString()}` : undefined}
              onEdit={() => setCurrent(1)}
            />
            <Row
              label="Book details"
              value={`${width} × ${height} ${unit}${estimatedPages > 0 ? ` · about ${estimatedPages.toLocaleString()} pages` : ""}`}
              detail={[textPaper.trim(), coverPaper.trim(), binding.trim()].filter(Boolean).join(" · ") || "Paper and binding not entered"}
              onEdit={() => setCurrent(2)}
            />
          </dl>
          <label className={`flex min-h-11 items-start gap-2 text-sm ${canWriteRequest ? "cursor-pointer" : "text-muted-foreground"}`}>
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={writeRequest && canWriteRequest}
              disabled={!canWriteRequest}
              onChange={(event) => setWriteRequest(event.target.checked)}
            />
            <span>
              Write the price request email next
              <span className="block text-xs text-muted-foreground">
                {canWriteRequest
                  ? "Sastra writes it. You check it before it is sent."
                  : "Choose a printer first."}
              </span>
            </span>
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-3xl" aria-busy={pending}>
      <p className="mb-5 text-sm text-muted-foreground">
        Four short steps. Sastra fills in what it already knows.
      </p>
      <GuidedSteps
        steps={steps}
        current={current}
        onCurrentChange={setCurrent}
        onFinish={create}
        finishing={pending}
        onSkip={onSkip}
        scrollOnChange
        skipLabel="Use the short form"
      />
    </div>
  );
}

function Row({
  label,
  value,
  detail,
  onEdit,
}: {
  label: string;
  value: string;
  detail?: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="break-words">{value}</dd>
        {detail ? <dd className="break-words text-xs text-muted-foreground">{detail}</dd> : null}
      </div>
      <Button type="button" variant="link" size="sm" className="min-h-11 px-1 sm:min-h-8" onClick={onEdit}>
        Change<span className="sr-only"> {label}</span>
      </Button>
    </div>
  );
}
