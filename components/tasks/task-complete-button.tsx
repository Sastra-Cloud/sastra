"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, Circle } from "lucide-react";

import { cn } from "@/lib/utils";

// House ease + a crisp spring for the check "pop".
const EASE = [0.22, 1, 0.36, 1] as const;
const POP = { type: "spring", stiffness: 420, damping: 24, mass: 0.6 } as const;

/**
 * The round complete/reopen control for a task. Completing a task plays a quiet
 * "wax-seal" celebration: the circle springs into a green check while a single
 * success-green ring pulses outward once and fades. Reduced-motion users get an
 * instant check with no ring.
 *
 * The celebration is self-contained and fires on click, so it works whether the
 * surrounding list moves the row (Focus lists) or removes it (dashboard lists) —
 * the row's own exit animation gives the seal a beat to read. The real mutation
 * runs immediately in `onToggle`; the animation never delays it.
 */
export function TaskCompleteButton({
  done,
  onToggle,
  title,
  disabled,
  className,
  hoverPreview = false,
}: {
  done: boolean;
  onToggle: () => void;
  title: string;
  disabled?: boolean;
  /** Surface-specific classes: size, rounding, and hover colors. */
  className?: string;
  /** Preview the check on hover/focus while the task is still open. */
  hoverPreview?: boolean;
}) {
  const reduce = useReducedMotion();
  const [sealing, setSealing] = React.useState(false);
  const showCheck = done || sealing;

  const handleClick = () => {
    // Only celebrate when completing, and never fight reduced motion.
    if (!done && !reduce) setSealing(true);
    onToggle();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={done ? `Reopen ${title}` : `Complete ${title}`}
      className={cn("group/complete relative", className)}
    >
      <AnimatePresence>
        {sealing ? (
          <motion.span
            key="seal"
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-success"
            initial={{ scale: 0.55, opacity: 0.5 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            onAnimationComplete={() => setSealing(false)}
          />
        ) : null}
      </AnimatePresence>

      {showCheck ? (
        <motion.span
          className="text-success"
          initial={reduce ? false : { scale: 0.5 }}
          animate={{ scale: 1 }}
          transition={POP}
        >
          <CheckCircle2 className="size-5" />
        </motion.span>
      ) : hoverPreview ? (
        <>
          <Circle className="size-5 group-hover/complete:hidden group-focus-visible/complete:hidden" />
          <CheckCircle2 className="hidden size-5 group-hover/complete:block group-focus-visible/complete:block" />
        </>
      ) : (
        <Circle className="size-5" />
      )}
    </button>
  );
}
