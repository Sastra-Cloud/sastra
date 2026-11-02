"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProposalBudget } from "@/lib/budget/proposal-actions";
import {
  proposalCostRows, proposalCostTotalCents, proposalStandardCosts,
  type ProposalBudgetDefaults, type ProposalBudgetInput, type ProposalCost,
} from "@/lib/budget/proposal-builder";

const selectClass = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
const units = { words: "words", pages: "pages", cover: "cover", project: "project", flat: "flat fee" } as const;
type DraftCost = ProposalCost & { key: string; included: boolean };

export function ProposalBudgetBuilder({ defaults }: { defaults: ProposalBudgetDefaults }) {
  const router = useRouter();
  const [requestId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ProposalBudgetInput["kind"]>("book");
  const [sourceLanguage, setSourceLanguage] = useState(defaults.sourceLanguage ?? "");
  const [targetLanguage, setTargetLanguage] = useState(defaults.targetLanguage ?? "");
  const [currency, setCurrency] = useState(defaults.currency);
  const [wordCount, setWordCount] = useState("");
  const [pageCount, setPageCount] = useState("");
  const [lines, setLines] = useState<DraftCost[]>(() => proposalStandardCosts(defaults).map(line => ({
    ...line, key: line.category, included: line.category !== "audiobook" && line.category !== "video_series",
  })));
  const [dirty, setDirty] = useState(false);
  const basis = { wordCount: Number(wordCount) || 0, sourcePageCount: Number(pageCount) || 0 };
  const displayed = proposalCostRows({ ...basis, lines }, defaults);
  const selected = displayed.filter((_, index) => lines[index].included);
  const totalCents = proposalCostTotalCents(selected);
  const quantitiesUnknown = selected.some(line => line.autoQuantity && (line.unit === "words" || line.unit === "pages") && line.quantity === 0);
  const money = (cents: number) => {
    const code = /^[A-Z]{3}$/.test(currency) ? currency : defaults.currency;
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(cents / 100); }
    catch { return `${(cents / 100).toFixed(2)} ${code}`; }
  };
  const changeLine = (key: string, patch: Partial<DraftCost>) => setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line));
  const [state, action, pending] = useActionState(async (): Promise<{ error?: string }> => {
    try {
      const result = await createProposalBudget({ requestId, title, description, kind, sourceLanguage, targetLanguage, currency,
        ...basis, wordsPerPage: defaults.wordsPerPage, languageExpansionFactor: defaults.languageExpansionFactor,
        lines: lines.filter(line => line.included).map(line => ({ category: line.category, label: line.label, unit: line.unit, quantity: line.quantity, unitPrice: line.unitPrice, autoQuantity: line.autoQuantity })),
      });
      if ("error" in result) return result;
      setDirty(false);
      toast.success("Proposal budget saved");
      router.push(result.url);
      return {};
    } catch {
      return { error: "Could not save the proposal budget. Your details are still here; check your connection and try again." };
    }
  }, {});
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return <form action={action} onChange={() => setDirty(true)} className="space-y-6" aria-busy={pending}>
    <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
      Save a working estimate before deciding to take on the project. It stays in Proposal and does not enter active workload planning.
    </p>
    <fieldset disabled={pending} className="min-w-0 space-y-5">
      <legend className="sr-only">Proposal budget details</legend>
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <div className="space-y-2"><Label htmlFor="proposal-title">Working title</Label><Input id="proposal-title" required maxLength={200} autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Book or project name" /></div>
        <div className="space-y-2"><Label htmlFor="proposal-kind">Project type</Label><select id="proposal-kind" className={selectClass} value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="book">Book</option><option value="article">Article collection</option><option value="other">Other</option></select></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2"><Label htmlFor="proposal-words">Estimated word count</Label><Input id="proposal-words" type="number" min={0} max={100_000_000} step={1} value={wordCount} onChange={e => setWordCount(e.target.value)} placeholder="Unknown for now" /></div>
        <div className="space-y-2"><Label htmlFor="proposal-pages">Source pages (optional)</Label><Input id="proposal-pages" type="number" min={0} max={1_000_000} step={1} value={pageCount} onChange={e => setPageCount(e.target.value)} placeholder="If known" /></div>
        <div className="space-y-2"><Label htmlFor="proposal-currency">Currency</Label><Input id="proposal-currency" required pattern="[A-Z]{3}" maxLength={3} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} /></div>
      </div>
      <p className="text-sm text-muted-foreground">Word-based costs update together. Typesetting uses source pages when known, or estimates pages from the word count. You can save before all quantities are known.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="proposal-source">Source language</Label><Input id="proposal-source" maxLength={100} value={sourceLanguage} onChange={e => setSourceLanguage(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="proposal-target">Target language</Label><Input id="proposal-target" maxLength={100} value={targetLanguage} onChange={e => setTargetLanguage(e.target.value)} /></div>
      </div>
      <div className="space-y-2"><Label htmlFor="proposal-description">Scope and assumptions (optional)</Label><Textarea id="proposal-description" rows={2} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} placeholder="What is included? What still needs confirmation?" /></div>

      <div className="space-y-3">
        <div><h2 className="text-lg font-semibold">Estimated costs</h2><p className="text-sm text-muted-foreground">Choose the work to include. Rates start from workspace settings and can be changed here.</p></div>
        <div className="divide-y rounded-lg border">
          {lines.map((line, index) => {
            const row = displayed[index];
            const automatic = line.autoQuantity && (line.unit === "words" || line.unit === "pages");
            return <div key={line.key} className={`grid min-w-0 gap-3 p-3 sm:grid-cols-[minmax(10rem,1fr)_7rem_7rem_6.5rem] sm:items-start ${line.included ? "" : "bg-muted/20"}`}>
              <div className="min-w-0 space-y-2">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" checked={line.included} onChange={e => changeLine(line.key, { included: e.target.checked })} /><span className="break-words">{line.category === "custom" ? "Custom cost" : line.label}</span></label>
                {line.category === "custom" ? <Input aria-label="Custom cost name" required={line.included} maxLength={200} value={line.label} onChange={e => changeLine(line.key, { label: e.target.value })} placeholder="e.g. Printing estimate" /> : null}
                {automatic && line.included ? <p className="text-xs text-muted-foreground">Uses the shared {line.unit === "words" ? "word count" : "page estimate"}.</p> : null}
              </div>
              <div className="grid grid-cols-3 gap-3 sm:contents">
                <div className="space-y-1"><Label htmlFor={`proposal-qty-${line.key}`} className="text-xs">Quantity</Label><Input id={`proposal-qty-${line.key}`} type="number" min={0} max={100_000_000} step="0.01" disabled={!line.included || automatic} value={row.quantity} onChange={e => changeLine(line.key, { quantity: Number(e.target.value), autoQuantity: false })} /><span className="text-xs text-muted-foreground">{units[line.unit]}</span></div>
                <div className="space-y-1"><Label htmlFor={`proposal-rate-${line.key}`} className="text-xs">Rate</Label><Input id={`proposal-rate-${line.key}`} type="number" min={0} max={1_000_000} step="0.0001" disabled={!line.included} value={line.unitPrice} onChange={e => changeLine(line.key, { unitPrice: Number(e.target.value) })} /><span className="text-xs text-muted-foreground">{currency || defaults.currency} / {line.unit === "flat" ? "fee" : line.unit}</span></div>
                <div className="space-y-1 sm:pt-0"><span className="block text-xs font-medium">Amount</span><output className="block break-words py-2 text-sm font-medium tabular-nums">{money(line.included ? Math.round(Number(row.amount) * 100) : 0)}</output>{line.category === "custom" ? <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${line.label || "custom cost"}`} onClick={() => setLines(current => current.filter(cost => cost.key !== line.key))}><Trash2 className="size-4" /></Button> : null}</div>
              </div>
            </div>;
          })}
        </div>
        <Button type="button" variant="outline" disabled={lines.length >= 40} onClick={() => { setDirty(true); setLines(current => [...current, { key: crypto.randomUUID(), category: "custom", label: "", unit: "flat", quantity: 1, unitPrice: 0, autoQuantity: false, included: true }]); }}><Plus className="size-4" />Add custom cost</Button>
      </div>
    </fieldset>
    <div className="sticky bottom-20 z-10 grid sm:bottom-3 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-background p-4 shadow-sm">
      <div><p className="text-sm text-muted-foreground">Estimate total</p><output aria-live="polite" className="text-2xl font-semibold tabular-nums">{money(totalCents)}</output><p className="hidden text-xs text-muted-foreground sm:block">{selected.length} costs included</p>{quantitiesUnknown ? <p className="mt-1 text-xs text-warning">Word/page costs are incomplete until quantities are known.</p> : null}</div>
      <Button type="submit" disabled={pending || !selected.length}>{pending ? "Saving proposal…" : "Save proposal budget"}</Button>
      {state.error ? <p role="alert" className="col-span-full text-sm text-destructive">{state.error}</p> : null}
    </div>
    <p className="text-sm text-muted-foreground">After saving, refine the partner quote, download it, or request approval in Budget. Nothing is emailed or connected to Lectio. When approved, change the project status to Planning.</p>
    <Link href="/projects" className={buttonVariants({ variant: "ghost" })}>Back to projects</Link>
  </form>;
}
