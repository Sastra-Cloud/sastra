import { AlertTriangle } from "lucide-react";

import { formatDate } from "@/lib/format";
import { computeOverdue, type OverdueInput } from "@/lib/projects/overdue";
import { HelpTip } from "@/components/ui/help-tip";

/**
 * Explains WHY a project is overdue, shown alongside the header "Overdue Nd"
 * badge. Renders nothing unless the due date has passed and the project isn't
 * completed/cancelled. Uses only data already loaded on the overview page.
 */
export function OverdueReasonCard(props: OverdueInput) {
  const summary = computeOverdue(props);
  if (!summary) return null;
  const { daysOverdue, allDone, reasons } = summary;
  const { dueDate } = props;

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-destructive">
        <AlertTriangle className="size-4" />
        Overdue by {daysOverdue} day{daysOverdue === 1 ? "" : "s"}
        <HelpTip title="Why is this overdue?" side="bottom" align="start">
          A project is overdue once its due date has passed and it hasn&apos;t been
          marked complete. Update the due date in Project settings if the timeline
          changed, or mark the project complete when the work is finished.
        </HelpTip>
      </div>
      <p className="mb-2 text-sm text-muted-foreground">
        Due {dueDate ? formatDate(dueDate) : "date"} passed — this project isn&apos;t
        marked complete.
      </p>
      <ul className="space-y-1">
        {reasons.map((r) => (
          <li key={r} className="flex items-start gap-2 text-sm">
            <span
              className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-destructive"
              aria-hidden
            />
            {r}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        {allDone
          ? "Use “Mark complete” at the top to clear this, or adjust the due date in Project settings."
          : "Adjust the due date in Project settings, or mark the project complete when finished."}
      </p>
    </div>
  );
}
