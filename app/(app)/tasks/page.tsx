import { BriefcaseBusiness } from "lucide-react";
import { fromZonedTime } from "date-fns-tz";

import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { agendaToday, getAgendaItems } from "@/lib/agenda/queries";
import { listAssignableUsers, listProjects } from "@/lib/projects/queries";
import { getMyWorkTasks, getOpenTaskBlockers } from "@/lib/tasks/queries";
import { normalizeMyWorkView } from "@/lib/tasks/my-work";
import { getActiveTimer, getUserTrackedSeconds } from "@/lib/tasks/time-queries";
import { isAutoStartEnabled } from "@/lib/tasks/time-service";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { MyWorkHub } from "@/components/tasks/my-work-hub";
import { listPendingEmailTaskSuggestionsForUser } from "@/lib/email/task-suggestions";
import { listEmailTaskRulesForUser } from "@/lib/email/task-rule-queries";
import { projectOptionLabel } from "@/lib/projects/visibility";
import {
  externalFollowUpEffectiveDueAt,
  listMyExternalFollowUps,
} from "@/lib/email/follow-ups";

export const metadata = { title: "My Work" };
export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string | string[] | undefined;
    task?: string | string[] | undefined;
    emailSuggestion?: string | string[] | undefined;
  }>;
}) {
  const [{ user }, query] = await Promise.all([requireUser(), searchParams]);
  const canManage = can(user, "tasks.manage");
  const workspacePromise = getWorkspaceSettings();
  const trackedTodayPromise = workspacePromise.then((workspace) => {
    const today = agendaToday(new Date(), workspace.timezone);
    const start = fromZonedTime(`${today}T00:00:00`, workspace.timezone);
    return getUserTrackedSeconds(user.id, start);
  });

  const [
    myTasks,
    users,
    projects,
    agendaItems,
    blockers,
    activeTimer,
    workspace,
    trackedTodaySeconds,
    autoStartTimer,
    emailTaskSuggestions,
    emailTaskRules,
    externalFollowUps,
  ] = await Promise.all([
    getMyWorkTasks(user.id),
    listAssignableUsers(),
    listProjects(),
    getAgendaItems({ userId: user.id, role: user.role as string }),
    getOpenTaskBlockers(),
    getActiveTimer(user.id),
    workspacePromise,
    trackedTodayPromise,
    isAutoStartEnabled(user.id),
    listPendingEmailTaskSuggestionsForUser(user.id),
    listEmailTaskRulesForUser(user.id),
    canManage ? listMyExternalFollowUps(user.id) : Promise.resolve([]),
  ]);

  const requestedView = typeof query.view === "string" ? query.view : null;
  const initialView = normalizeMyWorkView(requestedView);
  const initialTaskId = typeof query.task === "string" ? query.task : null;
  const initialEmailSuggestionId =
    typeof query.emailSuggestion === "string" ? query.emailSuggestion : null;
  const blockedByTaskId = Object.fromEntries(
    myTasks.flatMap((task) => {
      const blocker = blockers.get(task.id);
      return blocker ? [[task.id, blocker.blockedByTitle]] : [];
    })
  );
  const followUpNow = new Date().getTime();

  return (
    <div className="w-full space-y-6">
      <div className="surface-shadow flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <BriefcaseBusiness className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              My Work
            </h1>
            <p className="text-muted-foreground">
              Focus on today, move work through the board, or review every deadline.
            </p>
          </div>
        </div>
      </div>

      <MyWorkHub
        initialTasks={myTasks}
        agendaItems={agendaItems}
        todayIso={agendaToday(new Date(), workspace.timezone)}
        timeZone={workspace.timezone}
        trackedTodaySeconds={trackedTodaySeconds}
        initialActiveTimer={activeTimer}
        autoStartTimer={autoStartTimer}
        assignees={users.map((item) => ({ id: item.id, name: item.name }))}
        projects={projects.map((project) => ({
          id: project.id,
          name: projectOptionLabel(project),
        }))}
        currentUserId={user.id}
        canManage={canManage}
        blockedByTaskId={blockedByTaskId}
        initialView={initialView}
        initialTaskId={initialTaskId}
        initialEmailSuggestions={emailTaskSuggestions}
        initialEmailSuggestionId={initialEmailSuggestionId}
        initialEmailTaskRules={emailTaskRules}
        initialExternalFollowUps={externalFollowUps.filter(
          (item) => externalFollowUpEffectiveDueAt(item).getTime() <= followUpNow
        )}
      />
    </div>
  );
}
