"use client";

import { useTransition } from "react";
import { Check, LoaderCircle, MailCheck, RotateCcw, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  approveEmailSignalLesson,
  rejectEmailSignalLesson,
  retireEmailSignalLesson,
  runEmailSignalReflectionNow,
} from "@/lib/email/signal-lessons-actions";
import type { EmailSignalLessonRow } from "@/lib/email/signal-lessons-queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePropState } from "@/hooks/use-prop-state";

export function EmailLearningManager({
  lessons,
}: {
  lessons: EmailSignalLessonRow[];
}) {
  const router = useRouter();
  const [visible, setVisible] = usePropState(lessons);
  const [pending, startTransition] = useTransition();
  const candidates = visible.filter((lesson) => lesson.status === "candidate");
  const approved = visible.filter((lesson) => lesson.status === "approved");

  function run<T>(
    action: () => Promise<T>,
    success: string,
    optimistic?: (current: EmailSignalLessonRow[]) => EmailSignalLessonRow[]
  ) {
    const previous = visible;
    if (optimistic) setVisible(optimistic);
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
        router.refresh();
      } catch (error) {
        if (optimistic) setVisible(previous);
        toast.error(error instanceof Error ? error.message : "Learning action failed");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <MailCheck className="size-5 text-primary" /> Email intake learning
          </CardTitle>
          <p className="max-w-3xl text-sm text-muted-foreground">
            When managers dismiss a wrong &ldquo;possible new project&rdquo; suggestion, a
            reflection pass distills those decisions into negative rules about what is not a
            new project. Nothing is applied until an admin approves it here; approved rules are
            added to the intake AI&rsquo;s prompt.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(runEmailSignalReflectionNow, "Reflection completed")}
        >
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {pending ? "Reflecting…" : "Reflect now"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Candidates</h3>
            <Badge variant="secondary">{candidates.length}</Badge>
          </div>
          {candidates.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No negative-rule candidates are awaiting review.
            </p>
          ) : (
            candidates.map((lesson) => (
              <div key={lesson.id} className="space-y-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">candidate</Badge>
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {lesson.evidenceCount} dismissal
                    {lesson.evidenceCount === 1 ? "" : "s"} ·{" "}
                    {Math.round((lesson.confidence ?? 0) * 100)}% confidence
                  </span>
                </div>
                <p className="text-sm">{lesson.lesson}</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => rejectEmailSignalLesson(lesson.id),
                        "Lesson rejected",
                        (current) => current.filter((item) => item.id !== lesson.id)
                      )
                    }
                  >
                    <X className="size-4" /> Reject
                  </Button>
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => approveEmailSignalLesson(lesson.id),
                        "Lesson approved",
                        (current) =>
                          current.map((item) =>
                            item.id === lesson.id
                              ? { ...item, status: "approved" }
                              : item
                          )
                      )
                    }
                  >
                    <Check className="size-4" /> Approve
                  </Button>
                </div>
              </div>
            ))
          )}
        </section>

        <section className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Active negative rules</h3>
            <Badge variant="secondary">{approved.length}</Badge>
          </div>
          {approved.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No negative rules are active. Approved rules are injected into the intake AI.
            </p>
          ) : (
            approved.map((lesson) => (
              <div key={lesson.id} className="flex gap-3 rounded-lg border p-3">
                <p className="min-w-0 flex-1 text-sm">{lesson.lesson}</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => retireEmailSignalLesson(lesson.id),
                      "Lesson retired",
                      (current) => current.filter((item) => item.id !== lesson.id)
                    )
                  }
                >
                  <RotateCcw className="size-4" /> Retire
                </Button>
              </div>
            ))
          )}
        </section>
      </CardContent>
    </Card>
  );
}
