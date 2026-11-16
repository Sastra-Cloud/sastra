"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { documentColors, type DocumentColors } from "@/lib/workspace/document-colors";

export function DocumentColorsFields({ value, onChange }: {
  value: DocumentColors;
  onChange: (value: DocumentColors) => void;
}) {
  const colors = documentColors(value.accentColor, value);
  return (
    <fieldset className="space-y-4 border-t pt-4 sm:col-span-2">
      <legend className="px-1 text-sm font-medium">Invoice & quotation colors</legend>
      <p className="text-xs text-muted-foreground">Applies to new or refreshed invoice PDFs and quotation exports. Header text adjusts for contrast.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {([{ key: "accentColor", label: "Headings & rules" }, { key: "tableHeaderColor", label: "Table & invoice header" }] as const).map(({ key, label }) => (
          <div key={key} className="grid gap-1.5">
            <Label htmlFor={`document-${key}`}>{label}</Label>
            <div className="flex min-w-0 items-center gap-2">
              <Input id={`document-${key}`} type="color" value={value[key]} className="h-11 w-14 shrink-0 cursor-pointer p-1"
                onChange={(event) => onChange({ ...value, [key]: event.target.value })} />
              <Input aria-label={`${label} hex color`} value={value[key]} maxLength={7} pattern="#[0-9a-fA-F]{6}"
                className="min-w-0" onChange={(event) => onChange({ ...value, [key]: event.target.value })} />
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border bg-white text-sm text-neutral-900" aria-label="Document color preview">
        <p className="px-3 py-3 font-medium" style={{ color: colors.accentColor }}>Invoice & quotation preview</p>
        <div className="flex justify-between gap-3 px-3 py-2 font-medium" style={{ backgroundColor: colors.tableHeaderColor, color: colors.tableHeaderTextColor }}>
          <span>Description</span><span>Total</span>
        </div>
        <div className="flex justify-between gap-3 border-b px-3 py-3" style={{ borderColor: colors.accentColor }}>
          <span>Project funding</span><span>—</span>
        </div>
      </div>
    </fieldset>
  );
}
