"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { cn } from "@modularmind/ui";

// ─── Types ─────────────────────────────────────────────────────────────────

export type TimeRange = "15m" | "1h" | "6h";

interface ChartSeries {
  name: string;
  data: Array<{ ts: number; value: number }>;
  color: string;
}

interface MetricsChartProps {
  title: string;
  series: ChartSeries[];
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  height?: number;
  unit?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const TIME_RANGES: TimeRange[] = ["15m", "1h", "6h"];

function formatTimeTick(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

/**
 * Merge multiple series with different timestamps into a unified array
 * where each point has all series values keyed by name.
 */
function mergeSeriesData(series: ChartSeries[]): Array<Record<string, number>> {
  const map = new Map<number, Record<string, number>>();

  for (const s of series) {
    for (const pt of s.data) {
      const existing = map.get(pt.ts) ?? { ts: pt.ts };
      existing[s.name] = pt.value;
      map.set(pt.ts, existing);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
}

// ─── Component ────────────────────────────────────────────────────────────

export function MetricsChart({
  title,
  series,
  timeRange,
  onTimeRangeChange,
  height = 220,
  unit,
}: MetricsChartProps) {
  const merged = useMemo(() => mergeSeriesData(series), [series]);
  const hasData = merged.length > 0;

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex rounded-lg bg-muted/60 p-0.5">
          {TIME_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => onTimeRangeChange(r)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                r === timeRange
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {hasData ? (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={merged} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
            <XAxis
              dataKey="ts"
              tickFormatter={formatTimeTick}
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={46}
              domain={[0, "auto"]}
              tickFormatter={(v: number) => (unit ? `${Math.round(v)}${unit}` : String(Math.round(v)))}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelFormatter={(ts: number) => formatTimeTick(ts)}
              formatter={(value: number, name: string) => [
                unit ? `${value.toFixed(1)}${unit}` : value.toFixed(1),
                name,
              ]}
            />
            <Legend
              iconType="line"
              wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
            />
            {series.map((s) => (
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={s.color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div
          className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
          style={{ height }}
        >
          <p>No metrics data yet</p>
          <p className="text-xs text-muted-foreground/60">Data will appear once the engine starts collecting metrics</p>
        </div>
      )}
    </div>
  );
}
