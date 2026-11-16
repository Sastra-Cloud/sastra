"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { GuidedSteps, type GuidedStep } from "@/components/guidance/guided-steps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  grossTargetCents,
  lineQuantity,
  type BudgetRates,
} from "@/lib/budget/compute";
import { proposalCostRows } from "@/lib/budget/proposal-builder";
import {
  budgetSetupTotalCents,
  setupCostsWaitingForSize,
  setupStandardCosts,
  type BudgetSetupPartner,
  type SetupCostDraft,
} from "@/lib/budget/setup";
import { createGuidedBudget } from "@/lib/budget/setup-actions";

const selectClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm";

const UNIT_HINTS = {
  words: "Per word. Uses the word count.",
  pages: "Per page. Uses the page estimate.",
  cover: "Per cover.",
  project: "Per project.",
  flat: "Flat fee.",
} as const;

export type SetupPartnerOption = {
  id: string;
  name: string;
  contacts: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    isPrimary: boolean;
  }[];
};

const NEW_PARTNER = "new";

/**
 * Guided budget setup, shown when a project has no costs yet. It asks for the
 * book size, lets the person choose costs at this project's rates, and records
 * the funding partner. One save; nothing is emailed.
 */
export function BudgetSetupGuide({
  projectId,
  currency,
  rates,
  wordCount: savedWordCount,
  sourcePageCount: savedSourcePages,
  wordsPerPage,
  languageExpansionFactor,
  partners,
  savedPartner,
  deductionBps,
  showPrintingNote,
  onSkip,
}: {
  projectId: string;
  currency: string;
  rates: BudgetRates;
  wordCount: number;
  sourcePageCount: number;
  wordsPerPage: number;
  languageExpansionFactor: string;
  partners: SetupPartnerOption[];
  /** The funding partner already known for this project, if any. */
  savedPartner: BudgetSetupPartner | null;
  /** Organization fee for the partner quote, when one is set up. */
  deductionBps: number | null;
  showPrintingNote: boolean;
  onSkip: () => void;
}) {
  const router = useRouter();
  const [requestId] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);

  const [words, setWords] = useState(savedWordCount > 0 ? String(savedWordCount) : "");
  const [pages, setPages] = useState(savedSourcePages > 0 ? String(savedSourcePages) : "");
  const [lines, setLines] = useState<SetupCostDraft[]>(() => setupStandardCosts(rates));

  const [partnerChoice, setPartnerChoice] = useState(
    savedPartner ? (savedPartner.partnerId ?? NEW_PARTNER) : ""
  );
  const [contactId, setContactId] = useState(savedPartner?.contactId ?? "");
  const [partnerName, setPartnerName] = useState(savedPartner?.name ?? "");
  const [firstName, setFirstName] = useState(savedPartner?.firstName ?? "");
  const [lastName, setLastName] = useState(savedPartner?.lastName ?? "");
  const [email, setEmail] = useState(savedPartner?.email ?? "");

  const basis = {
    wordCount: Math.max(0, Math.round(Number(words) || 0)),
    sourcePageCount: Math.max(0, Math.round(Number(pages) || 0)),
  };
  const quantityBasis = { wordsPerPage, languageExpansionFactor };
  const printedPages = lineQuantity("pages", { ...basis, ...quantityBasis });
  const rows = proposalCostRows({ ...basis, lines }, quantityBasis);
  const included = rows.filter((_, index) => lines[index].included);
  const totalCents = budgetSetupTotalCents(included);
  const waitingCount = setupCostsWaitingForSize({ ...basis, lines: included });
  const namedCosts = included.every((line) => line.label.trim().length > 0);
  const askCents =
    deductionBps != null ? grossTargetCents(totalCents, deductionBps) : null;

  const money = (cents: number) => {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency}`;
    }
  };
  const changeLine = (key: string, patch: Partial<SetupCostDraft>) =>
    setLines((all) => all.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const selectedPartner = partners.find((partner) => partner.id === partnerChoice) ?? null;
  const hasPartner = partnerChoice !== "" && partnerName.trim().length > 0;
  const emailValid = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  function fillContact(contact: SetupPartnerOption["contacts"][number] | null) {
    setContactId(contact?.id ?? "");
    setFirstName(contact?.firstName ?? "");
    setLastName(contact?.lastName ?? "");
    setEmail(contact?.email ?? "");
  }
  function choosePartner(value: string) {
    setPartnerChoice(value);
    const partner = partners.find((item) => item.id === value) ?? null;
    if (partner) {
      setPartnerName(partner.name);
      fillContact(partner.contacts.find((c) => c.isPrimary) ?? partner.contacts[0] ?? null);
    } else {
      setPartnerName("");
      fillContact(null);
    }
  }

  function save() {
    setError(null);
    start(async () => {
      try {
        const result = await createGuidedBudget(projectId, {
          requestId,
          ...basis,
          lines: lines
            .filter((line) => line.included)
            .map(({ category, label, unit, quantity, unitPrice, autoQuantity }) => ({
              category,
              label: label.trim(),
              unit,
              quantity,
              unitPrice,
              autoQuantity,
            })),
          partner: hasPartner
            ? {
                partnerId: selectedPartner?.id ?? null,
                contactId: selectedPartner && contactId ? contactId : null,
                name: partnerName.trim(),
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.trim(),
              }
            : null,
        });
        if ("error" in result) {
          setError(result.error);
          return;
        }
        toast.success("Budget created");
        router.refresh();
      } catch {
        setError(
          "Couldn’t save the budget. Your details are still here. Check your internet and try again."
        );
      }
    });
  }

  const steps: GuidedStep[] = [
    {
      key: "size",
      label: "Book size",
      hint: "Words and pages",
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-medium">How big is the book?</h4>
            <p className="text-sm text-muted-foreground">
              Sastra uses this to calculate translation, editing, and
              typesetting costs. You can change it later.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="setup-words">Word count</Label>
              <Input
                id="setup-words"
                type="number"
                inputMode="numeric"
                min={0}
                max={100_000_000}
                step={1}
                value={words}
                onChange={(event) => setWords(event.target.value)}
                placeholder="For example 45000"
              />
              {savedWordCount > 0 ? (
                <p className="text-xs text-muted-foreground">Already saved for this project.</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-pages">Pages in the original book</Label>
              <Input
                id="setup-pages"
                type="number"
                inputMode="numeric"
                min={0}
                max={1_000_000}
                step={1}
                value={pages}
                onChange={(event) => setPages(event.target.value)}
                placeholder="If you know it"
              />
              {savedSourcePages > 0 ? (
                <p className="text-xs text-muted-foreground">From book details.</p>
              ) : null}
            </div>
          </div>
          <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground" aria-live="polite">
            {printedPages > 0
              ? `Estimated pages after translation: ${printedPages.toLocaleString()}.`
              : "Not sure yet? Leave both empty. Costs that need the book size will wait."}
          </p>
        </div>
      ),
    },
    {
      key: "costs",
      label: "Costs",
      hint: "Choose what to include",
      canContinue: included.length > 0 && namedCosts,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-medium">Which costs does this project have?</h4>
            <p className="text-sm text-muted-foreground">
              Rates come from your workspace settings. Change a rate or quantity
              if this project is different.
            </p>
          </div>
          <div className="divide-y rounded-lg border">
            <div className="hidden gap-3 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[minmax(10rem,1fr)_7rem_7rem_6.5rem]" aria-hidden>
              <span>Cost</span>
              <span>Quantity</span>
              <span>Rate ({currency})</span>
              <span>Amount</span>
            </div>
            {lines.map((line, index) => {
              const row = rows[index];
              const automatic =
                line.autoQuantity && (line.unit === "words" || line.unit === "pages");
              const name = line.category === "custom" ? line.label.trim() || "Custom cost" : line.label;
              return (
                <div
                  key={line.key}
                  className={`grid min-w-0 gap-x-3 gap-y-2 px-3 py-2 sm:grid-cols-[minmax(10rem,1fr)_7rem_7rem_6.5rem] sm:items-center ${line.included ? "" : "bg-muted/20"}`}
                >
                  <div className="min-w-0">
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium sm:min-h-9">
                      <input
                        type="checkbox"
                        className="size-4 shrink-0"
                        checked={line.included}
                        onChange={(event) => changeLine(line.key, { included: event.target.checked })}
                      />
                      <span className="break-words">
                        {line.category === "custom" ? "Custom cost" : line.label}
                      </span>
                    </label>
                    {line.category === "custom" ? (
                      <Input
                        aria-label="Custom cost name"
                        maxLength={200}
                        value={line.label}
                        onChange={(event) => changeLine(line.key, { label: event.target.value })}
                        placeholder="For example Freight"
                      />
                    ) : (
                      <p className="pl-6 text-xs text-muted-foreground">
                        {automatic && line.included && row.quantity === 0
                          ? "Waits for the book size."
                          : UNIT_HINTS[line.unit]}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3 sm:contents">
                    <div className="space-y-1">
                      <Label htmlFor={`setup-qty-${line.key}`} className="text-xs sm:sr-only">Quantity<span className="sr-only"> for {name}</span></Label>
                      <Input
                        id={`setup-qty-${line.key}`}
                        type="number"
                        min={0}
                        max={100_000_000}
                        step="0.01"
                        disabled={!line.included || automatic}
                        value={row.quantity}
                        onChange={(event) =>
                          changeLine(line.key, { quantity: Number(event.target.value) || 0, autoQuantity: false })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`setup-rate-${line.key}`} className="text-xs sm:sr-only">Rate<span className="sr-only"> for {name}</span></Label>
                      <Input
                        id={`setup-rate-${line.key}`}
                        type="number"
                        min={0}
                        max={1_000_000}
                        step="0.0001"
                        disabled={!line.included}
                        value={line.unitPrice}
                        onChange={(event) => changeLine(line.key, { unitPrice: Number(event.target.value) || 0 })}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-1 sm:block">
                      <div className="space-y-1">
                        <span className="block text-xs font-medium sm:sr-only">Amount</span>
                        <output className="block break-words text-sm font-medium tabular-nums sm:py-2">
                          {money(line.included ? Math.round(Number(row.amount) * 100) : 0)}
                        </output>
                      </div>
                      {line.category === "custom" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${name}`}
                          onClick={() => setLines((all) => all.filter((item) => item.key !== line.key))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={lines.length >= 40}
              onClick={() =>
                setLines((all) => [
                  ...all,
                  {
                    key: crypto.randomUUID(),
                    category: "custom",
                    label: "",
                    unit: "flat",
                    quantity: 1,
                    unitPrice: 0,
                    autoQuantity: false,
                    included: true,
                  },
                ])
              }
            >
              <Plus className="size-4" />
              Add custom cost
            </Button>
            <p className="text-sm" aria-live="polite">
              <span className="text-muted-foreground">Costs total </span>
              <output className="text-lg font-semibold tabular-nums">{money(totalCents)}</output>
            </p>
          </div>
          {!namedCosts ? (
            <p className="text-sm text-destructive">Give each custom cost a name, or remove it.</p>
          ) : null}
          {showPrintingNote ? (
            <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Printing is not in this list. After setup, the next step asks a
              printer for an estimate and adds it to the budget.
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "partner",
      label: "Funding partner",
      hint: "Who will be asked",
      canContinue: emailValid && (partnerChoice !== NEW_PARTNER || partnerName.trim().length > 0),
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-medium">Who will you ask to fund this?</h4>
            <p className="text-sm text-muted-foreground">
              You can decide later. A project can also have several partners.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-partner">Partner</Label>
            <select
              id="setup-partner"
              className={selectClass}
              value={partnerChoice}
              onChange={(event) => choosePartner(event.target.value)}
            >
              <option value="">Decide later</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                </option>
              ))}
              <option value={NEW_PARTNER}>A new partner…</option>
            </select>
            {savedPartner && partnerChoice === (savedPartner.partnerId ?? NEW_PARTNER) ? (
              <p className="text-xs text-muted-foreground">Already recorded for this project.</p>
            ) : null}
          </div>
          {partnerChoice === NEW_PARTNER ? (
            <div className="space-y-2">
              <Label htmlFor="setup-partner-name">Partner name</Label>
              <Input
                id="setup-partner-name"
                maxLength={200}
                value={partnerName}
                onChange={(event) => setPartnerName(event.target.value)}
                placeholder="Organization or person"
              />
              <p className="text-xs text-muted-foreground">
                Sastra saves new partners so you can choose them next time.
              </p>
            </div>
          ) : null}
          {partnerChoice !== "" ? (
            <>
              {selectedPartner && selectedPartner.contacts.length > 1 ? (
                <div className="space-y-2">
                  <Label htmlFor="setup-contact">Contact person</Label>
                  <select
                    id="setup-contact"
                    className={selectClass}
                    value={contactId}
                    onChange={(event) =>
                      fillContact(
                        selectedPartner.contacts.find((c) => c.id === event.target.value) ?? null
                      )
                    }
                  >
                    <option value="">Someone else</option>
                    {selectedPartner.contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {[contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
                          contact.email ||
                          "Contact"}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="setup-first">Contact first name</Label>
                  <Input id="setup-first" maxLength={120} value={firstName} onChange={(event) => { setFirstName(event.target.value); setContactId(""); }} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-last">Contact last name</Label>
                  <Input id="setup-last" maxLength={120} value={lastName} onChange={(event) => { setLastName(event.target.value); setContactId(""); }} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-email">Contact email</Label>
                <Input
                  id="setup-email"
                  type="email"
                  maxLength={320}
                  aria-invalid={!emailValid}
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); setContactId(""); }}
                />
                <p className={`text-xs ${emailValid ? "text-muted-foreground" : "text-destructive"}`}>
                  {emailValid
                    ? email.trim()
                      ? "Sastra sends the proposal to this address after you review it."
                      : "You need an email to send a proposal. You can add it later."
                    : "Enter a full email address, for example name@example.org."}
                </p>
              </div>
            </>
          ) : null}
        </div>
      ),
    },
    {
      key: "review",
      label: "Review",
      hint: "Check and create",
      nextLabel: "Create budget",
      canContinue: included.length > 0 && namedCosts && emailValid,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-medium">Check the budget</h4>
            <p className="text-sm text-muted-foreground">
              Creating the budget does not email anyone. You can change
              everything afterward in Quotation.
            </p>
          </div>
          <dl className="divide-y rounded-lg border text-sm">
            <ReviewRow
              label="Book size"
              value={
                basis.wordCount || basis.sourcePageCount
                  ? [
                      basis.wordCount ? `${basis.wordCount.toLocaleString()} words` : null,
                      basis.sourcePageCount ? `${basis.sourcePageCount.toLocaleString()} original pages` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "Not entered yet"
              }
              onEdit={() => setCurrent(0)}
            />
            <ReviewRow
              label={`Costs (${included.length})`}
              value={<span className="font-semibold tabular-nums">{money(totalCents)}</span>}
              detail={included.map((line) => line.label.trim() || "Custom cost").join(", ")}
              onEdit={() => setCurrent(1)}
            />
            {askCents != null && deductionBps ? (
              <ReviewRow
                label="Amount needed from partners"
                value={<span className="font-semibold tabular-nums">{money(askCents)}</span>}
                detail={`The costs, plus enough to cover the ${(deductionBps / 100).toFixed(2).replace(/\.?0+$/, "")}% organization fee. After setup, Budget steps shows how to set the partner quote.`}
              />
            ) : null}
            <ReviewRow
              label="Funding partner"
              value={hasPartner ? partnerName.trim() : "Decide later"}
              detail={
                hasPartner
                  ? [[firstName, lastName].filter(Boolean).join(" "), email.trim() || "No email yet"]
                      .filter(Boolean)
                      .join(" · ")
                  : undefined
              }
              onEdit={() => setCurrent(2)}
            />
          </dl>
          {waitingCount > 0 ? (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-text">
              {waitingCount} {waitingCount === 1 ? "cost shows" : "costs show"} 0
              until you enter the book size. Budget steps will remind you.
            </p>
          ) : null}
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
    <div className="max-w-3xl rounded-xl border bg-card p-4 sm:p-6" aria-busy={pending}>
      <div className="mb-5">
        <h3 className="text-base font-semibold">Set up the budget</h3>
        <p className="text-sm text-muted-foreground">
          Four short steps. Sastra fills in what it already knows.
        </p>
      </div>
      <GuidedSteps
        steps={steps}
        current={current}
        onCurrentChange={setCurrent}
        onFinish={save}
        finishing={pending}
        onSkip={onSkip}
        scrollOnChange
      />
    </div>
  );
}

function ReviewRow({
  label,
  value,
  detail,
  onEdit,
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  onEdit?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="break-words">{value}</dd>
        {detail ? <dd className="break-words text-xs text-muted-foreground">{detail}</dd> : null}
      </div>
      {onEdit ? (
        <Button type="button" variant="link" size="sm" className="min-h-11 px-1 sm:min-h-8" onClick={onEdit}>
          Change<span className="sr-only"> {label}</span>
        </Button>
      ) : null}
    </div>
  );
}
