"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Merge, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  createContact,
  createHolder,
  deleteContact,
  deleteHolder,
  mergeHolder,
  updateContact,
  updateHolder,
} from "@/lib/rights/actions";
import { holderNamesEquivalent } from "@/lib/rights/holder-match";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePropState } from "@/hooks/use-prop-state";

type Holder = {
  id: string;
  name: string;
  website: string | null;
  notes: string | null;
  projectCount: number;
  threadCount: number;
};
type Contact = {
  id: string;
  holderId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
};
type ContactValues = {
  name: string;
  email: string;
  phone: string;
  role: string;
};
type Run = (fn: () => Promise<unknown>, ok?: string, rollback?: () => void) => void;

export function PublishersManager({
  holders,
  contacts,
}: {
  holders: Holder[];
  contacts: Contact[];
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
      } catch (error) {
        rollback?.();
        toast.error(
          error instanceof Error ? error.message : "Couldn't save. Please try again."
        );
      }
    });

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 py-4">
          <div>
            <p className="text-sm font-medium">Add a publisher / rights holder</p>
            <p className="text-xs text-muted-foreground">
              Existing names and common acronym variants are matched before a
              new record is created.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end">
            <Field label="Publisher name">
              <Input
                placeholder="e.g. Desiring God"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Website (optional)">
              <Input
                placeholder="https://…"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </Field>
            <Button
              disabled={pending || !name.trim()}
              onClick={() =>
                run(async () => {
                  const result = await createHolder(
                    name,
                    website || undefined
                  );
                  setName("");
                  setWebsite("");
                  toast.success(
                    result.existing
                      ? `Using existing publisher “${result.name}”`
                      : "Publisher added"
                  );
                })
              }
            >
              Add publisher
            </Button>
          </div>
        </CardContent>
      </Card>

      {holders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No publishers yet. Add the first rights holder above, or let document
          import create one after review.
        </p>
      ) : (
        holders.map((holder) => (
          <PublisherCard
            key={holder.id}
            holder={holder}
            holders={holders}
            contacts={contacts.filter(
              (contact) => contact.holderId === holder.id
            )}
            pending={pending}
            run={run}
          />
        ))
      )}
    </div>
  );
}

