"use client";

import { useState } from "react";
import Link from "next/link";
import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sponsorshipInputSchema, sponsorshipTotalCents, type SponsorshipInput } from "@/lib/sponsorships/compute";
import { sponsorshipMoney } from "@/lib/sponsorships/format";

export type SponsorshipOptions = {
  books: Array<{ id: string; title: string; slug: string }>;
  partners: Array<{ id: string; name: string; billingAddress: string | null }>;
  contacts: Array<{ id: string; partnerId: string; firstName: string | null; lastName: string | null; email: string | null; isPrimary: boolean }>;
};
export const sponsorshipSelectClass = "min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SponsorshipForm({ initial, options, pending, onSave, onCancel, label = "Save sponsorship" }: {
  initial: SponsorshipInput; options: SponsorshipOptions; pending: boolean;
  onSave: (value: SponsorshipInput) => void; onCancel?: () => void; label?: string;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [lineKeys, setLineKeys] = useState(() => initial.lines.map((_, index) => `initial-${index}`));
  function patch(fields: Partial<SponsorshipInput>) { setValue(current => ({ ...current, ...fields })); }
  function patchLine(index: number, fields: Partial<SponsorshipInput["lines"][number]>) {
    setValue(current => ({ ...current, lines: current.lines.map((line, i) => i === index ? { ...line, ...fields } : line) }));
  }
  let total = 0;
  try { total = sponsorshipTotalCents(value.lines) / 100; } catch { /* incomplete form */ }
  return <form className="space-y-6" onSubmit={event => {
    event.preventDefault();
    const parsed = sponsorshipInputSchema.safeParse(value);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the highlighted fields."); return; }
    setError(null); onSave(parsed.data);
  }}>
    <fieldset disabled={pending} className="space-y-6">
      <section className="space-y-4 rounded-xl border bg-card p-4 md:p-5">
        <h2 className="text-base font-semibold">Partner and invoice details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="sponsorship-title">Sponsorship title</Label><Input className="min-h-11" id="sponsorship-title" required maxLength={200} value={value.title} onChange={event => patch({ title: event.target.value })} placeholder="Book sponsorship" /></div>
          <div className="grid gap-1.5"><Label htmlFor="sponsorship-partner">Saved partner</Label>
            <select id="sponsorship-partner" className={sponsorshipSelectClass} value={value.partnerId ?? ""} onChange={event => {
              const partner = options.partners.find(row => row.id === event.target.value);
              const contact = options.contacts.find(row => row.partnerId === partner?.id && row.isPrimary) ?? options.contacts.find(row => row.partnerId === partner?.id);
              patch({ partnerId: partner?.id ?? null, ...(partner ? { recipientName: partner.name, recipientAddress: partner.billingAddress ?? "", recipientEmail: contact?.email ?? "" } : {}) });
            }}><option value="">Individual or other partner</option>{options.partners.map(partner => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select>
            <Link href="/settings/partners" className="text-xs text-primary underline underline-offset-4">Manage saved partners</Link>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="sponsorship-name">Bill to name</Label><Input className="min-h-11" id="sponsorship-name" required maxLength={200} value={value.recipientName} onChange={event => patch({ recipientName: event.target.value })} placeholder="Person or organization" /></div>
          <div className="grid gap-1.5"><Label htmlFor="sponsorship-email">Contact email (optional)</Label><Input className="min-h-11" id="sponsorship-email" type="email" value={value.recipientEmail} onChange={event => patch({ recipientEmail: event.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="sponsorship-currency">Currency</Label><Input className="min-h-11" id="sponsorship-currency" required maxLength={3} value={value.currency} onChange={event => patch({ currency: event.target.value.toUpperCase() })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="sponsorship-address">Billing address (optional)</Label><Textarea id="sponsorship-address" maxLength={1000} value={value.recipientAddress} onChange={event => patch({ recipientAddress: event.target.value })} /></div>
          <div className="grid content-start gap-1.5"><Label htmlFor="sponsorship-due">Payment due date (optional)</Label><Input className="min-h-11" id="sponsorship-due" type="date" value={value.dueDate} onChange={event => patch({ dueDate: event.target.value })} /></div>
        </div>
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-4 md:p-5">
        <div className="space-y-1"><h2 className="text-base font-semibold">Sponsored books</h2><p className="text-sm text-muted-foreground">Enter the agreed sponsorship price for each copy.</p></div>
        {!options.books.length && <p className="text-sm text-muted-foreground">Create a book project first, then return to this form.</p>}
        <div className="divide-y">
          {value.lines.map((line, index) => <div key={lineKeys[index]} className="grid min-w-0 gap-3 py-4 first:pt-0 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_auto]">
            <div className="grid min-w-0 gap-1.5"><Label htmlFor={`sponsorship-book-${index}`}>Book {index + 1}</Label>
              <Combobox.Root items={options.books} value={options.books.find(book => book.id === line.projectId) ?? null}
                itemToStringLabel={book => book.title} isItemEqualToValue={(a, b) => a.id === b.id}
                disabled={pending || !options.books.length}
                onValueChange={book => patchLine(index, { projectId: book?.id ?? "", description: book ? `${book.title} — book sponsorship` : "" })}>
                <div className="relative min-w-0">
                  <Combobox.Input id={`sponsorship-book-${index}`} aria-label={`Book ${index + 1}`} required placeholder="Search books…"
                    className={`${sponsorshipSelectClass} pr-11 disabled:opacity-50`} />
                  <Combobox.Trigger type="button" aria-label={`Show books for book ${index + 1}`}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                    <ChevronsUpDown className="size-4" />
                  </Combobox.Trigger>
                </div>
                <Combobox.Portal><Combobox.Positioner sideOffset={4} className="isolate z-50">
                  <Combobox.Popup className="max-h-[min(18rem,var(--available-height))] w-[var(--anchor-width)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                    <Combobox.Empty className="p-3 text-sm text-muted-foreground">No matching books.</Combobox.Empty>
                    <Combobox.List>{(book: SponsorshipOptions["books"][number]) => <Combobox.Item key={book.id} value={book}
                      className="flex min-h-11 cursor-default items-center justify-between gap-3 rounded-sm px-3 py-2.5 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground">
                      <span className="min-w-0 break-words">{book.title}</span>
                      <Combobox.ItemIndicator><Check className="size-4 shrink-0" /></Combobox.ItemIndicator>
                    </Combobox.Item>}</Combobox.List>
                  </Combobox.Popup>
                </Combobox.Positioner></Combobox.Portal>
              </Combobox.Root>
            </div>
            <div className="grid gap-1.5"><Label htmlFor={`sponsorship-quantity-${index}`}>Copies</Label><Input className="min-h-11" id={`sponsorship-quantity-${index}`} type="number" min="1" max="1000000" step="1" required value={line.quantity || ""} onChange={event => patchLine(index, { quantity: Number(event.target.value) })} /></div>
            <div className="grid gap-1.5"><Label htmlFor={`sponsorship-price-${index}`}>Price per copy</Label><Input className="min-h-11" id={`sponsorship-price-${index}`} inputMode="decimal" required value={line.unitPrice} onChange={event => patchLine(index, { unitPrice: event.target.value })} /></div>
            <Button type="button" variant="ghost" size="icon" className="self-end" aria-label={`Delete book ${index + 1}`} disabled={value.lines.length === 1} onClick={() => {
              patch({ lines: value.lines.filter((_, i) => i !== index) }); setLineKeys(keys => keys.filter((_, i) => i !== index));
            }}><Trash2 className="size-4" /></Button>
            <div className="grid gap-1.5 sm:col-span-4"><Label htmlFor={`sponsorship-description-${index}`}>Invoice description</Label><Input className="min-h-11" id={`sponsorship-description-${index}`} required maxLength={500} value={line.description} onChange={event => patchLine(index, { description: event.target.value })} /></div>
          </div>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Button type="button" variant="outline" disabled={value.lines.length >= 50 || !options.books.length} onClick={() => {
            patch({ lines: [...value.lines, { projectId: "", description: "", quantity: 1, unitPrice: "" }] }); setLineKeys(keys => [...keys, crypto.randomUUID()]);
          }}><Plus className="size-4" />Add book</Button>
          <p aria-live="polite" className="font-semibold tabular-nums">Total: {sponsorshipMoney(total, value.currency)}</p>
        </div>
      </section>
      <div className="grid gap-1.5"><Label htmlFor="sponsorship-notes">Invoice note (optional)</Label><Textarea id="sponsorship-notes" maxLength={2000} rows={3} value={value.notes} onChange={event => patch({ notes: event.target.value })} /><p className="text-xs text-muted-foreground">This note appears on the invoice. Explain how the sponsorship helps.</p></div>
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      {onCancel && <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>Cancel edit</Button>}
      <Button type="submit" disabled={pending || !options.books.length}>{pending ? "Saving sponsorship…" : label}</Button>
    </div>
  </form>;
}
