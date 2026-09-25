"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { reprocessMessage } from "@/lib/email/actions";
import {
  describeReprocessResult,
  type ReprocessFeedback,
} from "@/components/correspondence/reprocess-feedback";

export function MessageReprocessButton({
  messageId,
  threadId,
}: {
  messageId: string;
  threadId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ReprocessFeedback | null>(null);

  const openThreadReview = () => {
    const target = document.getElementById("correspondence-review-results");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    router.push(`/correspondence/${threadId}#correspondence-review-results`);
  };

  const onReprocess = () => {
    startTransition(async () => {
      try {
        const result = await reprocessMessage(messageId);
        if (result.error) {
          setFeedback(null);
          toast.error(result.error);
          return;
        }

        const nextFeedback = describeReprocessResult(result, "email");
        setFeedback(nextFeedback);
        const toastOptions = {
          description: nextFeedback.description,
          ...(nextFeedback.destination === "thread-review"
            ? {
                action: {
                  label: "Review",
                  onClick: openThreadReview,
                },
              }
            : {}),
        };
        if (nextFeedback.tone === "success") {
          toast.success(nextFeedback.title, toastOptions);
        } else {
          toast.info(nextFeedback.title, toastOptions);
        }
        router.refresh();
      } catch {
        setFeedback(null);
        toast.error("Could not reprocess this email. Please try again.");
      }
    });
  };

  return (
    <div className="flex max-w-md flex-col items-end gap-1.5 text-right">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={onReprocess}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <RefreshCw className="size-3.5" />
        )}
        {pending ? "Reprocessing…" : "Reprocess this email"}
      </Button>
      {feedback ? (
        <p className="text-xs leading-5 text-muted-foreground" role="status">
          {feedback.description}{" "}
          {feedback.destination === "thread-review" ? (
            <button
              type="button"
              onClick={openThreadReview}
              className="font-medium text-foreground underline underline-offset-4 hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Review above
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
