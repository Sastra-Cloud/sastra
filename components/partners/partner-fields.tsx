"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type PartnerValues = {
  name: string;
  website: string;
  billingAddress: string;
  notes: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
};

export const emptyPartnerValues: PartnerValues = {
  name: "", website: "", billingAddress: "", notes: "",
  firstName: "", lastName: "", email: "", phone: "", role: "",
};

/** The same complete set of details wherever a partner is created. */
export function PartnerFields({ value, onChange, disabled = false }: {
  value: PartnerValues;
  onChange: (value: PartnerValues) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const input = (key: keyof PartnerValues, label: string, maxLength: number, type = "text") => (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input id={`${id}-${key}`} type={type} maxLength={maxLength}
        required={key === "name"} value={value[key]}
        onChange={(event) => onChange({ ...value, [key]: event.target.value })} />
    </div>
  );
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {input("name", "Partner name", 200)}
        {input("website", "Website (optional)", 300)}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-address`}>Billing address (optional)</Label>
          <Textarea id={`${id}-address`} rows={3} maxLength={1000} value={value.billingAddress}
            onChange={(event) => onChange({ ...value, billingAddress: event.target.value })} />
          <p className="text-xs text-muted-foreground">Used on new invoices for this partner.</p>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-notes`}>Partner notes (optional)</Label>
          <Textarea id={`${id}-notes`} rows={2} maxLength={2000} value={value.notes}
            onChange={(event) => onChange({ ...value, notes: event.target.value })} />
        </div>
      </div>
      <div className="space-y-3 border-t pt-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Primary contact (optional)</p>
          <p className="text-xs text-muted-foreground">You can add more contacts later in Partners.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {input("firstName", "First name", 120)}
          {input("lastName", "Last name", 120)}
          {input("email", "Email", 320, "email")}
          {input("phone", "Phone", 60, "tel")}
          {input("role", "Role", 120)}
        </div>
      </div>
    </fieldset>
  );
}
