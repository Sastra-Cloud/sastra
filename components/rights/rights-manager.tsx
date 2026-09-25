"use client";

import { promptDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, Plus, Send } from "lucide-react";

import {
  createContact,
  createHolder,
  initiateRightsStep,
  updateRights,
} from "@/lib/rights/actions";
import type { Attachment } from "@/lib/files/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileAttachments } from "@/components/files/file-attachments";
import { LicenseFeePayments } from "@/components/rights/license-fee-payments";
import { cn } from "@/lib/utils";
import { deriveOverall, type RightsStep } from "@/lib/rights/derive";
import { AgreementChatSheet } from "@/components/rights/agreement-chat-sheet";
import type { AgreementChatSnapshot } from "@/lib/agreement-chat/actions";

type Holder = { id: string; name: string };
type Contact = { id: string; holderId: string; name: string };
type Person = { id: string; name: string };
type FeePayment = {
  id: string;
  period: string;
  amount: string;
  currency: string;
  dueDate: string | null;
  assigneeName: string | null;
  taskId: string | null;
  paidAt: Date | string | null;
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const OVERALL: Record<string, { label: string; className: string }> = {
  none: { label: "Not started", className: "bg-secondary text-secondary-foreground" },
  in_progress: { label: "Rights in progress", className: "bg-warning text-warning-foreground" },
  complete: { label: "Rights complete", className: "bg-success text-success-foreground" },
};

const STEP_OPTIONS = [
  { v: "not_started", l: "Not started" },
  { v: "in_progress", l: "In progress" },
  { v: "signed", l: "Signed" },
  { v: "not_needed", l: "Not needed" },
];

// rights row type is loose here; the page passes the DB row.
type RightsRow = Record<string, unknown> & {
  id: string;
  agreementType: string;
  mouStatus: string;
  mouCommercial: boolean;
  mouSignedDate: string | null;
  mouExpiresDate: string | null;
  mouHolderId: string | null;
  mouContactId: string | null;
  mouAssignedTo: string | null;
  mouTaskId: string | null;
  licenseStatus: string;
  licenseSignedDate: string | null;
  licenseExpiresDate: string | null;
  licenseHolderId: string | null;
  licenseContactId: string | null;
  licenseAssignedTo: string | null;
  licenseTaskId: string | null;
  licenseTermMonths: number | null;
  licenseAutoRenews: boolean;
  licenseRenewalMonths: number | null;
  licenseRenewalNoticeDays: number | null;
  licenseRenewalLeadDays: number | null;
  licenseRenewalAssignedTo: string | null;
  licenseFeeAmount: string | null;
  licenseFeeCurrency: string | null;
  licenseFeeDueDate: string | null;
  licenseFeeRecurs: boolean;
  licenseFeeAssignedTo: string | null;
  copyrightHolderId: string | null;
  copyrightNotice: string | null;
  commercialGranted: boolean;
  formatPrint: boolean;
  formatEbook: boolean;
  formatAudio: boolean;
  formatVideo: boolean;
  rightsStartDate: string | null;
  completeByDate: string | null;
  maxCopies: number | null;
  notes: string | null;
  overallStatus: string;
};

export function RightsPanel({
  projectId,
  slug,
  rights,
  holders: initialHolders,
  contacts: initialContacts,
  users,
  attachments,
  canEdit,
  feePayments,
  creatorName,
  agreementChat,
}: {
  projectId: string;
  slug: string;
  rights: RightsRow;
  holders: Holder[];
  contacts: Contact[];
  users: Person[];
  attachments: Attachment[];
  canEdit: boolean;
  feePayments: FeePayment[];
  creatorName: string | null;
  agreementChat: AgreementChatSnapshot;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [holders, setHolders] = useState(initialHolders);
  const [contacts, setContacts] = useState(initialContacts);
  const [f, setF] = useState({
    agreementType: rights.agreementType,
    mouStatus: rights.mouStatus,
    mouCommercial: rights.mouCommercial,
    mouSignedDate: rights.mouSignedDate ?? "",
    mouExpiresDate: rights.mouExpiresDate ?? "",
    mouHolderId: rights.mouHolderId ?? "",
    mouContactId: rights.mouContactId ?? "",
    mouAssignedTo: rights.mouAssignedTo ?? "",
    licenseStatus: rights.licenseStatus,
    licenseSignedDate: rights.licenseSignedDate ?? "",
    licenseExpiresDate: rights.licenseExpiresDate ?? "",
    licenseHolderId: rights.licenseHolderId ?? "",
    licenseContactId: rights.licenseContactId ?? "",
    licenseAssignedTo: rights.licenseAssignedTo ?? "",
    licenseTermMonths:
      rights.licenseTermMonths != null ? String(rights.licenseTermMonths) : "",
    licenseAutoRenews: rights.licenseAutoRenews ?? false,
    licenseRenewalMonths:
      rights.licenseRenewalMonths != null
        ? String(rights.licenseRenewalMonths)
        : "",
    licenseRenewalNoticeDays:
      rights.licenseRenewalNoticeDays != null
        ? String(rights.licenseRenewalNoticeDays)
        : "",
    licenseRenewalLeadDays:
      rights.licenseRenewalLeadDays != null
        ? String(rights.licenseRenewalLeadDays)
        : "30",
    licenseRenewalAssignedTo: rights.licenseRenewalAssignedTo ?? "",
    licenseFeeAmount:
      rights.licenseFeeAmount != null ? String(rights.licenseFeeAmount) : "",
    licenseFeeCurrency: rights.licenseFeeCurrency ?? "",
    licenseFeeDueDate: rights.licenseFeeDueDate ?? "",
    licenseFeeRecurs: rights.licenseFeeRecurs ?? false,
    licenseFeeAssignedTo: rights.licenseFeeAssignedTo ?? "",
    copyrightHolderId: rights.copyrightHolderId ?? "",
    copyrightNotice: rights.copyrightNotice ?? "",
    commercialGranted: rights.commercialGranted,
    formatPrint: rights.formatPrint,
    formatEbook: rights.formatEbook,
    formatAudio: rights.formatAudio,
    formatVideo: rights.formatVideo,
    rightsStartDate: rights.rightsStartDate ?? "",
    completeByDate: rights.completeByDate ?? "",
    maxCopies: rights.maxCopies != null ? String(rights.maxCopies) : "",
    notes: rights.notes ?? "",
  });

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const overallStatus = deriveOverall(
    f.agreementType,
    f.mouStatus as RightsStep,
    f.licenseStatus as RightsStep
  );
  const overall = OVERALL[overallStatus] ?? OVERALL.none;
  const showMou = f.agreementType !== "license_only";
  const showLicense = f.agreementType !== "mou_only";

  async function save() {
    start(async () => {
      try {
        const res = await updateRights(projectId, {
        agreementType: f.agreementType as never,
        mouStatus: f.mouStatus as never,
        mouCommercial: f.mouCommercial,
        mouSignedDate: f.mouSignedDate || undefined,
        mouExpiresDate: f.mouExpiresDate || undefined,
        mouHolderId: f.mouHolderId || null,
        mouContactId: f.mouContactId || null,
        mouAssignedTo: f.mouAssignedTo || null,
        licenseStatus: f.licenseStatus as never,
        licenseSignedDate: f.licenseSignedDate || undefined,
        licenseExpiresDate: f.licenseExpiresDate || undefined,
        licenseHolderId: f.licenseHolderId || null,
        licenseContactId: f.licenseContactId || null,
        licenseAssignedTo: f.licenseAssignedTo || null,
        licenseTermMonths: f.licenseTermMonths ? Number(f.licenseTermMonths) : null,
        licenseAutoRenews: f.licenseAutoRenews,
        licenseRenewalMonths: f.licenseRenewalMonths
          ? Number(f.licenseRenewalMonths)
          : null,
        licenseRenewalNoticeDays: f.licenseRenewalNoticeDays
          ? Number(f.licenseRenewalNoticeDays)
          : null,
        licenseRenewalLeadDays: f.licenseRenewalLeadDays
          ? Number(f.licenseRenewalLeadDays)
          : undefined,
        licenseRenewalAssignedTo: f.licenseRenewalAssignedTo || null,
        licenseFeeAmount: f.licenseFeeAmount ? Number(f.licenseFeeAmount) : null,
        licenseFeeCurrency: f.licenseFeeCurrency || null,
        licenseFeeDueDate: f.licenseFeeDueDate || undefined,
        licenseFeeRecurs: f.licenseFeeRecurs,
        licenseFeeAssignedTo: f.licenseFeeAssignedTo || null,
        copyrightHolderId: f.copyrightHolderId || null,
        copyrightNotice: f.copyrightNotice || undefined,
        commercialGranted: f.commercialGranted,
        formatPrint: f.formatPrint,
        formatEbook: f.formatEbook,
        formatAudio: f.formatAudio,
        formatVideo: f.formatVideo,
        rightsStartDate: f.rightsStartDate || undefined,
        completeByDate: f.completeByDate || undefined,
        maxCopies: f.maxCopies ? Number(f.maxCopies) : null,
        notes: f.notes || undefined,
        });
        if (res?.error) throw new Error(res.error);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save rights.");
      }
    });
  }

  async function addHolder(which: "mou" | "license" | "copyright") {
    const name = (await promptDialog("New publisher / rights-holder name:", { title: "Add publisher", confirmLabel: "Add publisher" }))?.trim();
    if (!name) return;
    const field = which === "mou" ? "mouHolderId" : which === "copyright" ? "copyrightHolderId" : "licenseHolderId";
    const temporaryId = `pending-${crypto.randomUUID()}`;
    const previous = holders;
    setHolders((current) => [...current, { id: temporaryId, name }]);
    set(field, temporaryId);
    start(async () => {
      try {
        const holder = await createHolder(name);
        if (!holder.id) throw new Error("Could not create the publisher.");
        setHolders((current) => {
          const withoutTemporary = current.filter((item) => item.id !== temporaryId);
          return withoutTemporary.some((item) => item.id === holder.id)
            ? withoutTemporary
            : [...withoutTemporary, { id: holder.id, name: holder.name }].sort((a, b) =>
                a.name.localeCompare(b.name)
              );
        });
        set(field, holder.id);
        if (holder.existing) toast.info(`Using existing publisher “${holder.name}”`);
      } catch (error) {
        setHolders(previous);
        set(field, "");
        toast.error(error instanceof Error ? error.message : "Could not create the publisher.");
      }
    });
  }
  async function addContact(holderId: string, which: "mou" | "license") {
    if (!holderId) return toast.error("Pick a publisher first.");
    const name = (await promptDialog("New contact name:", { title: "Add contact", confirmLabel: "Next" }))?.trim();
    if (!name) return;
    const enteredEmail = await promptDialog("Contact email (optional):", { title: "Contact email", confirmLabel: "Add contact" });
    if (enteredEmail === null) return;
    const email = enteredEmail.trim() || undefined;
    const field = which === "mou" ? "mouContactId" : "licenseContactId";
    const temporaryId = `pending-${crypto.randomUUID()}`;
    const previous = contacts;
    setContacts((current) => [...current, { id: temporaryId, holderId, name }]);
    set(field, temporaryId);
    start(async () => {
      try {
        const id = await createContact(holderId, name, email);
        if (!id) throw new Error("Could not create the contact.");
        setContacts((current) =>
          current.map((contact) =>
            contact.id === temporaryId ? { ...contact, id } : contact
          )
        );
        set(field, id);
      } catch (error) {
        setContacts(previous);
        set(field, "");
        toast.error(error instanceof Error ? error.message : "Could not create the contact.");
      }
    });
  }

  const initiate = (step: "mou" | "license") =>
    start(async () => {
      try {
        await initiateRightsStep(projectId, step);
        toast.success("Request task created");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not create the request task.");
      }
    });

  return (
    <div className="w-full min-w-0 space-y-5" aria-busy={pending}>
      {/* Overall status */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <Badge className={cn("text-sm", overall.className)}>{overall.label}</Badge>
          <HelpTip title="Do we have the rights we need?" side="bottom" align="start">
            This badge rolls up the steps below. It reads{" "}
            <strong>complete</strong> once every needed step is signed,{" "}
            <strong>in progress</strong> while you're still chasing one, and{" "}
            <strong>not started</strong> before anything's set up. “In progress”
            (or a past complete-by date) raises a project blocker.
          </HelpTip>
          {!canEdit ? (
            <span className="truncate text-xs text-muted-foreground">Read-only (managers can edit)</span>
          ) : null}
        </div>
        <div className="w-full sm:ml-auto sm:w-auto">
          <AgreementChatSheet initialSnapshot={agreementChat} canManage={canEdit} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_minmax(22rem,27rem)]">
        <div className="min-w-0 space-y-5">
          {/* Agreement type */}
          <Card>
            <CardContent className="space-y-3 py-4">
              <Label className="flex items-center gap-1.5">
                Agreement type
                <HelpTip title="Which agreement applies?">
                  <strong>MoU only</strong> — a memorandum covers everything you need
                  (e.g. non-commercial translate / eBook / audio).{" "}
                  <strong>MoU + commercial license</strong> — the MoU covers some
                  uses, but a paid license is needed for others (e.g. printing for
                  sale). <strong>Commercial license only</strong> — a single paid
                  license, no MoU step.
                </HelpTip>
              </Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { v: "mou_only", l: "MoU only" },
                  { v: "mou_plus_license", l: "MoU + commercial license" },
                  { v: "license_only", l: "Commercial license only" },
                ].map((o) => (
                  <label
                    key={o.v}
                    className={cn(
                      "cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors",
                      "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                      f.agreementType === o.v
                        ? "border-foreground bg-secondary"
                        : "border-input text-muted-foreground",
                      !canEdit && "cursor-not-allowed opacity-70"
                    )}
                  >
                    <input
                      type="radio"
                      name="agreementType"
                      className="sr-only"
                      checked={f.agreementType === o.v}
                      disabled={!canEdit}
                      onChange={() => set("agreementType", o.v)}
                    />
                    {o.l}
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {showMou ? (
            <StepBlock
              title="Step 1 — Memorandum of Understanding (MoU)"
              status={f.mouStatus}
              onStatus={(v) => set("mouStatus", v)}
              signedDate={f.mouSignedDate}
              onSignedDate={(v) => set("mouSignedDate", v)}
              expiresDate={f.mouExpiresDate}
              onExpiresDate={(v) => set("mouExpiresDate", v)}
              holderId={f.mouHolderId}
              onHolder={(v) => set("mouHolderId", v)}
              contactId={f.mouContactId}
              onContact={(v) => set("mouContactId", v)}
              assignedTo={f.mouAssignedTo}
              onAssignee={(v) => set("mouAssignedTo", v)}
              holders={holders}
              contacts={contacts}
              users={users}
              canEdit={canEdit}
              onAddHolder={() => addHolder("mou")}
              onAddContact={() => addContact(f.mouHolderId, "mou")}
              taskId={rights.mouTaskId}
              onInitiate={() => initiate("mou")}
              slug={slug}
              extra={
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={f.mouCommercial}
                    disabled={!canEdit}
                    onChange={(e) => set("mouCommercial", e.target.checked)}
                  />
                  This MoU grants commercial use
                </label>
              }
              targetId={rights.id}
              fileLabel="mou"
              attachments={attachments}
            />
          ) : null}

          {showLicense ? (
            <StepBlock
              title="Step 2 — Commercial license"
              status={f.licenseStatus}
              onStatus={(v) => set("licenseStatus", v)}
              signedDate={f.licenseSignedDate}
              onSignedDate={(v) => set("licenseSignedDate", v)}
              expiresDate={f.licenseExpiresDate}
              onExpiresDate={(v) => set("licenseExpiresDate", v)}
              holderId={f.licenseHolderId}
              onHolder={(v) => set("licenseHolderId", v)}
              contactId={f.licenseContactId}
              onContact={(v) => set("licenseContactId", v)}
              assignedTo={f.licenseAssignedTo}
              onAssignee={(v) => set("licenseAssignedTo", v)}
              holders={holders}
              contacts={contacts}
              users={users}
              canEdit={canEdit}
              onAddHolder={() => addHolder("license")}
              onAddContact={() => addContact(f.licenseHolderId, "license")}
              taskId={rights.licenseTaskId}
              onInitiate={() => initiate("license")}
              slug={slug}
              targetId={rights.id}
              fileLabel="license"
              attachments={attachments}
              extra={
                <div className="space-y-3 border-t pt-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                Term &amp; renewal
                <HelpTip iconClassName="size-3" label="About term & renewal">
                  Initial term length and what happens at the end. Auto-renewing
                  licenses just show the date; others get a reminder task ahead of
                  expiry.
                </HelpTip>
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Term (months)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={f.licenseTermMonths}
                    disabled={!canEdit}
                    onChange={(e) => set("licenseTermMonths", e.target.value)}
                    placeholder="e.g. 60"
                    className="tabular-nums"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Renewal period (mo)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={f.licenseRenewalMonths}
                    disabled={!canEdit}
                    onChange={(e) => set("licenseRenewalMonths", e.target.value)}
                    placeholder="e.g. 12"
                    className="tabular-nums"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Notice window (days)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={f.licenseRenewalNoticeDays}
                    disabled={!canEdit}
                    onChange={(e) =>
                      set("licenseRenewalNoticeDays", e.target.value)
                    }
                    placeholder="e.g. 60"
                    className="tabular-nums"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={f.licenseAutoRenews}
                  disabled={!canEdit}
                  onChange={(e) => set("licenseAutoRenews", e.target.checked)}
                />
                Auto-renews
              </label>
              {f.licenseAutoRenews ? (
                f.licenseExpiresDate ? (
                  <p className="text-xs font-medium text-success">
                    Auto-renews on {f.licenseExpiresDate} — no action needed.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Auto-renews. Set a term or expiry date to show the renewal date.
                  </p>
                )
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <Label className="text-xs">Renewal reminder owner</Label>
                    <select
                      className={selectClass}
                      value={f.licenseRenewalAssignedTo}
                      disabled={!canEdit}
                      onChange={(e) =>
                        set("licenseRenewalAssignedTo", e.target.value)
                      }
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Remind (days before)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="365"
                      value={f.licenseRenewalLeadDays}
                      disabled={!canEdit}
                      onChange={(e) =>
                        set("licenseRenewalLeadDays", e.target.value)
                      }
                      className="tabular-nums"
                    />
                  </div>
                </div>
              )}

              {/* License fee */}
              <div className="space-y-3 border-t pt-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  License fee
                  <HelpTip iconClassName="size-3" label="About the license fee">
                    The fee paid to secure this license. Setting an amount creates
                    a high-priority reminder task to pay it, assigned to the owner
                    below — the project creator by default. Turn on “Recurs on each
                    renewal” to track a fresh fee every term.
                  </HelpTip>
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-1">
                    <Label className="text-xs">Fee amount</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={f.licenseFeeAmount}
                      disabled={!canEdit}
                      onChange={(e) => set("licenseFeeAmount", e.target.value)}
                      placeholder="e.g. 300"
                      className="tabular-nums"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Currency</Label>
                    <Input
                      value={f.licenseFeeCurrency}
                      disabled={!canEdit}
                      onChange={(e) => set("licenseFeeCurrency", e.target.value)}
                      placeholder="USD"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">First payment due</Label>
                    <Input
                      type="date"
                      value={f.licenseFeeDueDate}
                      disabled={!canEdit}
                      onChange={(e) => set("licenseFeeDueDate", e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <Label className="text-xs">Payment owner</Label>
                    <select
                      className={selectClass}
                      value={f.licenseFeeAssignedTo}
                      disabled={!canEdit}
                      onChange={(e) => set("licenseFeeAssignedTo", e.target.value)}
                    >
                      <option value="">
                        {creatorName
                          ? `Project creator (${creatorName})`
                          : "Project creator"}
                      </option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-end gap-2 pb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={f.licenseFeeRecurs}
                      disabled={!canEdit}
                      onChange={(e) => set("licenseFeeRecurs", e.target.checked)}
                    />
                    Recurs on each renewal
                  </label>
                </div>
                {feePayments.length > 0 ? (
                  <div className="rounded-md border bg-muted/30 px-3">
                    <LicenseFeePayments
                      slug={slug}
                      canEdit={canEdit}
                      payments={feePayments}
                    />
                  </div>
                ) : f.licenseFeeAmount ? (
                  <p className="text-xs text-muted-foreground">
                    Save to create the payment and its reminder task.
                  </p>
                ) : null}
              </div>
                </div>
              }
            />
          ) : null}
        </div>

        <div className="min-w-0 space-y-5 xl:sticky xl:top-20">
          {/* Outcome */}
          <Card>
            <CardContent className="space-y-4 py-4">
              <div className="flex items-center gap-1.5">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={f.commercialGranted}
                    disabled={!canEdit}
                    onChange={(e) => set("commercialGranted", e.target.checked)}
                  />
                  We hold commercial rights
                </label>
                <HelpTip title="Commercial rights">
                  Tick this if we're allowed to <strong>sell</strong> the work
                  (not just distribute it for free). Printing for sale, for
                  example, almost always needs commercial rights — often via a
                  separate license.
                </HelpTip>
              </div>

              <div>
                <Label className="mb-1.5 flex items-center gap-1.5">
                  Formats we hold rights for
                  <HelpTip title="Formats">
                    Tick each format the signed agreement(s) actually permit. A
                    non-commercial MoU might grant eBook + Audio, while Print
                    needs a commercial license first.
                  </HelpTip>
                </Label>
                <div className="flex flex-wrap gap-3 text-sm">
                  {([
                    ["formatPrint", "Print"],
                    ["formatEbook", "eBook"],
                    ["formatAudio", "Audio"],
                    ["formatVideo", "Video"],
                  ] as const).map(([k, l]) => (
                    <label key={k} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={f[k]}
                        disabled={!canEdit}
                        onChange={(e) => set(k, e.target.checked)}
                      />
                      {l}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
                <div className="grid gap-1">
                  <Label className="text-xs">Rights start date</Label>
                  <Input
                    type="date"
                    value={f.rightsStartDate}
                    disabled={!canEdit}
                    onChange={(e) => set("rightsStartDate", e.target.value)}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Complete by</Label>
                  <Input
                    type="date"
                    value={f.completeByDate}
                    disabled={!canEdit}
                    onChange={(e) => set("completeByDate", e.target.value)}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Max print copies</Label>
                  <Input
                    type="number"
                    min="0"
                    value={f.maxCopies}
                    disabled={!canEdit}
                    onChange={(e) => set("maxCopies", e.target.value)}
                    className="tabular-nums"
                  />
                </div>
              </div>

              <div className="grid gap-1">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  rows={2}
                  value={f.notes}
                  disabled={!canEdit}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Copyright */}
          <Card>
            <CardContent className="space-y-3 py-4">
              <div className="flex items-center gap-1.5">
                <p className="font-medium">Copyright</p>
                <HelpTip title="Copyright">
                  Who owns the copyright, and the exact notice to print when
                  laying out the book. Shown on the project Overview for the
                  layout team.
                </HelpTip>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Copyright holder</Label>
                <div className="flex gap-1">
                  <select
                    className={selectClass}
                    value={f.copyrightHolderId}
                    disabled={!canEdit}
                    onChange={(e) => set("copyrightHolderId", e.target.value)}
                  >
                    <option value="">—</option>
                    {holders.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                  {canEdit ? (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Add holder"
                      onClick={() => addHolder("copyright")}
                    >
                      <Plus className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">
                  Copyright notice (use when laying out the book)
                </Label>
                <Textarea
                  rows={3}
                  value={f.copyrightNotice}
                  disabled={!canEdit}
                  onChange={(e) => set("copyrightNotice", e.target.value)}
                  placeholder={"© <year> by <holder>\nPublished by <publisher>…"}
                />
              </div>
            </CardContent>
          </Card>

          {canEdit ? (
            <Button onClick={save} disabled={pending} className="w-full">
              {pending ? "Saving…" : "Save rights"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StepBlock(props: {
  title: string;
  status: string;
  onStatus: (v: string) => void;
  signedDate: string;
  onSignedDate: (v: string) => void;
  expiresDate: string;
  onExpiresDate: (v: string) => void;
  holderId: string;
  onHolder: (v: string) => void;
  contactId: string;
  onContact: (v: string) => void;
  assignedTo: string;
  onAssignee: (v: string) => void;
  holders: Holder[];
  contacts: Contact[];
  users: Person[];
  canEdit: boolean;
  onAddHolder: () => void;
  onAddContact: () => void;
  taskId: string | null;
  onInitiate: () => void;
  slug: string;
  extra?: React.ReactNode;
  targetId: string;
  fileLabel: string;
  attachments: Attachment[];
}) {
  const holderContacts = props.contacts.filter((c) => c.holderId === props.holderId);
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="font-medium">{props.title}</p>
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          <div className="grid gap-1">
            <Label className="text-xs">Status</Label>
            <select className={selectClass} value={props.status} disabled={!props.canEdit} onChange={(e) => props.onStatus(e.target.value)}>
              {STEP_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>{o.l}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Signed date</Label>
            <Input type="date" value={props.signedDate} disabled={!props.canEdit} onChange={(e) => props.onSignedDate(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="flex items-center gap-1 text-xs">
              Expires
              <HelpTip iconClassName="size-3" label="About expiry">
                When this agreement lapses. The project flags a warning 30 days
                before, and a critical blocker once it&apos;s passed.
              </HelpTip>
            </Label>
            <Input type="date" value={props.expiresDate} disabled={!props.canEdit} onChange={(e) => props.onExpiresDate(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Publisher / holder</Label>
            <div className="flex gap-1">
              <select className={selectClass} value={props.holderId} disabled={!props.canEdit} onChange={(e) => { props.onHolder(e.target.value); props.onContact(""); }}>
                <option value="">—</option>
                {props.holders.map((h) => (<option key={h.id} value={h.id}>{h.name}</option>))}
              </select>
              {props.canEdit ? (
                <Button variant="outline" size="icon" aria-label="Add publisher" onClick={props.onAddHolder}><Plus className="size-4" /></Button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Contact</Label>
            <div className="flex gap-1">
              <select className={selectClass} value={props.contactId} disabled={!props.canEdit} onChange={(e) => props.onContact(e.target.value)}>
                <option value="">—</option>
                {holderContacts.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              {props.canEdit ? (
                <Button variant="outline" size="icon" aria-label="Add contact" onClick={props.onAddContact}><Plus className="size-4" /></Button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Assigned to (who chases it)</Label>
            <select className={selectClass} value={props.assignedTo} disabled={!props.canEdit} onChange={(e) => props.onAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {props.users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="flex items-center gap-1.5 text-xs">
              Request
              <HelpTip title="Initiate request" side="left">
                Creates a task in the project's Rights phase, assigned to the
                person above, to go obtain this agreement — and flips the step to
                “in progress”. It shows up in their My Tasks and notifications.
              </HelpTip>
            </Label>
            {props.taskId ? (
              <Link href={`/projects/${props.slug}/tasks`} className="inline-flex h-9 items-center gap-1 text-sm text-info hover:underline">
                <ExternalLink className="size-4" /> View request task
              </Link>
            ) : props.canEdit ? (
              <Button variant="outline" size="sm" onClick={props.onInitiate}><Send className="size-4" /> Initiate request</Button>
            ) : (
              <span className="text-sm text-muted-foreground">Not requested</span>
            )}
          </div>
        </div>
        {props.extra}
        <div>
          <Label className="mb-1.5 block text-xs">Document</Label>
          <FileAttachments targetType="rights_item" targetId={props.targetId} attachments={props.attachments} label={props.fileLabel} canEdit={props.canEdit} />
        </div>
      </CardContent>
    </Card>
  );
}
