import { cn } from "@/lib/utils";

/**
 * A check mark that draws itself once when it appears. Use it for the moment
 * an action is confirmed (a sent email, a finished step), not for states that
 * are simply shown as done on page load.
 */
export function DoneCheck({
  className,
  animate = true,
}: {
  className?: string;
  /** False shows the same check with no motion, for states that were already done. */
  animate?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-4 shrink-0", animate && "done-check", className)}
    >
      <path d="M3.25 8.5 6.5 11.75 12.75 4.75" pathLength={1} />
    </svg>
  );
}
