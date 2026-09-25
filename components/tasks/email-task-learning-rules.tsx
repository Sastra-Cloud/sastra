"use client";

import { useTransition } from "react";
import { Brain, Check, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  approveEmailTaskRule,
  rejectEmailTaskRule,
  retireEmailTaskRule,
} from "@/lib/email/task-suggestion-actions";
import type { EmailTaskRuleRow } from "@/lib/email/task-rule-queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePropState } from "@/hooks/use-prop-state";

export function EmailTaskLearningRules({
  rules,
  workspace = false,
}: {
  rules: EmailTaskRuleRow[];
  workspace?: boolean;
}) {
  const router = useRouter();
  const [visible, setVisible] = usePropState(rules);
  const [pending, startTransition] = useTransition();
  if (!workspace && visible.length === 0) return null;

  function run(
    action: () => Promise<void>,
    success: string,
    optimistic: (rows: EmailTaskRuleRow[]) => EmailTaskRuleRow[]
  ) {
    const previous = visible;
    setVisible(optimistic);
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
        router.refresh();
      } catch (error) {
        setVisible(previous);
        toast.error(error instanceof Error ? error.message : "Could not update the preference.");
      }
    });
  }

  const candidates = visible.filter((rule) => rule.status === "candidate");
  const approved = visible.filter((rule) => rule.status === "approved");

  return (
    <section className="overflow-hidden rounded-xl border bg-card surface-shadow">
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Brain className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">
            {workspace ? "Forwarded-email task learning" : "Sastra noticed a preference"}
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            {workspace
              ? "Patterns shared across teammates are review-only until an admin approves them."
              : "Your decisions can suggest a personal rule. Nothing changes until you approve it."}
          </p>
        </div>
      </div>
      <div className="divide-y">
        {candidates.map((rule) => (
          <div key={rule.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <Badge variant="outline">Suggested</Badge>
                <span className="text-xs text-muted-foreground">
                  {rule.evidenceCount} decision{rule.evidenceCount === 1 ? "" : "s"}
                </span>
              </div>
              <p className="text-sm">{rule.explanation}</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(
                    () => rejectEmailTaskRule(rule.id),
                    "Suggestion declined",
                    (rows) => rows.filter((item) => item.id !== rule.id)
                  )
                }
              >
                <X className="size-4" /> Not now
              </Button>
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(
                    () => approveEmailTaskRule(rule.id),
                    "Preference applied",
                    (rows) => rows.map((item) => item.id === rule.id ? { ...item, status: "approved" } : item)
                  )
                }
              >
                <Check className="size-4" /> Apply
              </Button>
            </div>
          </div>
        ))}
        {approved.map((rule) => (
          <div key={rule.id} className="flex items-center gap-3 p-4">
            <Badge variant="secondary">Active</Badge>
            <p className="min-w-0 flex-1 text-sm">{rule.explanation}</p>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(
                  () => retireEmailTaskRule(rule.id),
                  "Preference retired",
                  (rows) => rows.filter((item) => item.id !== rule.id)
                )
              }
            >
              <RotateCcw className="size-4" /> Retire
            </Button>
          </div>
        ))}
        {visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No task-learning rules are awaiting review or active.</p>
        ) : null}
      </div>
    </section>
  );
}
