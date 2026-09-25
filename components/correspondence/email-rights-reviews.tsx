"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FileCheck2, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  approveEmailRightsReview,
  dismissEmailRightsReview,
  retryEmailRightsReview,
} from "@/lib/email/rights-review-actions";
import type { EmailRightsReviewProposal } from "@/lib/db/schema";
import { collapseSignedAgreementReviews } from "@/lib/email/rights-review-selection";

type Review = {
  id: string;
  projectId: string;
  projectTitle: string;
  fileId: string;
  fileName: string;
  kind: "signed_agreement" | "license_fee_receipt" | null;
  proposal: EmailRightsReviewProposal | null;
  status: "pending" | "processing" | "ready" | "failed" | "approved" | "dismissed";
  error: string | null;
};

type Payment = {
  id: string;
  projectId: string;
  period: string;
  amount: string;
  currency: string;
};

type Project = { id: string; title: string };

const today = () => new Date().toISOString().slice(0, 10);

export function EmailRightsReviews({
  reviews,
  holders,
  payments,
  projects,
}: {
  reviews: Review[];
  holders: Array<{ id: string; name: string }>;
  payments: Payment[];
  projects: Project[];
}) {
  const router = useRouter();
  useEffect(() => {
    if (!reviews.some((review) => review.status === "pending" || review.status === "processing")) return;
    const timer = window.setTimeout(() => router.refresh(), 2_500);
    return () => window.clearTimeout(timer);
  }, [reviews, router]);
  if (!reviews.length) return null;
  const visibleReviews = collapseSignedAgreementReviews(reviews);
  const projectKey = projects.map((project) => project.id).join(":");

  return (
    <div className="space-y-3">
      {visibleReviews.map((review) => (
        <EmailRightsReviewCard
          key={`${review.id}:${projectKey}`}
          review={review}
          holders={holders}
          payments={payments.filter((payment) => payment.projectId === review.projectId)}
          projects={projects}
        />
      ))}
    </div>
  );
}

