import { cn } from "@/lib/utils";

/**
 * A progress bar that renders its initial value immediately and animates later
 * value changes. The fill is full width and slides with `transform`, so a
 * change never triggers layout and the transition runs off the main thread.
 * The global reduced-motion rule makes the update instant.
 */
export function AnimatedBar({
  value,
  className,
  trackClassName,
  delay = 0,
}: {
  /** Fill percentage, 0–100. */
  value: number;
  /** Classes for the fill element (color, rounding, height). */
  className?: string;
  /** Classes for the track element. */
  trackClassName?: string;
  /** Seconds to wait before a value change animates. */
  delay?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-secondary",
        trackClassName,
      )}
    >
      <div
        className={cn(
          "h-full w-full rounded-full bg-success transition-transform duration-[220ms] ease-settle",
          className,
        )}
        style={{
          transform: `translateX(${pct - 100}%)`,
          transitionDelay: delay ? `${delay}s` : undefined,
        }}
      />
    </div>
  );
}