function PublisherCard({
  holder,
  holders,
  contacts,
  pending,
  run,
}: {
  holder: Holder;
  holders: Holder[];
  contacts: Contact[];
  pending: boolean;
  run: Run;
}) {
  const [editing, setEditing] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [visibleHolder, setVisibleHolder] = usePropState(holder);
  const [name, setName] = useState(holder.name);
  const [website, setWebsite] = useState(holder.website ?? "");
  const [notes, setNotes] = useState(holder.notes ?? "");
  const possibleDuplicate = holders.find(
    (candidate) =>
      candidate.id !== holder.id &&
      holderNamesEquivalent(visibleHolder.name, candidate.name)
  );
  const linked = holder.projectCount > 0 || holder.threadCount > 0;

  if (removed) return null;

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        {editing ? (
          <div className="grid gap-3">
            <Field label="Publisher name">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Website (optional)">
              <Input
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </Field>
            <Field label="Notes (optional)">
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={pending || !name.trim()}
                onClick={() => {
                  const previous = visibleHolder;
                  setVisibleHolder({
                    ...visibleHolder,
                    name: name.trim(),
                    website: website.trim() || null,
                    notes: notes.trim() || null,
                  });
                  setEditing(false);
                  run(async () => {
                    await updateHolder(holder.id, { name, website, notes });
                  }, "Publisher saved", () => {
                    setVisibleHolder(previous);
                    setEditing(true);
                  });
                }}
              >
                Save changes
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setName(visibleHolder.name);
                  setWebsite(visibleHolder.website ?? "");
                  setNotes(visibleHolder.notes ?? "");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{visibleHolder.name}</p>
                {holder.projectCount > 0 ? (
                  <Badge variant="secondary">
                    {holder.projectCount} project
                    {holder.projectCount === 1 ? "" : "s"}
                  </Badge>
                ) : null}
                {holder.threadCount > 0 ? (
                  <Badge variant="outline">
                    {holder.threadCount} thread
                    {holder.threadCount === 1 ? "" : "s"}
                  </Badge>
                ) : null}
              </div>
              {visibleHolder.website ? (
                <p className="break-all text-xs text-muted-foreground">
                  {visibleHolder.website}
                </p>
              ) : null}
              {visibleHolder.notes ? (
                <p className="text-xs text-muted-foreground">{visibleHolder.notes}</p>
              ) : null}
              {possibleDuplicate ? (
                <p className="text-xs text-warning-text">
                  Possible duplicate of “{possibleDuplicate.name}”. Merge the
                  shorthand record into the name you want to keep.
                </p>
              ) : null}
              {linked ? (
                <p className="text-xs text-muted-foreground">
                  Linked publishers are protected from deletion. Edit or merge
                  this record instead.
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" /> Edit
              </Button>
              <MergePublisherDialog
                source={holder}
                holders={holders}
                defaultTargetId={possibleDuplicate?.id}
                pending={pending}
                run={run}
              />
              <DeletePublisherDialog
                holder={holder}
                disabled={linked}
                pending={pending}
                run={run}
                onOptimisticDelete={() => setRemoved(true)}
                onRollback={() => setRemoved(false)}
              />
            </div>
          </div>
        )}

        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Contacts
          </p>
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
          <AddContact holderId={holder.id} pending={pending} run={run} />
        </div>
      </CardContent>
    </Card>
  );
}

function MergePublisherDialog({
  source,
  holders,
  defaultTargetId,
  pending,
  run,
}: {
  source: Holder;
  holders: Holder[];
  defaultTargetId?: string;
  pending: boolean;
  run: Run;
}) {
  const targets = holders.filter((holder) => holder.id !== source.id);
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState(defaultTargetId ?? targets[0]?.id ?? "");
  const target = targets.find((holder) => holder.id === targetId);
  if (targets.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Merge className="size-3.5" /> Merge
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge “{source.name}”</DialogTitle>
          <DialogDescription>
            Project rights, copyright ownership, contacts, and correspondence
            links will move to the publisher you keep. “{source.name}” will then
            be deleted.
          </DialogDescription>
        </DialogHeader>
        <Field label="Keep this publisher">
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            {targets.map((holder) => (
              <option key={holder.id} value={holder.id}>
                {holder.name}
              </option>
            ))}
          </select>
        </Field>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            disabled={pending || !target}
            onClick={() =>
              run(async () => {
                await mergeHolder(source.id, targetId);
                setOpen(false);
              }, `Merged into ${target?.name ?? "publisher"}`)
            }
          >
            Merge publisher
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeletePublisherDialog({
  holder,
  disabled,
  pending,
  run,
  onOptimisticDelete,
  onRollback,
}: {
  holder: Holder;
  disabled: boolean;
  pending: boolean;
  run: Run;
  onOptimisticDelete: () => void;
  onRollback: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        title={disabled ? "Linked publishers must be merged, not deleted" : undefined}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" /> Delete
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{holder.name}”?</DialogTitle>
          <DialogDescription>
            This publisher is not linked to a project or correspondence thread.
            Its unlinked contacts will also be permanently deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Keep publisher</DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              setOpen(false);
              onOptimisticDelete();
              run(
                () => deleteHolder(holder.id),
                undefined,
                onRollback
              );
            }}
          >
            Delete publisher
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactRow({
  contact,
  pending,
  run,
}: {
  contact: Contact;
  pending: boolean;
  run: Run;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [removed, setRemoved] = useState(false);
  const meta = [contact.role, contact.email, contact.phone]
    .filter(Boolean)
    .join(" · ");

  if (removed) return null;

  if (editing) {
    return (
      <ContactForm
        initial={{
          name: contact.name,
          email: contact.email ?? "",
          phone: contact.phone ?? "",
          role: contact.role ?? "",
        }}
        pending={pending}
        submitLabel="Save contact"
        onCancel={() => setEditing(false)}
        onSave={(values) =>
          run(async () => {
            await updateContact(contact.id, values);
            setEditing(false);
          }, "Contact saved")
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/10 px-3 py-2 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{contact.name}</span>
        {meta ? <span className="text-muted-foreground"> · {meta}</span> : null}
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" /> Edit
        </Button>
        <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
          <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
            <X className="size-3.5" /> Remove
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove “{contact.name}”?</DialogTitle>
              <DialogDescription>
                Linked contacts cannot be removed until their project and
                correspondence links are reassigned.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Keep contact</DialogClose>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  setConfirmingDelete(false);
                  setRemoved(true);
                  run(
                    () => deleteContact(contact.id),
                    undefined,
                    () => setRemoved(false)
                  );
                }}
              >
                Remove contact
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function AddContact({
  holderId,
  pending,
  run,
}: {
  holderId: string;
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
      initial={{ name: "", email: "", phone: "", role: "" }}
      pending={pending}
      submitLabel="Add contact"
      onCancel={() => setOpen(false)}
      onSave={(values) =>
        run(async () => {
          await createContact(
            holderId,
            values.name,
            values.email || undefined,
            values.role || undefined,
            values.phone || undefined
          );
          setOpen(false);
        }, "Contact added")
      }
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
  const [values, setValues] = useState(initial);
  const set = (key: keyof ContactValues) =>
    (event: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Contact name">
        <Input value={values.name} onChange={set("name")} />
      </Field>
      <Field label="Email (optional)">
        <Input type="email" value={values.email} onChange={set("email")} />
      </Field>
      <Field label="Phone (optional)">
        <Input value={values.phone} onChange={set("phone")} />
      </Field>
      <Field label="Role (optional)">
        <Input value={values.role} onChange={set("role")} />
      </Field>
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
        <Button
          size="sm"
          disabled={pending || !values.name.trim()}
          onClick={() => onSave(values)}
        >
          {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Label className="grid gap-1.5">
      <span>{label}</span>
      {children}
    </Label>
  );
}
