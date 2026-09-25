"use client";

import * as React from "react";
import {
  animate,
  useMotionValue,
  useReducedMotion,
  useTransform,
  motion,
} from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

function formatValue(
  raw: number,
  format: "number" | "currency",
  currency: string,
  decimals: number,
) {
  if (format === "currency") {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: decimals,
    }).format(raw);
  }
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(raw);
}

/**
 * Animates only when an already-rendered value changes. Initial page loads show
 * canonical data immediately, so recurring work surfaces never count up from 0.
 */
export function AnimatedNumber({
  value,
  duration = 0.22,
  format = "number",
  currency = "USD",
  decimals = 0,
  className,
}: {
  value: number;
  duration?: number;
  format?: "number" | "currency";
  currency?: string;
  decimals?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const previous = React.useRef(value);
  const display = useTransform(mv, (v) =>
    formatValue(v, format, currency, decimals),
  );

  React.useEffect(() => {
    if (reduce || previous.current === value) {
      mv.set(value);
      previous.current = value;
      return;
    }
    const controls = animate(mv, value, { duration, ease: EASE });
    previous.current = value;
    return () => controls.stop();
  }, [value, reduce, duration, mv]);

  return (
    <motion.span ref={ref} className={className}>
      {display}
    </motion.span>
  );
}
