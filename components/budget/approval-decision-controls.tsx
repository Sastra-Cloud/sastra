"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";

import {
  approveBudgetApprovalAssignment,
  requestBudgetApprovalChanges,
} from "@/lib/budget/approval-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function ApprovalDecisionControls({
  assignmentId,
  decision,
  requestStatus,
  canRespond,
  approvalKind = "budget",
  onComplete,
}: {
  assignmentId: string;
  decision: "pending" | "approved" | "changes_requested";
  requestStatus: "pending" | "approved" | "changes_requested" | "superseded";
  canRespond: boolean;
  approvalKind?: "proposal" | "budget";
  onComplete?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const noteId = useId();
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [savedDecision, setSavedDecision] = useState<{
    assignmentId: string;
    decision: "approved" | "changes_requested";
  } | null>(null);
  const visibleDecision = savedDecision?.assignmentId === assignmentId
    ? savedDecision.decision
    : decision;
  const actionable =
    canRespond && visibleDecision === "pending" && requestStatus === "pending";

  if (!actionable) {
    const label =
      requestStatus === "superseded"
        ? "The quotation changed. Open the current approval request to review it again."
        : !canRespond
          ? "This review is assigned to another teammate. Only they can respond."
        : visibleDecision === "approved"
          ? `You approved this ${approvalKind}. Approval does not send the email.`
          : visibleDecision === "changes_requested"
            ? "You requested changes. Sending is paused until the quotation is revised and reviewed again."
            : "This approval round is no longer accepting decisions.";
    return <p className="text-sm text-muted-foreground">{label}</p>;
  }

  function run(
    nextDecision: "approved" | "changes_requested",
    action: () => Promise<{ ok?: true; error?: string }>,
    success: string,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    start(async () => {
      try {
        const result = await action();
        if (result.error) {
          setError(result.error);
          toast.error(result.error);
          return;
        }
        setSavedDecision({ assignmentId, decision: nextDecision });
        toast.success(success);
        router.refresh();
        onComplete?.();
      } catch {
        const message = "Could not save your decision. Try again; your note is still here.";
        setError(message);
        toast.error(message);
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <div className="space-y-3" aria-busy={pending}>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {showNote ? (
        <div className="space-y-2">
          <Label htmlFor={noteId}>What needs to change?</Label>
          <Textarea
            id={noteId}
            value={note}
            maxLength={2000}
            disabled={pending}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Describe the required quotation change…"
            rows={3}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            The requester can see your note. Sending stays paused until the
            quotation is revised and reviewed again.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setShowNote(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !note.trim()}
              onClick={() =>
                run(
                  "changes_requested",
                  () => requestBudgetApprovalChanges(assignmentId, note),
                  "Changes requested",
                )
              }
            >
              {pending ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" /> : <MessageSquareWarning className="size-4" />}
              {pending ? "Requesting changes…" : "Send change request"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                "approved",
                () => approveBudgetApprovalAssignment(assignmentId),
                approvalKind === "proposal" ? "Proposal approved" : "Budget approved",
              )
            }
          >
            {pending ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" /> : <Check className="size-4" />}
            {pending ? "Approving…" : approvalKind === "proposal" ? "Approve proposal" : "Approve budget"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setShowNote(true)}
          >
            <MessageSquareWarning className="size-4" />
            Request changes
          </Button>
        </div>
      )}
    </div>
  );
}
