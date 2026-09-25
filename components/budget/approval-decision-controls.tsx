"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";

import {
  approveBudgetApprovalAssignment,
  requestBudgetApprovalChanges,
} from "@/lib/budget/approval-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ApprovalDecisionControls({
  assignmentId,
  decision,
  requestStatus,
  canRespond,
  onComplete,
}: {
  assignmentId: string;
  decision: "pending" | "approved" | "changes_requested";
  requestStatus: "pending" | "approved" | "changes_requested" | "superseded";
  canRespond: boolean;
  onComplete?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const actionable = canRespond && decision === "pending" && requestStatus === "pending";

  if (!actionable) {
    const label =
      requestStatus === "superseded"
        ? "This approval round was superseded."
        : decision === "approved"
          ? "You approved this budget."
          : decision === "changes_requested"
            ? "You requested changes."
            : "This approval round is no longer accepting decisions.";
    return <p className="text-sm text-muted-foreground">{label}</p>;
  }

  function run(action: () => Promise<{ ok?: true; error?: string }>, success: string) {
    start(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      router.refresh();
      onComplete?.();
    });
  }

  return (
    <div className="space-y-3">
      {showNote ? (
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Describe the required budget change…"
            rows={3}
            autoFocus
          />
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
                  () => requestBudgetApprovalChanges(assignmentId, note),
                  "Changes requested"
                )
              }
            >
              <MessageSquareWarning className="size-4" />
              Submit change request
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
                () => approveBudgetApprovalAssignment(assignmentId),
                "Budget approved"
              )
            }
          >
            <Check className="size-4" />
            Approve
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
