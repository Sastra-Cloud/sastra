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
import { PartnerFields, emptyPartnerValues, type PartnerValues } from "@/components/partners/partner-fields";
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
  const [creating, startCreate] = useTransition();
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [values, setValues] = useState<PartnerValues>(emptyPartnerValues);
  const [visiblePartners, setVisiblePartners] = usePropState(partners);
  const [visibleContacts, setVisibleContacts] = usePropState(contacts);

  function addPartner(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating || !values.name.trim()) return;
    const id = crypto.randomUUID();
    setCreatingId(id);
    const partner = { id, name: values.name.trim(), website: values.website.trim() || null,
      billingAddress: values.billingAddress.trim() || null, notes: values.notes.trim() || null };
    const hasContact = [values.firstName, values.lastName, values.email, values.phone, values.role].some((value) => value.trim());
    const contact = { id: crypto.randomUUID(), partnerId: id, firstName: values.firstName.trim() || null,
      lastName: values.lastName.trim() || null, email: values.email.trim() || null,
      phone: values.phone.trim() || null, role: values.role.trim() || null, isPrimary: true };
    setVisiblePartners((rows) => [partner, ...rows]);
    if (hasContact) setVisibleContacts((rows) => [...rows, contact]);
    startCreate(async () => {
      try {
        const saved = await createPartner({ ...values, contact: {
          firstName: values.firstName, lastName: values.lastName, email: values.email,
          phone: values.phone, role: values.role,
        } });
        setVisiblePartners((rows) => rows.some((row) => row.id === saved.id && row.id !== id)
          ? rows.filter((row) => row.id !== id)
          : rows.map((row) => row.id === id ? { ...partner, id: saved.id } : row));
        setVisibleContacts((rows) => rows.filter((row) => row.id !== contact.id).concat(
          hasContact && saved.contactId && !rows.some((row) => row.id === saved.contactId)
            ? [{ ...contact, id: saved.contactId, partnerId: saved.id }] : []));
        setValues(emptyPartnerValues);
        router.refresh();
        toast.success("Partner saved");
      } catch (err) {
        setVisiblePartners((rows) => rows.filter((row) => row.id !== id));
        setVisibleContacts((rows) => rows.filter((row) => row.id !== contact.id));
        toast.error(err instanceof Error ? err.message : "Could not add the partner. Your details are still here. Try again.");
      } finally {
        setCreatingId(null);
      }
    });
  }

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
      <Card className="max-w-3xl">
        <CardContent className="py-4">
          <form className="space-y-4" onSubmit={addPartner}>
            <p className="text-sm font-medium">Add a funding partner</p>
            <PartnerFields value={values} onChange={setValues} disabled={creating} />
            <Button type="submit" disabled={creating || !values.name.trim()}>
              {creating ? "Saving partner…" : "Add partner"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {visiblePartners.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No partners yet. Add a sponsor or MoU counterparty above — or let
          document import fill one in.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,36rem),1fr))] items-start gap-5">
        {visiblePartners.map((partner) => (
          <PartnerCard
            key={partner.id}
            partner={partner}
            contacts={visibleContacts.filter((c) => c.partnerId === partner.id)}
            pending={pending || partner.id === creatingId}
            run={run}
          />
        ))}
        </div>
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
                disabled={pending}
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Delete partner"
                disabled={pending}
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
          disabled={pending}
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
        disabled={pending}
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
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-2 rounded-lg border bg-muted/20 p-2">
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
