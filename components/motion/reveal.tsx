import * as React from "react";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Accepted for compatibility; content no longer animates in. */
  delay?: number;
  /** Accepted for compatibility; content no longer animates in. */
  y?: number;
  /** Accepted for compatibility; content no longer animates in. */
  inView?: boolean;
};

/**
 * Compatibility wrappers for surfaces that previously used page-load reveals.
 * Content is visible immediately; meaningful state changes own the motion.
 * They render plain elements so they add no client JavaScript.
 */
export function Reveal({ children, className }: RevealProps) {
  return <div className={className}>{children}</div>;
}

export function StaggerGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
  delayChildren?: number;
  inView?: boolean;
}) {
  return <div className={className}>{children}</div>;
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}
