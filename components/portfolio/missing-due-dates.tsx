"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarCheck2, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { HealthDot, ProjectStatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { setProjectDueDate } from "@/lib/schedule/actions";
import { cn } from "@/lib/utils";

export type MissingDueDateProject = {
  id: string;
  slug: string;
  title: string;
  status: string;
  healthStatus: string | null;
};

export function MissingDueDates({
  projects,
}: {
  projects: MissingDueDateProject[];
}) {
  const router = useRouter();
  const [dates, setDates] = useState<Record<string, string>>({});
  const { state, isPending, run } = useOptimisticAction<
    MissingDueDateProject[],
    { id: string; dueDate: string }
  >({
    state: projects,
    // Once a date is saved the project leaves this list — drop it immediately.
    update: (items, input) => items.filter((p) => p.id !== input.id),
    getKey: (input) => input.id,
  });

  function save(project: MissingDueDateProject) {
    const dueDate = dates[project.id];
    if (!dueDate) return;
    run(
      { id: project.id, dueDate },
      () => setProjectDueDate(project.id, dueDate),
      {
        errorMessage: "Could not set the due date.",
        onSuccess: () => {
          setDates((prev) => {
            const next = { ...prev };
            delete next[project.id];
            return next;
          });
          toast.success(`Due date set for “${project.title}”`);
          router.refresh();
        },
      }
    );
  }

  if (state.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-xl border bg-card px-4 py-8 text-sm">
        <CalendarCheck2 className="mt-0.5 size-5 shrink-0 text-success" />
        <div>
          <p className="font-medium">Every project has a target completion date.</p>
          <p className="text-muted-foreground">
            New projects without a due date will show up here so they don&apos;t
            slip through the portfolio.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {state.map((project) => {
        const pending = isPending(project.id);
        const chosen = dates[project.id] ?? "";
        return (
          <li
            key={project.id}
            className={cn(
              "flex flex-col gap-3 p-4 transition-opacity sm:flex-row sm:items-center sm:justify-between sm:gap-4",
              pending && "opacity-60"
            )}
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="mt-0.5 shrink-0">
                <HealthDot status={project.healthStatus} />
              </span>
              <div className="min-w-0">
                <Link
                  href={`/projects/${project.slug}`}
                  className="font-medium text-pretty hover:underline"
                >
                  {project.title}
                </Link>
                <div className="mt-1 flex items-center gap-2">
                  <ProjectStatusBadge status={project.status} />
                  <Link
                    href={`/projects/${project.slug}`}
                    className="inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
                  >
                    Open project
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            </div>

            <form
              className="flex shrink-0 items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                save(project);
              }}
            >
              <label htmlFor={`due-${project.id}`} className="sr-only">
                Due date for {project.title}
              </label>
              <Input
                id={`due-${project.id}`}
                type="date"
                value={chosen}
                disabled={pending}
                onChange={(event) =>
                  setDates((prev) => ({ ...prev, [project.id]: event.target.value }))
                }
                className="w-40"
              />
              <Button type="submit" size="sm" disabled={pending || !chosen}>
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Set date
              </Button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
