type WorkTask = { id: string; title: string; status: string; assignedTo: string | null; phaseId: string | null; dueDate: string | null };
type Stage = { id: string; name: string };
type Dependency = { taskId: string; blockedByStatus: string };

/** Describe saved work, preserving parallel stages and dependency status. */
export function summarizeCurrentWork<T extends WorkTask>(tasks: T[], stages: Stage[], viewerId: string, dependencies: Dependency[]) {
  const open = tasks.filter(task => task.status !== "done");
  const started = open.filter(task => task.status === "in_progress" || task.status === "review");
  const blockedIds = new Set(dependencies.filter(edge => edge.blockedByStatus !== "done").map(edge => edge.taskId));
  const ranked = [...open].sort((a, b) => {
    const rank = (task: T) => (task.assignedTo === viewerId ? 0 : 8) + (blockedIds.has(task.id) ? 4 : 0) + (["in_progress", "review"].includes(task.status) ? 0 : 1);
    return rank(a) - rank(b) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.id.localeCompare(b.id);
  });
  const visibleStages = new Set((started.length ? started : open).map(task => task.phaseId));
  const nextTask = ranked[0] ?? null;
  return { stageNames: stages.filter(stage => visibleStages.has(stage.id)).map(stage => stage.name), started: started.length > 0, nextTask, blocked: nextTask ? blockedIds.has(nextTask.id) : false };
}
