"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Star, Trash2, X } from "lucide-react";

import {
  addPartnerContact,
  createPartner,
  deletePartner,
  deletePartnerContact,
  setPrimaryPartnerContact,
  updatePartner,
  updatePartnerContact,
} from "@/lib/partners/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePropState } from "@/hooks/use-prop-state";

type PartnerDTO = {
  id: string;
  name: string;
  website: string | null;
  billingAddress: string | null;
  notes: string | null;
};
type ContactDTO = {
  id: string;
  partnerId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  isPrimary: boolean;
};
type ContactValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
};
type Run = (fn: () => Promise<unknown>, ok?: string, rollback?: () => void) => void;

const inputBase = "w-full";

export function PartnersManager({
  partners,
  contacts,
}: {
  partners: PartnerDTO[];
  contacts: ContactDTO[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");

  const run: Run = (fn, ok, rollback) =>
    start(async () => {
      try {
        await fn();
        router.refresh();
        if (ok) toast.success(ok);
      } catch (err) {
        rollback?.();
        toast.error(
          err instanceof Error ? err.message : "Couldn't save. Please try again."
        );
      }
    });

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="py-4">
          <p className="mb-2 text-sm font-medium">Add a funding partner</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="e.g. 9Marks"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="Website (optional)"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="sm:w-56"
            />
            <Button
              disabled={pending || !name.trim()}
              onClick={() =>
                run(async () => {
                  await createPartner({ name, website: website || undefined });
                  setName("");
                  setWebsite("");
                }, "Partner added")
              }
            >
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {partners.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No partners yet. Add a sponsor or MoU counterparty above — or let
          document import fill one in.
        </p>
      ) : (
        partners.map((partner) => (
          <PartnerCard
            key={partner.id}
            partner={partner}
            contacts={contacts.filter((c) => c.partnerId === partner.id)}
            pending={pending}
            run={run}
          />
        ))
      )}
    </div>
  );
}

function PartnerCard({
  partner,
  contacts,
  pending,
  run,
}: {
  partner: PartnerDTO;
  contacts: ContactDTO[];
  pending: boolean;
  run: Run;
}) {
  const [editing, setEditing] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [visiblePartner, setVisiblePartner] = usePropState(partner);
  const [name, setName] = useState(partner.name);
  const [website, setWebsite] = useState(partner.website ?? "");
  const [billingAddress, setBillingAddress] = useState(partner.billingAddress ?? "");
  const [notes, setNotes] = useState(partner.notes ?? "");

  if (removed) return null;

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        {editing ? (
          <div className="space-y-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Partner name"
            />
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="Website (optional)"
            />
            <label className="grid gap-1 text-sm">Billing address
              <textarea value={billingAddress} onChange={(event) => setBillingAddress(event.target.value)} maxLength={1000} rows={3}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" placeholder="Address used on new invoices" />
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pending || !name.trim()}
                onClick={() => {
                  const previous = visiblePartner;
                  setVisiblePartner({
                    ...visiblePartner,
                    name: name.trim(),
                    website: website.trim() || null,
                    notes: notes.trim() || null,
                    billingAddress: billingAddress.trim() || null,
                  });
                  setEditing(false);
                  run(
                    () => updatePartner(partner.id, { name, website, notes, billingAddress }),
                    "Saved",
                    () => {
                      setVisiblePartner(previous);
                      setEditing(true);
                    }
                  );
                }}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setName(visiblePartner.name);
                  setWebsite(visiblePartner.website ?? "");
                  setNotes(visiblePartner.notes ?? "");
                  setBillingAddress(visiblePartner.billingAddress ?? "");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">{visiblePartner.name}</p>
              {visiblePartner.website ? (
                <p className="truncate text-xs text-muted-foreground">
                  {visiblePartner.website}
                </p>
              ) : null}
              {visiblePartner.billingAddress && <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{visiblePartner.billingAddress}</p>}
              {visiblePartner.notes ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {visiblePartner.notes}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Edit partner"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Delete partner"
                onClick={async () => {
                  if ((await confirmDialog(`Delete "${partner.name}" and its contacts?`))) {
                    setRemoved(true);
                    run(
                      () => deletePartner(partner.id),
                      undefined,
                      () => setRemoved(false)
                    );
                  }
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-1.5 border-t pt-3">
          {contacts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No contacts yet.</p>
          ) : (
            contacts.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                pending={pending}
                run={run}
              />
            ))
          )}
          <AddContact partnerId={partner.id} pending={pending} run={run} />
        </div>
      </CardContent>
    </Card>
  );
}

