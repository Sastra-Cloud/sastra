"use client";

import { useEffect } from "react";

import type { UsefulWorkName } from "@/lib/observability/performance-report";
import { observeVisibleElement, usefulWork } from "@/lib/observability/useful-work";

/**
 * Marks when a screen's main content is usable.
 *
 * - `ready` runs after hydration, when this component's handlers exist.
 * - `visible` (optional) follows the browser's own paint timing for the
 *   element tagged `elementtiming="<element>"`, so it can precede `ready`.
 *
 * Work recorded for a navigation that has since been replaced is discarded.
 * `scope` re-arms the markers when the same component shows other content.
 */
export function useUsefulWork({
  active = true,
  scope,
  ready,
  visible,
}: {
  active?: boolean;
  scope?: string;
  ready?: UsefulWorkName;
  visible?: { name: UsefulWorkName; element: string };
}) {
  const visibleName = visible?.name;
  const visibleElement = visible?.element;
  useEffect(() => {
    if (!active) return;
    const navigation = usefulWork.current();
    if (!navigation) return;
    if (ready) usefulWork.report(ready, { epoch: navigation.epoch });
    if (!visibleName || !visibleElement) return;
    return observeVisibleElement(visibleName, visibleElement, navigation.epoch);
  }, [active, scope, ready, visibleName, visibleElement]);
}

/**
 * Tags an element so the browser reports when it first paints (Element
 * Timing). Spread it onto the element that carries the content's text.
 */
export function elementTiming(element: string): Record<string, string> {
  return { elementtiming: element };
}
