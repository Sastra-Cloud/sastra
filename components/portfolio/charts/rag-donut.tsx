"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

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
  ].filter((d) => d.value > 0);

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
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="66%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            stroke="var(--background)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={COLORS[d.key]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums">{total}</span>
        <span className="text-xs text-muted-foreground">projects</span>
      </div>
    </div>
  );
}
