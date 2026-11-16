"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";

import { createReportBuffer } from "@/lib/observability/performance-buffer";
import {
  observationForWebVital,
  routeCategoryForPath,
} from "@/lib/observability/performance-report";
import { usefulWork } from "@/lib/observability/useful-work";

const ENDPOINT = "/api/observability/performance";
const FLUSH_AFTER_MS = 10_000;

function send(body: string) {
  // Fire and forget. Reporting must never affect what the person is doing.
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
    cache: "no-store",
    credentials: "same-origin",
  }).catch(() => {});
}

const buffer = createReportBuffer(send);
const documentRoute = routeCategoryForPath(typeof window === "undefined" ? "/" : window.location.pathname);

// Stable reference: Next.js re-reports to a new callback.
// Reduce the measured navigation URL to a fixed category immediately. Entry
// objects (which describe page elements) are never touched or stored.
const handleWebVital: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  const observation = observationForWebVital(metric, documentRoute);
  if (observation) buffer.add(observation);
};

/**
 * Mounted only when the operator opts in with SASTRA_PERFORMANCE_MONITORING.
 * Sends anonymous numbers: Web Vitals plus the useful-work markers.
 */
export function PerformanceReporter() {
  useReportWebVitals(handleWebVital);

  useEffect(() => {
    let timer: number | null = null;
    const flush = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      buffer.flush();
    };
    const unsubscribe = usefulWork.subscribe((observation) => {
      if (buffer.add(observation) && timer === null) {
        timer = window.setTimeout(flush, FLUSH_AFTER_MS);
      }
    }, { replay: true });
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flush);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", flush);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
