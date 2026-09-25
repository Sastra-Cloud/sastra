"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

import { sendThreadReply } from "@/lib/email/actions";
import { draftExternalFollowUp } from "@/lib/email/follow-up-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  OutgoingEmailStatus,
  type OutgoingEmailDelivery,
} from "@/components/email/outgoing-email-status";
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

export function ThreadReply({
  threadId,
  recipient,
  followUpId,
  projectId,
  initialDraft,
  defaultCcEmails,
}: {
  threadId: string;
  recipient: string;
  followUpId?: string | null;
  projectId: string | null;
  initialDraft: EmailDraftDTO | null;
  defaultCcEmails: string[];
}) {
  const router = useRouter();
  const [body, setBody] = useState(initialDraft?.body ?? "");
  const [cc, setCc] = useState(
    initialDraft
      ? initialDraft.ccAddresses.join(", ")
      : defaultCcEmails.join(", ")
  );
  const [savedDraft, setSavedDraft] = useState(initialDraft);
  const [pending, start] = useTransition();
  const [drafting, startDraft] = useTransition();
  const [draftPending, startDraftMutation] = useTransition();
  const [discardingDraft, setDiscardingDraft] = useState(false);
  const [delivery, setDelivery] = useState<OutgoingEmailDelivery | null>(null);
  const currentDraftValue: EmailDraftValue = {
    toAddresses: [recipient],
    ccAddresses: cc
      .split(/[,\n;]/)
      .map((email) => email.trim())
      .filter(Boolean),
    subject: "",
    body,
    baselineSubject: null,
    baselineBody: null,
  };
  const hasUnsavedChanges = savedDraft
    ? !emailDraftValueEqual(currentDraftValue, savedDraft)
    : body.length > 0;

  const draftFollowUp = () => {
    if (!followUpId) return;
    startDraft(async () => {
      try {
        const draft = await draftExternalFollowUp(followUpId);
        setBody(draft.body);
        toast.success("Follow-up draft ready for review");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not draft the follow-up.");
      }
    });
  };

  const saveDraft = () => {
    if (!body.trim()) {
      toast.error("Write a message before saving the draft.");
      return;
    }
    startDraftMutation(async () => {
      try {
        const result = await saveEmailDraft({
          projectId,
          kind: "thread_reply",
          contextId: threadId,
          ...currentDraftValue,
        });
        if (result.error || !result.draft) {
          toast.error(result.error || "Could not save the draft.");
          return;
        }
        setSavedDraft(result.draft);
        toast.success("Draft saved");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not save the draft."
        );
      }
    });
  };

  const discardDraft = async () => {
    if (
      !(await confirmDialog("Discard this saved reply and clear the message?"))
    ) {
      return;
    }
    setDiscardingDraft(true);
    startDraftMutation(async () => {
      try {
        const result = await discardEmailDraft("thread_reply", threadId);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setSavedDraft(null);
        setBody("");
        setCc(defaultCcEmails.join(", "));
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
  };

  const send = async () => {
    const text = body.trim();
    if (!text) {
      toast.error("Write a message first.");
      return;
    }
    if (!(await confirmDialog(`Send this reply to ${recipient}?`))) return;
    setDelivery({
      status: "sending",
      label: "Reply",
      recipient,
    });
    start(async () => {
      try {
        const res = await sendThreadReply(
          threadId,
          text,
          cc
            .split(/[,\n;]/)
            .map((email) => email.trim())
            .filter(Boolean)
        );
        if (res?.error) throw new Error(res.error);
        setSavedDraft(null);
        setBody("");
        setDelivery({
          status: "sent",
          label: "Reply",
          recipient,
          sentAt: new Date().toISOString(),
        });
        toast.success("Reply sent");
        router.refresh();
      } catch (error) {
        setDelivery(null);
        toast.error(error instanceof Error ? error.message : "Could not send the reply.");
      }
    });
  };

  return (
    <div className="space-y-2">
      {delivery ? <OutgoingEmailStatus delivery={delivery} /> : null}
      <div className="space-y-1.5">
        <Label htmlFor={`reply-cc-${threadId}`}>Cc</Label>
        <Textarea
          id={`reply-cc-${threadId}`}
          value={cc}
          onChange={(event) => setCc(event.target.value)}
          rows={1}
          placeholder="Separate emails with commas"
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Uses the workspace default CC list. You can change it for this reply.
        </p>
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder={`Reply to ${recipient}…`}
        disabled={pending}
      />
      <EmailDraftControls
        hasSavedDraft={Boolean(savedDraft)}
        hasUnsavedChanges={hasUnsavedChanges}
        saving={draftPending && !discardingDraft}
        discarding={discardingDraft}
        updatedAt={savedDraft?.updatedAt ?? null}
        onSave={saveDraft}
        onDiscard={discardDraft}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Sends from the shared mailbox to {recipient}.
          </p>
          {followUpId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={draftFollowUp}
              disabled={pending || drafting}
            >
              {drafting ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {drafting ? "Drafting…" : "Draft follow-up"}
            </Button>
          ) : null}
        </div>
        <Button
          size="sm"
          onClick={send}
          disabled={pending || drafting || draftPending || !body.trim()}
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : null}
          {pending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </div>
  );
}
