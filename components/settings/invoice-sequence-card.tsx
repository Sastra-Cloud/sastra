"use client";

import { useState, useTransition } from "react";
import { Hash, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateInvoiceSequence } from "@/lib/workspace/actions";

export function InvoiceSequenceCard({ sequence }: { sequence: { prefix: string; nextNumber: number; padding: number } }) {
  const [pending, startTransition] = useTransition();
  const [prefix, setPrefix] = useState(sequence.prefix);
  const [nextNumber, setNextNumber] = useState(sequence.nextNumber);
  const [padding, setPadding] = useState(sequence.padding);
  const preview = `${prefix}${String(Math.max(1, nextNumber)).padStart(Math.max(1, padding), "0")}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Hash className="size-4" />Invoice numbering</CardTitle>
        <CardDescription>The next generated invoice will use <strong>{preview}</strong>. Existing invoice numbers never change.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <div className="grid gap-1.5"><Label>Prefix</Label><Input value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder="INV-" /></div>
        <div className="grid gap-1.5"><Label>Next number</Label><Input type="number" min={1} value={nextNumber} onChange={(event) => setNextNumber(Number(event.target.value))} /></div>
        <div className="grid gap-1.5"><Label>Minimum digits</Label><Input type="number" min={1} max={20} value={padding} onChange={(event) => setPadding(Number(event.target.value))} /></div>
        <Button className="mr-12" disabled={pending} onClick={() => startTransition(async () => {
          const result = await updateInvoiceSequence({ prefix, nextNumber, padding });
          if (result.error) toast.error(result.error); else toast.success("Invoice numbering saved");
        })}>{pending ? <Loader2 className="size-4 animate-spin" /> : null}Save numbering</Button>
      </CardContent>
    </Card>
  );
}
