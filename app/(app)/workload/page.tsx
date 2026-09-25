import { requireRole } from "@/lib/auth/guards";
import {
  getOpenAssignedTasks,
  getOpenTaskBlockers,
  getTeamLoad,
  type MyTaskRow,
} from "@/lib/tasks/queries";
import { listAssignableUsers } from "@/lib/projects/queries";
import { getStandupView } from "@/lib/standup/view-queries";
import { WorkloadView } from "@/components/workload/workload-view";
import type {
  WorkloadPerson,
  WorkloadTask,
} from "@/components/workload/workload-board";

export const metadata = { title: "Workload" };
export const dynamic = "force-dynamic";

const RISK_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

export default async function WorkloadPage() {
  const { user } = await requireRole("manager");
  const [tasks, users, teamLoad, blockers, standupView] = await Promise.all([
    getOpenAssignedTasks(),
    listAssignableUsers(),
    getTeamLoad(),
    getOpenTaskBlockers(),
    getStandupView(),
  ]);

  // Highest standup stuck-risk per person (name-keyed, like Overview's People-at-risk).
  const riskByName = new Map<string, { stuckRisk: "medium" | "high"; top: string | null }>();
  for (const s of standupView) {
    if (!s.report) continue;
    for (const p of s.report.people) {
      if ((RISK_RANK[p.stuckRisk] ?? 0) < 1) continue; // only medium/high
      const cur = riskByName.get(p.userName);
      if (!cur || (RISK_RANK[p.stuckRisk] ?? 0) > (RISK_RANK[cur.stuckRisk] ?? 0)) {
        riskByName.set(p.userName, {
          stuckRisk: p.stuckRisk as "medium" | "high",
          top: p.impediments[0] ?? null,
        });
      }
    }
  }

  // Group open tasks by assignee.
  const tasksByUser = new Map<string, WorkloadTask[]>();
  for (const t of tasks) {
    if (!t.assignedTo) continue;
    const wt: WorkloadTask = {
      id: t.id,
      title: t.title,
      projectTitle: t.projectTitle,
      unitName: t.unitName,
      dueDate: t.dueDate,
      priority: t.priority,
      status: t.status,
      updatedAt: t.updatedAt,
      estimateHours: t.estimateHours,
      driveFileCount: t.driveFileCount,
      driveFileName: t.driveFileName,
      driveFileUrl: t.driveFileUrl,
      blockedBy: blockers.get(t.id)?.blockedByTitle ?? null,
    };
    const list = tasksByUser.get(t.assignedTo) ?? [];
    list.push(wt);
    tasksByUser.set(t.assignedTo, list);
  }

  // One card per active member (from teamLoad) so anyone is a reassignment target.
  const people: WorkloadPerson[] = teamLoad
    .map((p) => {
      const risk = riskByName.get(p.name);
      return {
        userId: p.userId,
        userName: p.name,
        tasks: tasksByUser.get(p.userId) ?? [],
        weeklyHours: p.weeklyHours,
        estHours: p.estHours,
        open: p.open,
        overdue: p.overdue,
        soon: p.soon,
        trackedSeconds: p.trackedSeconds,
        stuckRisk: risk?.stuckRisk ?? null,
        topImpediment: risk?.top ?? null,
      };
    })
    // Heaviest first; empty (0-task) members drop to the bottom as targets.
    .sort((a, b) => b.open - a.open || a.userName.localeCompare(b.userName));

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Workload
          </h1>
          <p className="text-muted-foreground">
            Who&apos;s loaded and who&apos;s behind. Reorder a person&apos;s queue, or
            drag a task onto someone else to reassign it.
          </p>
        </div>
        <a
          href="/api/reports/time"
          className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted/40"
          download
        >
          Export time report (.xlsx)
        </a>
      </div>
      <WorkloadView
        people={people}
        tasks={tasks as MyTaskRow[]}
        assignees={users.map((u) => ({ id: u.id, name: u.name }))}
        currentUserId={user.id}
      />
    </div>
  );
}
