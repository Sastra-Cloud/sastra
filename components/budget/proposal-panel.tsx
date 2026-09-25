"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Download,
  Loader2,
  Mail,
  Send,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { formatDate } from "@/lib/format";
import { CompletionDatePlanner } from "@/components/budget/completion-date-planner";
import {
  OutgoingAttachmentReview,
  type OutgoingEmailAttachment,
} from "@/components/email/outgoing-attachment-review";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  draftMouProposal,
  sendMouProposal,
  updateProposalStatus,
  updateProposedCompletionDate,
} from "@/lib/proposals/actions";
import { learnFromEmailEdit } from "@/lib/print/actions";
import { usePropState } from "@/hooks/use-prop-state";
import { EmailDraftControls } from "@/components/email/email-draft-controls";
import {
  discardEmailDraft,
  saveEmailDraft,
} from "@/lib/email/draft-actions";
import {
  emailDraftValueEqual,
  type EmailDraftDTO,
  type EmailDraftValue,
} from "@/lib/email/draft-types";

export type ProposalDTO = {
  id: string;
  recipientName: string | null;
  recipientEmail: string;
  subject: string;
  currency: string;
  totalAmount: string;
  budgetApprovalRequestId: string | null;
  fileId: string | null;
  status: string;
  sentAt: string;
  sentByName: string | null;
};

