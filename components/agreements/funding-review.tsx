"use client";
import { useRef, useState, useTransition } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { approveFundingReview, type FundingReviewInput } from "@/lib/agreements/funding-actions";
import { defaultInvoiceOwner, fundingTotalsReconcile } from "@/lib/agreements/funding-review";
import type { ImportExtraction } from "@/lib/imports/types";

export function FundingReview({ importId, extraction, projects, owners, today }: {
  today: string; importId: string; extraction: ImportExtraction;
  projects: Array<{ id: string; title: string; createdBy: string | null; dueDate: string | null }>;
  owners: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const reviewedDates = useRef(new Set(extraction.mouPaymentSchedule.flatMap((payment, index) => payment.dueDate ? [index] : [])));
  const [confirmed, setConfirmed] = useState(false);
  const [data, setData] = useState<FundingReviewInput>(() => ({
    importId, name: extraction.documentTitle ?? "", counterparty: extraction.partnerOrg ?? "",
    contactName: extraction.contactName ?? "", contactEmail: extraction.contactEmail ?? "",
    signedDate: extraction.signedDate ?? "", currency: extraction.projects[0]?.currency ?? "USD",
    total: extraction.agreementTotalAmount ?? 0, ownerId: null,
    allocations: extraction.projects.map((work) => ({ projectId: projects.find((project) => project.title.toLowerCase() === work.title.toLowerCase())?.id ?? "", amount: work.totalAmount ?? 0 })),
    installments: extraction.mouPaymentSchedule.map((payment) => ({ amount: payment.amount ?? 0,
      trigger: payment.trigger === "on_52_episodes" ? "custom" : payment.trigger,
      earliestDate: payment.dueDate ?? (payment.trigger === "on_signing" && extraction.signedDate ? (extraction.signedDate <= today ? today : extraction.signedDate) : null), paymentDueDate: null,
      description: [payment.notes, payment.sourceClause].filter(Boolean).join("\n") || payment.trigger.replaceAll("_", " "),
      requirements: payment.deliveryRequirements ?? [],
    })),
  }));
  const inferredOwner = defaultInvoiceOwner(data.allocations.map((allocation) => {
    const id = projects.find((project) => project.id === allocation.projectId)?.createdBy ?? null;
    return { id, eligible: owners.some((owner) => owner.id === id) };
  }));
  const missingMappings = data.allocations.some((row) => !projects.some((project) => project.id === row.projectId));
  const duplicateMappings = new Set(data.allocations.map((row) => row.projectId).filter(Boolean)).size !== data.allocations.filter((row) => row.projectId).length;
  const missingOwner = !owners.some((owner) => owner.id === (data.ownerId ?? inferredOwner));
  const reconciled = fundingTotalsReconcile(data.total, data.allocations.map((row) => row.amount), data.installments.map((row) => row.amount));
  function update(next: Partial<FundingReviewInput>) {
    setData((current) => ({ ...current, ...next,
      installments: next.installments ?? (next.signedDate !== undefined ? current.installments.map((row, index) =>
        row.trigger === "on_signing" && !reviewedDates.current.has(index) ? { ...row, earliestDate: next.signedDate ? (next.signedDate <= today ? today : next.signedDate) : null } : row) : current.installments),
    }));
    setConfirmed(false);
  }
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2">
      {([['name', 'Agreement'], ['counterparty', 'Counterparty'], ['contactName', 'Invoice recipient name'], ['contactEmail', 'Invoice recipient email'], ['signedDate', 'Proposed signed date'], ['currency', 'Currency']] as const).map(([key, label]) =>
        <label key={key} className="grid gap-1 text-sm">{label}<Input value={data[key]} type={key === "signedDate" ? "date" : "text"} onChange={(event) => update({ [key]: event.target.value })} /></label>)}
      <label className="grid gap-1 text-sm">Agreement total<Input type="number" step="0.01" value={data.total} onChange={(event) => update({ total: Number(event.target.value) })} /></label>
      <label className="grid gap-1 text-sm">Invoice owner<select className="h-9 rounded-md border bg-background px-2" value={data.ownerId ?? inferredOwner ?? ""} onChange={(event) => update({ ownerId: event.target.value || null })}>
        <option value="">Select a manager or administrator</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
      </select></label>
    </div>
    <h2 className="font-semibold">Covered projects and allocations</h2>
    <p className="text-sm text-muted-foreground">Select an existing project for every work before approving. Each work must use a different project.</p>
    {data.allocations.map((row, index) => <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
      <Label className="sm:col-span-2">{extraction.projects[index]?.title}</Label>
      <Combobox.Root items={projects} value={projects.find((project) => project.id === row.projectId) ?? null}
        itemToStringLabel={(project) => project.title} isItemEqualToValue={(a, b) => a.id === b.id}
        onValueChange={(project) => update({ allocations: data.allocations.map((item, i) => i === index ? { ...item, projectId: project?.id ?? "" } : item) })}>
        <div className="relative min-w-0">
          <Combobox.Input aria-label={`Project for ${extraction.projects[index]?.title}`} aria-invalid={!row.projectId}
            aria-describedby={!row.projectId ? `mapping-${index}-error` : undefined} placeholder="Search projects…"
            className="h-10 w-full min-w-0 rounded-md border bg-background py-2 pl-3 pr-10 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <Combobox.Trigger aria-label="Show projects" className="absolute inset-y-0 right-0 flex w-10 items-center justify-center"><ChevronsUpDown className="size-4" /></Combobox.Trigger>
        </div>
        <Combobox.Portal><Combobox.Positioner sideOffset={4} className="z-50">
          <Combobox.Popup className="max-h-72 w-[var(--anchor-width)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
            <Combobox.Empty className="p-3 text-sm text-muted-foreground">No matching projects.</Combobox.Empty>
            <Combobox.List>{(project: typeof projects[number]) => <Combobox.Item key={project.id} value={project}
              className="cursor-default rounded-sm px-3 py-2.5 text-sm break-words data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground">{project.title}</Combobox.Item>}</Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner></Combobox.Portal>
      </Combobox.Root>
      <Input aria-label="Project allocation" type="number" step="0.01" value={row.amount} onChange={(event) => update({ allocations: data.allocations.map((item, i) => i === index ? { ...item, amount: Number(event.target.value) } : item) })} />
      {!row.projectId && <p id={`mapping-${index}-error`} className="text-sm text-destructive sm:col-span-2">Select the existing project for this work.</p>}
      <p className="text-xs text-muted-foreground sm:col-span-2">Proposed publication deadline: {extraction.projects[index]?.publicationDate ?? "Not stated"}. Existing deadline: {projects.find((project) => project.id === row.projectId)?.dueDate ?? "Not set"}. Review any rights or deadline conflicts separately.</p>
    </div>)}
    <h2 className="font-semibold">Installments</h2>
    <p className="text-sm text-muted-foreground">For an agreement already signed, signing installments default to today in the workspace timezone. Reviewed dates stay editable; partner payment deadlines are separate.</p>
    {data.installments.map((row, index) => {
      const edit = (next: Partial<typeof row>) => update({ installments: data.installments.map((item, i) => i === index ? { ...item, ...next } : item) });
      return <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Amount<Input type="number" step="0.01" value={row.amount} onChange={(event) => edit({ amount: Number(event.target.value) })} /></label>
        <label className="grid gap-1 text-sm">Eligibility<select className="h-9 rounded-md border bg-background px-2" value={row.trigger} onChange={(event) => edit({ trigger: event.target.value as typeof row.trigger, earliestDate: reviewedDates.current.has(index) ? row.earliestDate : (event.target.value === "on_signing" && data.signedDate ? (data.signedDate <= today ? today : data.signedDate) : null) })}><option value="on_signing">Signing</option><option value="on_completion">All projects completed</option><option value="custom">Reviewed date</option></select></label>
        <label className="grid gap-1 text-sm">Earliest invoice date<Input type="date" value={row.earliestDate ?? ""} onChange={(event) => { reviewedDates.current.add(index); edit({ earliestDate: event.target.value || null }); }} /></label>
        <label className="grid gap-1 text-sm">Partner payment deadline (optional)<Input type="date" value={row.paymentDueDate ?? ""} onChange={(event) => edit({ paymentDueDate: event.target.value || null })} /></label>
        <label className="grid gap-1 text-sm">Description and source clause<Textarea value={row.description} onChange={(event) => edit({ description: event.target.value })} /></label>
        <label className="grid gap-1 text-sm">Required delivery evidence (one per line)<Textarea value={row.requirements.join("\n")} onChange={(event) => edit({ requirements: event.target.value.split("\n") })} /></label>
      </div>;
    })}
    <p className={reconciled ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{reconciled ? "Allocations and installments both reconcile to the agreement total." : "Allocations and installments must each match the agreement total."}</p>
    {duplicateMappings && <p role="alert" className="text-sm text-destructive">Map each work to a different project.</p>}
    {missingOwner && <p className="text-sm text-muted-foreground">Choose an invoice owner, or map projects with the same eligible creator to use their default ownership.</p>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed the source, mappings, amounts, dates, owner, and delivery requirements. These installments are unbilled and unpaid.</label>
    <Button disabled={pending || !confirmed || !reconciled || missingMappings || duplicateMappings || missingOwner} onClick={() => start(async () => {
      try { const result = await approveFundingReview({ ...data, ownerId: data.ownerId ?? inferredOwner,
        installments: data.installments.map((row) => ({ ...row, requirements: row.requirements.map((value) => value.trim()).filter(Boolean) })) });
        if (result.error) toast.error(result.error); else if (result.groupId) router.push(`/agreements/${result.groupId}`);
      } catch { toast.error("Approval failed. Your review is preserved on this screen."); }
    })}>{pending ? "Approving funding…" : "Approve funding schedule"}</Button>
  </div>;
}
