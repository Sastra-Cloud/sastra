"use client";

import dynamic from "next/dynamic";

// The charting library is large. Load it only when there is a trend to draw,
// so screens with no history yet (and slower devices) never download it.
const TrendLineChart = dynamic(
  () => import("./trend-line-chart").then((module) => module.TrendLineChart),
  { ssr: false }
);

/** A compact area trend (velocity, health/budget over time). Parent sets width. */
export function TrendLine({
  data,
  color = "var(--info)",
  height = 72,
  unit = "",
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  unit?: string;
}) {
  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ height }}
      >
        Not enough history yet.
      </div>
    );
  }

  // The fixed height holds the space while the chart loads.
  return (
    <div style={{ height }}>
      <TrendLineChart data={data} color={color} height={height} unit={unit} />
    </div>
  );
}
