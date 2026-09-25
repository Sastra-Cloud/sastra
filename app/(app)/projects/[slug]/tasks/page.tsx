import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles, Table2 } from "lucide-react";

import { getSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import {
  getProjectBySlug,
  listAssignableUsers,
  listProjects,
} from "@/lib/projects/queries";
import { listPrintRuns } from "@/lib/print/queries";
import {
  getProjectDependencyEdges,
  getProjectTasks,
  listRecurringTasks,
} from "@/lib/tasks/queries";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TaskBoard } from "@/components/tasks/task-board";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { RecurringList } from "@/components/tasks/recurring-list";
import { cn } from "@/lib/utils";
import { projectUnitTerms } from "@/lib/projects/kinds";
import { projectOptionLabel } from "@/lib/projects/visibility";

export const dynamic = "force-dynamic";

export default async function ProjectTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ run?: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const data = await getProjectBySlug(slug);
  if (!data) notFound();

  const printRuns = await listPrintRuns(data.project.id);
  const requestedRun =
    typeof query.run === "string" && query.run !== "all" ? query.run : null;
  const activeReprint =
    printRuns.find(
      (run) =>
        run.kind === "reprint" &&
        run.status !== "completed" &&
        run.status !== "cancelled"
    ) ?? null;
  const selectedRun =
    requestedRun
      ? printRuns.find((run) => run.id === requestedRun) ?? activeReprint
      : query.run === "all"
        ? null
        : activeReprint;
  const selectedRunId = selectedRun?.id;

  const [taskRows, users, projects, edges, recurring] = await Promise.all([
    getProjectTasks(data.project.id, selectedRunId),
    listAssignableUsers(),
    listProjects(),
    getProjectDependencyEdges(data.project.id),
    listRecurringTasks(data.project.id),
  ]);

  const depsByTask: Record<string, string[]> = {};
  const blockedTaskIds: string[] = [];
  for (const e of edges) {
    (depsByTask[e.taskId] ??= []).push(e.dependsOnTaskId);
    if (e.blockedByStatus !== "done" && !blockedTaskIds.includes(e.taskId)) {
      blockedTaskIds.push(e.taskId);
    }
  }

  const session = await getSession();
  const isManager =
    can(session?.user ?? null, "tasks.manage");
  const generateHref = `/projects/${slug}/tasks/generate`;
  const unitTerms = projectUnitTerms(data.project.kind);

  if (taskRows.length === 0 && recurring.length === 0 && isManager) {
    return (
      <div className="space-y-4">
        <TaskScopeNav
          slug={slug}
          runs={printRuns.map((run) => ({
            id: run.id,
            title: run.title,
            kind: run.kind,
            printNumber: run.printNumber,
            status: run.status,
          }))}
          selectedRunId={selectedRunId ?? null}
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Sparkles className="size-8 text-info" />
            <div>
              <p className="font-medium">
                {selectedRun ? "No reprint tasks yet" : "No tasks yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {selectedRun
                  ? "Add reprint-specific tasks or start a new reprint from the Print tab to generate the default checklist."
                  : `Let AI build the production pipeline — ${unitTerms.plural} × coordinator stages, with due dates and assignees. Or add a single task yourself.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {!selectedRun ? (
                <Link href={generateHref} className={buttonVariants()}>
                  <Sparkles className="size-4" />
                  Set up task plan with AI
                </Link>
              ) : null}
              <CreateTaskDialog
                projectId={data.project.id}
                printRunId={selectedRunId ?? null}
                projectDriveFolderId={data.project.driveFolderId}
                phases={data.phases.map((p) => ({ id: p.id, name: p.name }))}
                assignees={users.map((u) => ({ id: u.id, name: u.name }))}
                triggerLabel="Add task"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TaskScopeNav
        slug={slug}
        runs={printRuns.map((run) => ({
          id: run.id,
          title: run.title,
          kind: run.kind,
          printNumber: run.printNumber,
          status: run.status,
        }))}
        selectedRunId={selectedRunId ?? null}
      />
      <div className="flex justify-end gap-2">
        <Link
          href={`/projects/${slug}/tasks/pipeline`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Table2 className="size-4" />
          Pipeline view
        </Link>
        {isManager ? (
          <Link
            href={generateHref}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Sparkles className="size-4" />
            Set up task plan with AI
          </Link>
        ) : null}
      </div>
      <TaskBoard
        tasks={taskRows}
        projectId={data.project.id}
        printRunId={selectedRunId ?? null}
        projectDriveFolderId={data.project.driveFolderId}
        phases={data.phases.map((p) => ({ id: p.id, name: p.name }))}
        assignees={users.map((u) => ({ id: u.id, name: u.name }))}
        projects={projects.map((project) => ({
          id: project.id,
          name: projectOptionLabel(project),
        }))}
        depsByTask={depsByTask}
        blockedTaskIds={blockedTaskIds}
        currentUserId={session?.user.id ?? ""}
        canManage={isManager}
      />
      {!selectedRunId ? (
        <RecurringList
          rules={recurring}
          assignees={users.map((user) => ({ id: user.id, name: user.name }))}
          canManage={isManager}
        />
      ) : null}
    </div>
  );
}

function TaskScopeNav({
  slug,
  runs,
  selectedRunId,
}: {
  slug: string;
  runs: {
    id: string;
    title: string;
    kind: string;
    printNumber: number | null;
    status: string;
  }[];
  selectedRunId: string | null;
}) {
  if (runs.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">Task scope</p>
        <p className="text-xs text-muted-foreground">
          Focus the board on the active reprint or view the full title history.
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        <Link
          href={`/projects/${slug}/tasks?run=all`}
          className={cn(
            buttonVariants({
              variant: selectedRunId ? "outline" : "default",
              size: "sm",
            })
          )}
        >
          Project total
        </Link>
        {runs.map((run) => (
          <Link
            key={run.id}
            href={`/projects/${slug}/tasks?run=${run.id}`}
            className={cn(
              buttonVariants({
                variant: selectedRunId === run.id ? "default" : "outline",
                size: "sm",
              }),
              "max-w-full"
            )}
          >
            <span className="truncate">
              {run.kind === "reprint"
                ? `Reprint ${run.printNumber ?? ""}`.trim()
                : run.title}
            </span>
            {run.kind === "reprint" && run.status !== "completed" ? (
              <Badge variant="secondary" className="ml-1">
                {run.status.replaceAll("_", " ")}
              </Badge>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
