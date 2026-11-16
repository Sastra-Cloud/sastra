"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

/** The drawn ring. Loaded on demand by `RagDonut`; import that instead. */
export function RagDonutChart({
  data,
}: {
  data: { key: string; label: string; value: number; fill: string }[];
}) {
  return (
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
            <Cell key={d.key} fill={d.fill} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