function money(value: string | number, currency: string) {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "accepted") return "default";
  if (status === "declined") return "outline";
  return "secondary";
}

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function ProposalPanel({
  projectId,
  projectSlug,
  printRunId,
  partnerQuoteMode,
  partnerQuoteTotal,
  currency,
  canEdit,
  fundingEmail,
  approvalRequired,
  approvalCanSend,
  approvalGateReason,
  proposedCompletionDate,
  realCompletionDeadline,
  initialEmailDraft,
  proposals,
}: {
  projectId: string;
  projectSlug: string;
  printRunId?: string | null;
  partnerQuoteMode: "itemized" | "per_copy" | null;
  partnerQuoteTotal: number;
  currency: string;
  canEdit: boolean;
  fundingEmail: string | null;
  approvalRequired: boolean;
  approvalCanSend: boolean;
  approvalGateReason: string | null;
  /** Self-set completion date offered in drafts before a real agreement exists. */
  proposedCompletionDate: string | null;
  /** The signed agreement's completion deadline, if any (supersedes the above). */
  realCompletionDeadline: string | null;
  initialEmailDraft: EmailDraftDTO | null;
  proposals: ProposalDTO[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drafting, setDrafting] = useState(false);
  const [draftMutationPending, startDraftMutation] = useTransition();
  const [discardingDraft, setDiscardingDraft] = useState(false);
  const [savedEmailDraft, setSavedEmailDraft] = useState(initialEmailDraft);
  const [confirmed, setConfirmed] = useState(false);
  const [visibleProposals, setVisibleProposals] = usePropState(proposals);
  const [sendingProposalId, setSendingProposalId] = useState<string | null>(
    null
  );
  const [proposedDate, setProposedDate] = useState(proposedCompletionDate ?? "");

  function saveProposedDate(value: string) {
    const previous = proposedDate;
    setProposedDate(value); // optimistic
    start(async () => {
      const res = await updateProposedCompletionDate(projectId, value || null);
      if (res?.error) {
        setProposedDate(previous);
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }
  const [compose, setCompose] = useState<{
    to: string;
    cc: string;
    subject: string;
    body: string;
    baselineSubject: string;
    baselineBody: string;
  } | null>(null);

  const hasEmail = Boolean(fundingEmail && fundingEmail.trim());
  const perCopyAttachment = partnerQuoteMode === "per_copy";
  const attachmentName = `${projectSlug}-partner-quotation.${
    perCopyAttachment ? "pdf" : "xlsx"
  }`;
  const runQuery = printRunId
    ? `&run=${encodeURIComponent(printRunId)}`
    : "";
  const proposalAttachments: OutgoingEmailAttachment[] = [
    {
      name: attachmentName,
      mimeType: perCopyAttachment
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      previewUrl: perCopyAttachment
        ? `/api/projects/${projectSlug}/budget/partner-pdf?inline=1${runQuery}`
        : `/api/projects/${projectSlug}/budget/export?audience=partner${runQuery}`,
      description: "Partner-safe quotation",
    },
  ];
  const draftContextId = printRunId ?? projectId;
  const currentDraftValue: EmailDraftValue | null = compose
    ? {
        toAddresses: compose.to ? [compose.to] : [],
        ccAddresses: compose.cc
          .split(/[,\n;]/)
          .map((email) => email.trim())
          .filter(Boolean),
        subject: compose.subject,
        body: compose.body,
        baselineSubject: compose.baselineSubject,
        baselineBody: compose.baselineBody,
      }
    : null;
  const hasUnsavedChanges = currentDraftValue
    ? !savedEmailDraft ||
      !emailDraftValueEqual(currentDraftValue, savedEmailDraft)
    : false;

  function startDraft() {
    if (savedEmailDraft) {
      setCompose({
        to: fundingEmail || savedEmailDraft.toAddresses[0] || "",
        cc: savedEmailDraft.ccAddresses.join(", "),
        subject: savedEmailDraft.subject,
        body: savedEmailDraft.body,
        baselineSubject:
          savedEmailDraft.baselineSubject ?? savedEmailDraft.subject,
        baselineBody: savedEmailDraft.baselineBody ?? savedEmailDraft.body,
      });
      setConfirmed(false);
      toast.success("Saved draft restored");
      return;
    }
    setDrafting(true);
    start(async () => {
      try {
        const res = await draftMouProposal(projectId, printRunId);
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
        setCompose({
          to: res.recipientEmail || fundingEmail || "",
          cc: res.defaultCcEmails.join(", "),
          subject: res.subject,
          body: res.body,
          baselineSubject: res.subject,
          baselineBody: res.body,
        });
        setConfirmed(false);
      } finally {
        setDrafting(false);
      }
    });
  }

  function saveDraft() {
    if (!currentDraftValue) return;
    startDraftMutation(async () => {
      try {
        const result = await saveEmailDraft({
          projectId,
          kind: "funding_proposal",
          contextId: draftContextId,
          ...currentDraftValue,
        });
        if (result.error || !result.draft) {
          toast.error(result.error || "Could not save the draft.");
          return;
        }
        setSavedEmailDraft(result.draft);
        toast.success("Draft saved");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not save the draft."
        );
      }
    });
  }

  async function discardDraft() {
    if (
      !(await confirmDialog("Discard this saved proposal draft and close the composer?"))
    ) {
      return;
    }
    setDiscardingDraft(true);
    startDraftMutation(async () => {
      try {
        const result = await discardEmailDraft(
          "funding_proposal",
          draftContextId
        );
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setSavedEmailDraft(null);
        setCompose(null);
        toast.success("Draft discarded");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not discard the draft."
        );
      } finally {
        setDiscardingDraft(false);
      }
    });
  }

  async function closeComposer() {
    if (
      hasUnsavedChanges &&
      !(await confirmDialog("Close without saving your latest changes?"))
    ) {
      return;
    }
    setCompose(null);
  }

  function send() {
    if (!compose) return;
    const outgoing = compose;
    const optimisticId = `sending-${crypto.randomUUID()}`;
    setSendingProposalId(optimisticId);
    setVisibleProposals((current) => [
      {
        id: optimisticId,
        recipientName: null,
        recipientEmail: outgoing.to,
        subject: outgoing.subject,
        currency,
        totalAmount: partnerQuoteTotal.toFixed(2),
        budgetApprovalRequestId: null,
        fileId: null,
        status: "sending",
        sentAt: new Date().toISOString(),
        sentByName: null,
      },
      ...current,
    ]);
    start(async () => {
      try {
        const res = await sendMouProposal(
          projectId,
          {
            subject: outgoing.subject,
            body: outgoing.body,
            ccEmails: outgoing.cc
              .split(/[,\n;]/)
              .map((e) => e.trim())
              .filter(Boolean),
          },
          printRunId
        );
        if (res?.error) {
          setVisibleProposals((current) =>
            current.filter((proposal) => proposal.id !== optimisticId)
          );
          setSendingProposalId(null);
          toast.error(res.error);
          return;
        }
        if (!res.proposal) {
          setVisibleProposals((current) =>
            current.filter((proposal) => proposal.id !== optimisticId)
          );
          setSendingProposalId(null);
          toast.error("The proposal was sent, but its history could not be loaded.");
          router.refresh();
          return;
        }
        setVisibleProposals((current) =>
          current.map((proposal) =>
            proposal.id === optimisticId ? res.proposal! : proposal
          )
        );
        setSendingProposalId(null);
        const edited =
          outgoing.subject !== outgoing.baselineSubject ||
          outgoing.body !== outgoing.baselineBody;
        if (edited) {
          void learnFromEmailEdit({
            operation: "draft_mou_proposal",
            projectId,
            baselineSubject: outgoing.baselineSubject,
            baselineBody: outgoing.baselineBody,
            finalSubject: outgoing.subject,
            finalBody: outgoing.body,
          }).catch(() => {});
        }
        toast.success("Proposal sent");
        setSavedEmailDraft(null);
        setCompose(null);
        router.refresh();
      } catch (err) {
        setVisibleProposals((current) =>
          current.filter((proposal) => proposal.id !== optimisticId)
        );
        setSendingProposalId(null);
        toast.error(err instanceof Error ? err.message : "Could not send.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4" />
          Funding proposal
        </CardTitle>
        <CardDescription>
          Email the funding partner a proposal with the budget quotation
          attached. Review the draft before it sends — nothing goes out until you
          confirm.
        </CardDescription>
        {canEdit && !compose ? (
          <CardAction>
            <Button
              size="sm"
              disabled={pending || drafting}
              onClick={startDraft}
            >
              <Mail className="size-4" />
              {drafting
                ? "Drafting…"
                : savedEmailDraft
                  ? "Resume draft"
                  : "Draft proposal"}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {realCompletionDeadline ? (
          <div className="flex items-start gap-2 rounded-lg border border-dashed bg-background/50 p-3 text-sm text-muted-foreground">
            <CalendarClock className="mt-0.5 size-4 shrink-0" />
            <p>
              The signed agreement sets a completion deadline of{" "}
              <strong>{formatDate(realCompletionDeadline)}</strong>, so proposals
              use that date. A proposed completion date no longer applies.
            </p>
          </div>
        ) : canEdit ? (
          <div className="space-y-1.5">
            <Label htmlFor="proposed-completion">
              Proposed completion date <span className="text-muted-foreground">(optional)</span>
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="proposed-completion"
                type="date"
                className="w-auto"
                value={proposedDate}
                disabled={pending}
                onChange={(e) => saveProposedDate(e.target.value)}
              />
              <CompletionDatePlanner
                projectId={projectId}
                onPick={(iso) => saveProposedDate(iso)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leave this blank to draft without a timeline. If set, it is
              offered as your target before a license or MoU establishes a real
              deadline.
              <strong> Suggest a date</strong> plans one from your current
              workload.
            </p>
          </div>
        ) : null}
        <div
          className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
            approvalRequired && approvalCanSend
              ? "border-success/30 bg-success/5"
              : "border-dashed bg-background/50 text-muted-foreground"
          }`}
        >
          <ShieldCheck
            className={`mt-0.5 size-4 shrink-0 ${
              approvalRequired && approvalCanSend ? "text-success" : ""
            }`}
          />
          <p>
            {!approvalRequired
              ? "Budget approval is optional and has not been requested. This proposal can be sent normally."
              : approvalCanSend
              ? "The current quotation has unanimous approval and can be sent."
              : approvalGateReason ??
                "The current quotation needs unanimous approval before sending."}
          </p>
        </div>
        {canEdit && !hasEmail ? (
          <p className="rounded-lg border border-dashed bg-background/50 p-3 text-sm text-muted-foreground">
            You can draft now. Add a funding contact email in{" "}
            <strong>Quotation settings</strong> before sending.
          </p>
        ) : null}

        {compose ? (
          <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>To</Label>
                <Input value={compose.to} readOnly aria-invalid={!compose.to} />
              </div>
              <div className="space-y-1.5">
                <Label>Cc</Label>
                <Textarea
                  rows={1}
                  value={compose.cc}
                  placeholder="Separate emails with commas"
                  onChange={(e) => {
                    setCompose((c) => (c ? { ...c, cc: e.target.value } : c));
                    setConfirmed(false);
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input
                value={compose.subject}
                onChange={(e) => {
                  setCompose((c) =>
                    c ? { ...c, subject: e.target.value } : c
                  );
                  setConfirmed(false);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Body</Label>
              <Textarea
                rows={10}
                value={compose.body}
                onChange={(e) => {
                  setCompose((c) => (c ? { ...c, body: e.target.value } : c));
                  setConfirmed(false);
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              <Badge variant="outline" className="mr-1.5 align-middle">
                Partner-safe
              </Badge>
              The current partner quotation is attached automatically. Internal
              costs, notes, spend, and the organization donation fee are
              excluded.
            </p>
            <OutgoingAttachmentReview attachments={proposalAttachments} />
            <EmailDraftControls
              hasSavedDraft={Boolean(savedEmailDraft)}
              hasUnsavedChanges={hasUnsavedChanges}
              saving={draftMutationPending && !discardingDraft}
              discarding={discardingDraft}
              updatedAt={savedEmailDraft?.updatedAt ?? null}
              onSave={saveDraft}
              onDiscard={discardDraft}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
              <Label className="flex items-center gap-2 text-sm font-normal">
                <Checkbox
                  checked={confirmed}
                  onCheckedChange={(v) => setConfirmed(v === true)}
                />
                I reviewed the recipient, message, and attachment.
              </Label>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending || draftMutationPending}
                  onClick={closeComposer}
                >
                  Close
                </Button>
                <Button
                  size="sm"
                  disabled={
                    pending ||
                    draftMutationPending ||
                    !approvalCanSend ||
                    !confirmed ||
                    !compose.to ||
                    !compose.subject.trim() ||
                    !compose.body.trim()
                  }
                  onClick={send}
                >
                  {sendingProposalId ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {sendingProposalId ? "Sending…" : "Send proposal"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {visibleProposals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No proposals sent yet.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {visibleProposals.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {p.recipientName
                        ? `${p.recipientName} · ${p.recipientEmail}`
                        : p.recipientEmail}
                    </span>
                    <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {money(p.totalAmount, p.currency)} ·{" "}
                    {p.status === "sending"
                      ? "Sending now"
                      : new Date(p.sentAt).toLocaleDateString()}
                    {p.sentByName ? ` · ${p.sentByName}` : ""}
                  </p>
                  {p.budgetApprovalRequestId ? (
                    <p className="mt-0.5 text-[11px] text-success">
                      Sent from an approved budget
                    </p>
                  ) : null}
                </div>
                {p.fileId ? (
                  <a
                    href={`/api/files/${p.fileId}/download`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Download className="size-3.5" />
                    File
                  </a>
                ) : null}
                {canEdit && p.status !== "sending" ? (
                  <select
                    className={selectClass}
                    value={p.status}
                    disabled={pending}
                    onChange={(e) => {
                      const status = e.target.value as "sent" | "accepted" | "declined";
                      const previous = p.status;
                      setVisibleProposals((current) =>
                        current.map((proposal) =>
                          proposal.id === p.id ? { ...proposal, status } : proposal
                        )
                      );
                      start(async () => {
                        try {
                          await updateProposalStatus(p.id, status);
                          router.refresh();
                        } catch (error) {
                          setVisibleProposals((current) =>
                            current.map((proposal) =>
                              proposal.id === p.id
                                ? { ...proposal, status: previous }
                                : proposal
                            )
                          );
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not update the proposal status."
                          );
                        }
                      });
                    }}
                  >
                    <option value="sent">Sent</option>
                    <option value="accepted">Accepted</option>
                    <option value="declined">Declined</option>
                  </select>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
