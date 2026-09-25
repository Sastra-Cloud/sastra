"use client";

import { useTransition } from "react";
import {
  Brain,
  Check,
  FlaskConical,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  approveAssistantLesson,
  promoteAssistantLesson,
  rejectAssistantLesson,
  rollbackAssistantLesson,
  runAssistantLessonEval,
  runAssistantReflectionNow,
} from "@/lib/assistant/learning-actions";
import type { getAssistantLearningReport } from "@/lib/assistant/learning-queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePropState } from "@/hooks/use-prop-state";

type Report = Awaited<ReturnType<typeof getAssistantLearningReport>>;

export function AssistantLearningManager({ report }: { report: Report }) {
  const router = useRouter();
  const [visibleReport, setVisibleReport] = usePropState(report);
  const [pending, startTransition] = useTransition();
  const candidates = visibleReport.lessons.filter(
    (lesson) => lesson.status === "candidate"
  );
  const approved = visibleReport.lessons.filter(
    (lesson) => lesson.status === "approved"
  );

  function run<T>(
    action: () => Promise<T>,
    success: string,
    optimistic?: (current: Report) => Report
  ) {
    const previous = visibleReport;
    if (optimistic) setVisibleReport(optimistic);
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
        router.refresh();
      } catch (error) {
        if (optimistic) setVisibleReport(previous);
        toast.error(error instanceof Error ? error.message : "Learning action failed");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Brain className="size-5 text-primary" /> Assistant learning
          </CardTitle>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Reflection studies redacted, settled outcomes. One strong signal can create
            a provisional candidate, but two independent incidents, a passing eval,
            and admin approval are required before a lesson reaches the assistant.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(runAssistantReflectionNow, "Reflection completed")
          }
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Runs (30d)" value={String(visibleReport.traceMetrics.runs)} />
          <Metric label="Errors" value={String(visibleReport.traceMetrics.errors)} />
          <Metric
            label="Avg latency"
            value={`${(visibleReport.traceMetrics.avgLatencyMs / 1000).toFixed(1)}s`}
          />
          <Metric label="Trace cost" value={`$${visibleReport.traceMetrics.costUsd.toFixed(3)}`} />
        </div>
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Candidates</h3>
            <Badge variant="secondary">{candidates.length}</Badge>
          </div>
          {candidates.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No lesson candidates are awaiting review.
            </p>
          ) : (
            candidates.map((lesson) => {
              const cases = visibleReport.evalCases.filter(
                (testCase) => testCase.lessonId === lesson.id
              );
              return (
                <div key={lesson.id} className="space-y-3 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{lesson.scope}</Badge>
                    {lesson.toolName ? <Badge variant="outline">{lesson.toolName}</Badge> : null}
                    <Badge variant={lesson.evalStatus === "passed" ? "secondary" : "outline"}>
                      eval {lesson.evalStatus}
                    </Badge>
                    {lesson.evidenceCount < 2 ? (
                      <Badge variant="outline">waiting for corroboration</Badge>
                    ) : null}
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {lesson.evidenceCount} evidence · {(lesson.confidence * 100).toFixed(0)}%
                      confidence
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{lesson.key}</p>
                    <p className="text-sm">{lesson.lesson}</p>
                    {lesson.evidenceCount < 2 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        One independent incident was captured. This candidate remains inactive
                        until another incident supports the same lesson.
                      </p>
                    ) : null}
                  </div>
                  {cases.map((testCase) => (
                    <div key={testCase.id} className="rounded-md bg-muted/50 p-2 text-xs">
                      <p className="font-medium">Regression: {testCase.name}</p>
                      <p className="mt-1 text-muted-foreground">
                        {String(testCase.input.userMessage ?? "")}
                      </p>
                      {testCase.input.priorContext ? (
                        <p className="mt-1 text-muted-foreground">
                          Context: {String(testCase.input.priorContext)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                  {lesson.evalScore != null ? (
                    <p className="text-xs tabular-nums text-muted-foreground">
                      Champion {(Number(lesson.baselineScore ?? 0) * 100).toFixed(0)}% ·
                      challenger {(Number(lesson.evalScore) * 100).toFixed(0)}%
                    </p>
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending || cases.length === 0 || lesson.evidenceCount < 2}
                      onClick={() =>
                        run(() => runAssistantLessonEval(lesson.id), "Evaluation completed")
                      }
                    >
                      <FlaskConical className="size-4" /> Run 3-trial eval
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => rejectAssistantLesson(lesson.id),
                          "Lesson rejected",
                          (current) => ({
                            ...current,
                            lessons: current.lessons.filter(
                              (item) => item.id !== lesson.id
                            ),
                          })
                        )
                      }
                    >
                      <X className="size-4" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        pending ||
                        lesson.evidenceCount < 2 ||
                        lesson.evalStatus !== "passed"
                      }
                      onClick={() =>
                        run(
                          () => approveAssistantLesson(lesson.id),
                          "Lesson approved",
                          (current) => ({
                            ...current,
                            lessons: current.lessons.map((item) =>
                              item.id === lesson.id
                                ? { ...item, status: "approved", rolloutPercent: 10 }
                                : item
                            ),
                          })
                        )
                      }
                    >
                      <Check className="size-4" /> Approve
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </section>

        <section className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Active procedural lessons</h3>
            <Badge variant="secondary">{approved.length}</Badge>
          </div>
          {approved.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shared lessons are active.</p>
          ) : (
            approved.map((lesson) => (
              <div key={lesson.id} className="flex gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {lesson.key} · v{lesson.version} · {lesson.rolloutPercent}% rollout
                  </p>
                  <p className="text-sm">{lesson.lesson}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || lesson.rolloutPercent >= 100}
                  onClick={() =>
                    run(
                      () => promoteAssistantLesson(lesson.id),
                      "Lesson promoted",
                      (current) => ({
                        ...current,
                        lessons: current.lessons.map((item) =>
                          item.id === lesson.id
                            ? { ...item, rolloutPercent: 100 }
                            : item
                        ),
                      })
                    )
                  }
                >
                  Promote to 100%
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => rollbackAssistantLesson(lesson.id),
                      "Lesson rolled back",
                      (current) => ({
                        ...current,
                        lessons: current.lessons.filter(
                          (item) => item.id !== lesson.id
                        ),
                      })
                    )
                  }
                >
                  <RotateCcw className="size-4" /> Roll back
                </Button>
              </div>
            ))
          )}
        </section>

        <section className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Recent reflection runs</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visibleReport.runs.slice(0, 6).map((runRow) => (
              <div key={runRow.id} className="rounded-lg border p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline">{runRow.status}</Badge>
                  <span className="text-muted-foreground">
                    {new Date(runRow.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-2 tabular-nums text-muted-foreground">
                  {runRow.evidenceCount} evidence · {runRow.candidateCount} candidates
                </p>
                {Object.keys(runRow.evidenceBreakdown ?? {}).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(runRow.evidenceBreakdown ?? {}).map(
                      ([kind, count]) => (
                        <Badge key={kind} variant="secondary" className="font-normal">
                          {learningSignalLabel(kind)} {count}
                        </Badge>
                      )
                    )}
                  </div>
                ) : null}
                {runRow.decisionSummary ? (
                  <p className="mt-2 text-muted-foreground">{runRow.decisionSummary}</p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function learningSignalLabel(kind: string): string {
  return (
    {
      negative_feedback: "negative feedback",
      user_correction: "correction",
      policy_regression: "policy regression",
      inefficient_run: "inefficient run",
      tool_failure: "tool failure",
      declined_action: "declined action",
    }[kind] ?? kind.replaceAll("_", " ")
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
