"use client";

import dynamic from "next/dynamic";

// The charting library is large. The total renders at once; the ring loads on
// demand so the page is usable before the chart code arrives.
const RagDonutChart = dynamic(
  () => import("./rag-donut-chart").then((module) => module.RagDonutChart),
  { ssr: false }
);

const COLORS: Record<string, string> = {
  green: "var(--success)",
  amber: "var(--warning)",
  red: "var(--destructive)",
};

/** Donut of project health (RAG) counts with the total in the center. */
export function RagDonut({
  red,
  amber,
  green,
  size = 132,
}: {
  red: number;
  amber: number;
  green: number;
  size?: number;
}) {
  const total = red + amber + green;
  const data = [
    { key: "green", label: "On track", value: green },
    { key: "amber", label: "Needs attention", value: amber },
    { key: "red", label: "At risk", value: red },
  ]
    .filter((d) => d.value > 0)
    .map((d) => ({ ...d, fill: COLORS[d.key] }));

  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-full border border-dashed text-xs text-muted-foreground"
        style={{ width: size, height: size }}
      >
        No projects
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <RagDonutChart data={data} />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums">{total}</span>
        <span className="text-xs text-muted-foreground">projects</span>
      </div>
    </div>
  );
}
