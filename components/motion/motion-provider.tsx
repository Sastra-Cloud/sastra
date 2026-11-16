"use client";

import { MotionConfig } from "motion/react";

/**
 * Motion configuration. `reducedMotion="user"` makes Motion animations honor
 * the OS "reduce motion" setting — transforms/layout shifts are skipped while
 * opacity/color still cross-fade. Complements the CSS `prefers-reduced-motion`
 * rule in globals.css.
 *
 * Wrap the part of a screen that uses Motion, not the whole app: a provider in
 * the root layout makes every page download the Motion library.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}