function ContactRow({
  contact,
  pending,
  run,
}: {
  contact: ContactDTO;
  pending: boolean;
  run: Run;
}) {
  const [editing, setEditing] = useState(false);
  const [removed, setRemoved] = useState(false);
  const name =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    "(unnamed contact)";
  const meta = [contact.role, contact.email, contact.phone]
    .filter(Boolean)
    .join(" · ");

  if (removed) return null;

  if (editing) {
    return (
      <ContactForm
        pending={pending}
        submitLabel="Save"
        initial={{
          firstName: contact.firstName ?? "",
          lastName: contact.lastName ?? "",
          email: contact.email ?? "",
          phone: contact.phone ?? "",
          role: contact.role ?? "",
        }}
        onCancel={() => setEditing(false)}
        onSave={(vals) => {
          run(() => updatePartnerContact(contact.id, vals), "Contact saved");
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{name}</span>
      {contact.isPrimary ? (
        <Badge variant="secondary" className="text-[10px]">
          primary
        </Badge>
      ) : null}
      {meta ? <span className="text-muted-foreground">{meta}</span> : null}
      <div className="ml-auto flex gap-0.5">
        {!contact.isPrimary ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Make primary contact"
            title="Make primary"
            disabled={pending}
            onClick={() => run(() => setPrimaryPartnerContact(contact.id))}
          >
            <Star className="size-3.5" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Edit contact"
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Remove contact"
          disabled={pending}
          onClick={async () => {
            if (!(await confirmDialog(`Remove ${name}?`))) return;
            setRemoved(true);
            run(
              () => deletePartnerContact(contact.id),
              undefined,
              () => setRemoved(false)
            );
          }}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function AddContact({
  partnerId,
  pending,
  run,
}: {
  partnerId: string;
  pending: boolean;
  run: Run;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3.5" /> Add contact
      </Button>
    );
  }
  return (
    <ContactForm
      pending={pending}
      submitLabel="Add"
      initial={{ firstName: "", lastName: "", email: "", phone: "", role: "" }}
      onCancel={() => setOpen(false)}
      onSave={(vals) => {
        run(() => addPartnerContact(partnerId, vals), "Contact added");
        setOpen(false);
      }}
    />
  );
}

function ContactForm({
  initial,
  onSave,
  onCancel,
  pending,
  submitLabel,
}: {
  initial: ContactValues;
  onSave: (values: ContactValues) => void;
  onCancel: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  const [values, setValues] = useState<ContactValues>(initial);
  const set = (key: keyof ContactValues) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));
  const canSave =
    values.firstName.trim() || values.lastName.trim() || values.email.trim();

  return (
    <div className="grid gap-2 rounded-lg border bg-muted/20 p-2 sm:grid-cols-2 lg:grid-cols-3">
      <Input placeholder="First name" value={values.firstName} onChange={set("firstName")} className={inputBase} />
      <Input placeholder="Last name" value={values.lastName} onChange={set("lastName")} className={inputBase} />
      <Input placeholder="Email" value={values.email} onChange={set("email")} className={inputBase} />
      <Input placeholder="Phone (optional)" value={values.phone} onChange={set("phone")} className={inputBase} />
      <Input placeholder="Role (optional)" value={values.role} onChange={set("role")} className={inputBase} />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || !canSave} onClick={() => onSave(values)}>
          {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
