"use client";

import * as React from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Seconds to wait before animating. Use to cascade sibling blocks. */
  delay?: number;
  /** Pixels to travel upward into place. */
  y?: number;
  /** Trigger when scrolled into view instead of immediately on mount. */
  inView?: boolean;
};

/**
 * Compatibility wrapper for surfaces that previously used page-load reveals.
 * Content is visible immediately; meaningful state changes own the motion.
 */
export function Reveal({
  children,
  className,
}: RevealProps) {
  return <motion.div className={className}>{children}</motion.div>;
}

/**
 * Orchestrates a staggered cascade across its `StaggerItem` children. Drop it in
 * place of a grid/list wrapper; each child reveals slightly after the last.
 */
export function StaggerGroup({
  children,
  className,
  delayChildren = 0.05,
  inView = false,
}: {
  children: React.ReactNode;
  className?: string;
  delayChildren?: number;
  inView?: boolean;
}) {
  return (
    <motion.div className={className} data-stagger-delay={delayChildren} data-in-view={inView || undefined}>
      {children}
    </motion.div>
  );
}

/** A single cell inside a `StaggerGroup`. */
export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={cn(className)}>
      {children}
    </motion.div>
  );
}
