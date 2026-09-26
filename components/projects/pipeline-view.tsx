import Link from "next/link";
import type { PipelineData, TaskRow } from "@/lib/tasks/queries";
import { cn } from "@/lib/utils";

const STATUS_CELL: Record<string, string> = {
  done: "bg-success/15 text-success",
  in_progress: "bg-info/15 text-info",
  review: "bg-warning/15 text-warning-text",
  todo: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
  done: "Done",
  in_progress: "In progress",
  review: "Review",
  todo: "To do",
};

function firstName(name: string | null): string {
  return name ? name.split(/\s+/)[0] : "—";
}

/** Unit × stage matrix: rows are chapters/articles/episodes, columns are stages. */
export function PipelineView({
  data,
  projectSlug,
  unitLabel = "unit",
}: {
  data: PipelineData;
  projectSlug: string;
  unitLabel?: string;
}) {
  // Only stages that actually have per-unit cells.
  const cellPhaseIds = new Set(data.cells.map((c) => c.phaseId));
  const stages = data.phases.filter((p) => cellPhaseIds.has(p.id));

  if (data.units.length === 0 || stages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No per-{unitLabel} pipeline yet. A manager can add a task plan with per-{unitLabel}{" "}
        stages to show progress here.
      </p>
    );
  }

  // (unitId, phaseId) -> task
  const cellByKey = new Map<string, TaskRow>();
  for (const c of data.cells) {
    if (c.unitId && c.phaseId) cellByKey.set(`${c.unitId}:${c.phaseId}`, c);
  }

  const totalCells = data.cells.length;
  const doneCells = data.cells.filter((c) => c.status === "done").length;
  const pct = totalCells ? Math.round((doneCells / totalCells) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold">Pipeline</h2>
        <span className="text-sm text-muted-foreground">
          {doneCells}/{totalCells} stage-tasks done · {pct}%
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left font-medium">
                {unitLabel[0].toUpperCase() + unitLabel.slice(1)}
              </th>
              {stages.map((s) => (
                <th
                  key={s.id}
                  className="min-w-28 px-2 py-2 text-left font-medium whitespace-nowrap"
                >
                  {s.name}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Done</th>
            </tr>
          </thead>
          <tbody>
            {data.units.map((u) => {
              const rowCells = stages.map((s) => cellByKey.get(`${u.id}:${s.id}`));
              const present = rowCells.filter(Boolean) as TaskRow[];
              const rowDone = present.filter((c) => c.status === "done").length;
              return (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5 font-medium whitespace-nowrap">
                    {u.name}
                  </td>
                  {stages.map((s) => {
                    const cell = cellByKey.get(`${u.id}:${s.id}`);
                    if (!cell)
                      return <td key={s.id} className="px-2 py-1.5 text-center text-muted-foreground/40">·</td>;
                    return (
                      <td key={s.id} className="px-1.5 py-1.5">
                        <Link
                          href={`/projects/${projectSlug}/tasks?task=${cell.id}`}
                          aria-label={`${u.name}: ${s.name}, ${STATUS_LABEL[cell.status] ?? cell.status}. Open task`}
                          className={cn(
                            "block min-h-11 rounded px-1.5 py-1 text-xs leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            STATUS_CELL[cell.status] ?? STATUS_CELL.todo
                          )}
                          title={`${STATUS_LABEL[cell.status] ?? cell.status}${cell.dueDate ? ` · due ${cell.dueDate}` : ""}`}
                        >
                          <span className="block font-medium">{STATUS_LABEL[cell.status] ?? cell.status}</span>
                          <div className="truncate font-medium">
                            {firstName(cell.assigneeName)}
                          </div>
                          {cell.dueDate ? (
                            <div className="tabular-nums opacity-70">{cell.dueDate}</div>
                          ) : null}
                        </Link>
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {rowDone}/{present.length}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
