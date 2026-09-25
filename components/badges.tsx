import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const PROJECT_STATUS: Record<
  string,
  { label: string; className: string }
> = {
  proposal: { label: "Proposal", className: "bg-accent text-accent-foreground" },
  planning: { label: "Planning", className: "bg-secondary text-secondary-foreground" },
  active: { label: "Active", className: "bg-info text-info-foreground" },
  on_hold: { label: "On hold", className: "bg-warning text-warning-foreground" },
  completed: { label: "Completed", className: "bg-success text-success-foreground" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

export const PRIORITY: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-secondary text-secondary-foreground" },
  medium: { label: "Medium", className: "bg-secondary text-secondary-foreground" },
  high: { label: "High", className: "bg-warning text-warning-foreground" },
  urgent: { label: "Urgent", className: "bg-destructive text-destructive-foreground" },
};

export const TASK_STATUS: Record<
  string,
  { label: string; className: string }
> = {
  todo: { label: "To do", className: "bg-secondary text-secondary-foreground" },
  in_progress: { label: "In progress", className: "bg-info text-info-foreground" },
  review: { label: "Review", className: "bg-warning text-warning-foreground" },
  done: { label: "Done", className: "bg-success text-success-foreground" },
};

/** Ordered task-status columns for the board. */
export const TASK_STATUS_ORDER = ["todo", "in_progress", "review", "done"] as const;

/** Project health (RAG) — single source of truth for dot color + label. */
export const HEALTH: Record<string, { label: string; dot: string }> = {
  red: { label: "At risk", dot: "bg-destructive" },
  amber: { label: "Needs attention", dot: "bg-warning" },
  green: { label: "On track", dot: "bg-success" },
};

/** A small RAG status dot whose accessible name carries the meaning (not color alone). */
export function HealthDot({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const h = status ? HEALTH[status] : undefined;
  return (
    <span
      aria-label={h ? h.label : "No health data"}
      title={h ? h.label : "No health data"}
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full",
        h ? h.dot : "bg-muted",
        className
      )}
    />
  );
}

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const c = PROJECT_STATUS[status] ?? PROJECT_STATUS.planning;
  return <Badge className={cn(c.className, className)}>{c.label}</Badge>;
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: string;
  className?: string;
}) {
  const c = PRIORITY[priority] ?? PRIORITY.medium;
  return (
    <Badge variant="outline" className={cn(c.className, "border-transparent", className)}>
      {c.label}
    </Badge>
  );
}

export function TaskStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const c = TASK_STATUS[status] ?? TASK_STATUS.todo;
  return <Badge className={cn(c.className, className)}>{c.label}</Badge>;
}
