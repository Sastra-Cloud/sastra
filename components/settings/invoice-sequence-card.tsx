"use client";

import { Hash } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "./field-errors";
import { usePropState } from "@/hooks/use-prop-state";

export function InvoiceSequenceCard({ sequence }: { sequence: { prefix: string; nextNumber: number; padding: number } }) {
  const [prefix, setPrefix] = usePropState(sequence.prefix);
  const [nextNumber, setNextNumber] = usePropState(sequence.nextNumber);
  const [padding, setPadding] = usePropState(sequence.padding);
  const preview = `${prefix}${String(Math.max(1, nextNumber)).padStart(Math.max(1, padding), "0")}`;
  return (
    <Card className="@[80rem]/settings:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Hash className="size-4" />Invoice numbering</CardTitle>
        <CardDescription>The next generated invoice will use <strong>{preview}</strong>. Existing invoice numbers never change.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5"><Label htmlFor="invoicePrefix">Prefix</Label><Input id="invoicePrefix" name="invoicePrefix" value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder="INV-" /></div>
        <div className="grid gap-1.5"><Label htmlFor="invoiceNextNumber">Next number</Label><Input id="invoiceNextNumber" name="invoiceNextNumber" aria-describedby="invoiceSequence-error" type="number" min={1} value={nextNumber} onChange={(event) => setNextNumber(Number(event.target.value))} /></div>
        <div className="grid gap-1.5"><Label htmlFor="invoicePadding">Minimum digits</Label><Input id="invoicePadding" name="invoicePadding" type="number" min={1} max={20} value={padding} onChange={(event) => setPadding(Number(event.target.value))} /></div>
        <div className="sm:col-span-3"><FieldError name="invoiceSequence" /></div>
      </CardContent>
    </Card>
  );
}
