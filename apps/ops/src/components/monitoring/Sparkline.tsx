"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data: Array<{ ts: number; value: number }>;
  color?: string;
  name: string;
  height?: number;
}

export function Sparkline({
  data,
  color = "hsl(var(--primary))",
  name,
  height = 36,
}: SparklineProps) {
  if (data.length < 2) return null;

  const gradientId = `spark-${name}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