function EmailRightsReviewCard({
  review,
  holders,
  payments,
  projects,
}: {
  review: Review;
  holders: Array<{ id: string; name: string }>;
  payments: Payment[];
  projects: Project[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const agreement = review.proposal?.agreement;
  const payment = review.proposal?.payment;
  const [step, setStep] = useState<"mou" | "license">(agreement?.step ?? "license");
  const [agreementType, setAgreementType] = useState<
    "mou_only" | "mou_plus_license" | "license_only"
  >(agreement?.agreementType ?? "mou_plus_license");
  const [holderId, setHolderId] = useState(agreement?.holderId ?? "none");
  const [signedDate, setSignedDate] = useState(agreement?.signedDate ?? today());
  const [territory, setTerritory] = useState(agreement?.territory ?? "");
  const [commercial, setCommercial] = useState(agreement?.commercialGranted ?? false);
  const [formats, setFormats] = useState(
    agreement?.formats ?? { print: false, ebook: false, audio: false, video: false }
  );
  const suggestedPayment = payment?.suggestedPaymentId;
  const [paymentId, setPaymentId] = useState(
    suggestedPayment && payments.some((item) => item.id === suggestedPayment)
      ? suggestedPayment
      : payments.length === 1
        ? payments[0].id
        : "none"
  );
  const [paidDate, setPaidDate] = useState(payment?.paidDate ?? today());
  const [paymentAmount, setPaymentAmount] = useState(
    payment?.amount != null ? String(payment.amount) : ""
  );
  const [paymentCurrency, setPaymentCurrency] = useState(payment?.currency ?? "USD");
  const agreementProjects = projects.length
    ? projects
    : [{ id: review.projectId, title: review.projectTitle }];
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    () => new Set(agreementProjects.map((project) => project.id))
  );

  if (review.status === "approved" || review.status === "dismissed") return null;

  const run = (fn: () => Promise<{ error?: string }>, success?: string) => {
    start(async () => {
      try {
        const result = await fn();
        if (result.error) throw new Error(result.error);
        if (success) toast.success(success);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The review could not be updated.");
      }
    });
  };

  if (review.status === "pending" || review.status === "processing") {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
          <div>
            <p className="text-sm font-medium">Checking rights document</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {review.fileName} · {review.projectTitle}. No project data changes until a manager approves.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (review.status === "failed") {
    return (
      <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
        <p className="text-sm font-medium">Couldn’t review {review.fileName}</p>
        <p className="mt-1 text-xs text-muted-foreground">{review.error ?? "Document extraction failed."}</p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => retryEmailRightsReview(review.id))}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Retry
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => dismissEmailRightsReview(review.id))}>
            <X className="size-4" /> Dismiss
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <FileCheck2 className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              Review suggested {review.kind === "signed_agreement" ? "rights update" : "license-fee payment"}
              <Badge variant="outline">{Math.round((review.proposal?.confidence ?? 0) * 100)}%</Badge>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {review.kind === "signed_agreement"
                ? review.proposal?.reason
                : `${review.projectTitle} · ${review.proposal?.reason}`}
            </p>
            <Link href={`/api/files/${review.fileId}/download`} className="mt-1 inline-block truncate text-xs text-primary hover:underline">
              Open {review.fileName}
            </Link>
          </div>
        </div>
        <Button type="button" size="icon" variant="ghost" aria-label="Dismiss suggestion" disabled={pending} onClick={() => run(() => dismissEmailRightsReview(review.id))}>
          <X className="size-4" />
        </Button>
      </div>

      {review.kind === "signed_agreement" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Agreement step">
            <Select value={step} onValueChange={(value) => value && setStep(value as typeof step)}>
              <SelectTrigger className="w-full min-w-0"><SelectValue>{(value: string | null) => value === "mou" ? "MoU" : "Commercial license"}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="mou">MoU</SelectItem><SelectItem value="license">Commercial license</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field label="Agreement type">
            <Select value={agreementType} onValueChange={(value) => value && setAgreementType(value as typeof agreementType)}>
              <SelectTrigger className="w-full min-w-0"><SelectValue>{(value: string | null) => ({ mou_only: "MoU only", mou_plus_license: "MoU + license", license_only: "License only" })[value ?? ""] ?? "Agreement type"}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="mou_only">MoU only</SelectItem><SelectItem value="mou_plus_license">MoU + license</SelectItem><SelectItem value="license_only">License only</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field label="Publisher / rights holder">
            <Select value={holderId} onValueChange={(value) => setHolderId(value ?? "none")}>
              <SelectTrigger className="w-full min-w-0"><SelectValue>{(value: string | null) => value === "none" ? "Not set" : holders.find((holder) => holder.id === value)?.name ?? "Select holder"}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="none">Not set</SelectItem>{holders.map((holder) => <SelectItem key={holder.id} value={holder.id}>{holder.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Signed date"><Input type="date" value={signedDate} onChange={(event) => setSignedDate(event.target.value)} /></Field>
          <Field label="Territory"><Input value={territory} onChange={(event) => setTerritory(event.target.value)} placeholder="Country or region the license covers" /></Field>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Granted rights</Label>
            <label className="flex min-h-9 items-center gap-2 text-sm"><Checkbox checked={commercial} onCheckedChange={(value) => setCommercial(value === true)} /> Commercial</label>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Formats confirmed by this document</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {(["print", "ebook", "audio", "video"] as const).map((format) => (
                <label key={format} className="flex min-h-9 items-center gap-2 text-sm capitalize">
                  <Checkbox checked={formats[format]} onCheckedChange={(value) => setFormats((current) => ({ ...current, [format]: value === true }))} />
                  {format === "ebook" ? "eBook" : format}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">
              Apply this agreement to
            </Label>
            <div className="grid gap-2 rounded-lg border bg-background/70 p-3 sm:grid-cols-2">
              {agreementProjects.map((project) => (
                <label
                  key={project.id}
                  className="flex min-h-9 items-start gap-2 text-sm"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={selectedProjectIds.has(project.id)}
                    onCheckedChange={(value) =>
                      setSelectedProjectIds((current) => {
                        const next = new Set(current);
                        if (value === true) next.add(project.id);
                        else next.delete(project.id);
                        return next;
                      })
                    }
                  />
                  <span>{project.title}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button
              disabled={pending || !signedDate || selectedProjectIds.size === 0}
              onClick={() =>
                run(
                  () =>
                    approveEmailRightsReview(review.id, {
                      kind: "signed_agreement",
                      projectIds: [...selectedProjectIds],
                      step,
                      agreementType,
                      signedDate: signedDate || null,
                      holderId: holderId === "none" ? null : holderId,
                      territory: territory.trim() || null,
                      commercialGranted: commercial,
                      formatPrint: formats.print,
                      formatEbook: formats.ebook,
                      formatAudio: formats.audio,
                      formatVideo: formats.video,
                    }),
                  selectedProjectIds.size === 1
                    ? "Rights updated and the agreement attached."
                    : `Rights updated on ${selectedProjectIds.size} projects and the agreement attached to each.`
                )
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Approve rights update
            </Button>
            <p className="text-xs text-muted-foreground">Approval marks this step signed and attaches the PDF to each checked project.</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="License-fee payment">
            <Select value={paymentId} onValueChange={(value) => setPaymentId(value ?? "none")}>
              <SelectTrigger className="w-full min-w-0"><SelectValue>{(value: string | null) => {
                const selected = payments.find((item) => item.id === value);
                return selected ? `${selected.period === "initial" ? "Initial fee" : selected.period} · ${selected.currency} ${Number(selected.amount).toFixed(2)}` : "No existing fee";
              }}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="none">Select a payment</SelectItem>{payments.map((item) => <SelectItem key={item.id} value={item.id}>{item.period === "initial" ? "Initial fee" : item.period} · {item.currency} {Number(item.amount).toFixed(2)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Paid date"><Input type="date" value={paidDate} onChange={(event) => setPaidDate(event.target.value)} /></Field>
          {payments.length === 0 ? (
            <>
              <Field label="Receipt amount"><Input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></Field>
              <Field label="Currency"><Input value={paymentCurrency} maxLength={8} onChange={(event) => setPaymentCurrency(event.target.value.toUpperCase())} /></Field>
            </>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button disabled={pending || !paidDate || (payments.length > 0 ? paymentId === "none" : !(Number(paymentAmount) > 0 && paymentCurrency.trim().length >= 3))} onClick={() => {
              const selected = payments.find((item) => item.id === paymentId);
              run(() => approveEmailRightsReview(review.id, { kind: "license_fee_receipt", paymentId: selected?.id ?? null, amount: selected ? Number(selected.amount) : Number(paymentAmount), currency: selected?.currency ?? paymentCurrency, paidDate }), "License fee marked paid and receipt attached.");
            }}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Approve payment
            </Button>
            <p className="text-xs text-muted-foreground">{payments.length ? "The fee stays unpaid until you approve this receipt." : "Approval creates the initial fee record, marks it paid, and attaches the receipt."}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0 space-y-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
