"use client";

import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * A progress bar that renders its initial value immediately and animates later
 * value changes. Reduced-motion users get an instant update.
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
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-secondary",
        trackClassName,
      )}
    >
      <motion.div
        className={cn("h-full rounded-full bg-success", className)}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ duration: reduce ? 0 : 0.22, ease: EASE, delay: reduce ? 0 : delay }}
      />
    </div>
  );
}
