"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { aiAmountLabel, formatAiAmountShort, type AiAmountUnit } from "@/lib/ai/amount-format";

/** AI usage over time (dollars, or credits on Sastra Cloud). Parent sets width/height. */
export function UsageAreaChart({
  data,
  height = 220,
  unit = "usd",
}: {
  data: { label: string; value: number }[];
  height?: number;
  unit?: AiAmountUnit;
}) {
  const gradientId = useId();

  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Not enough usage in this period yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          minTickGap={24}
        />
        <YAxis
          width={48}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatAiAmountShort(Number(v), unit)}
        />
        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--popover-foreground)",
            padding: "4px 8px",
          }}
          labelStyle={{ color: "var(--muted-foreground)" }}
          formatter={(value) => [formatAiAmountShort(Number(value), unit), aiAmountLabel(unit)]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
