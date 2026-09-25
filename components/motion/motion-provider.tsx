"use client";

import { MotionConfig } from "motion/react";

/**
 * App-wide Motion configuration. `reducedMotion="user"` makes every Motion
 * animation honor the OS "reduce motion" setting — transforms/layout shifts are
 * skipped while opacity/color still cross-fade. Complements the CSS
 * `prefers-reduced-motion` reset in globals.css.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}