"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { formatAiAmountShort, type AiAmountUnit } from "@/lib/ai/amount-format";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Donut of AI usage by model (dollars, or credits on Sastra Cloud). Groups the tail into "Other". */
export function UsageModelDonut({
  data,
  size = 148,
  unit = "usd",
}: {
  data: { label: string; value: number }[];
  size?: number;
  unit?: AiAmountUnit;
}) {
  const positive = data.filter((d) => d.value > 0);
  const total = positive.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-full border border-dashed text-xs text-muted-foreground"
        style={{ width: size, height: size }}
      >
        {unit === "credits" ? "No credits used yet" : "No spend yet"}
      </div>
    );
  }

  // Keep the top 4 by spend; fold the rest into "Other".
  const sorted = [...positive].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, 4);
  const tail = sorted.slice(4);
  const slices = tail.length
    ? [...head, { label: "Other", value: tail.reduce((s, d) => s + d.value, 0) }]
    : head;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="64%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--background)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((d, i) => (
                <Cell key={d.label} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums">
            {formatAiAmountShort(total, unit)}
          </span>
          <span className="text-[11px] text-muted-foreground">total</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1 text-sm">
        {slices.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {d.label}
            </span>
            <span className="tabular-nums">{formatAiAmountShort(d.value, unit)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
