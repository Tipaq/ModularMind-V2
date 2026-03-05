"use client";

import { useMemo } from "react";
import { cn } from "@modularmind/ui";
import type { BudgetOverview } from "@/hooks/useChat";

const LAYERS = [
  { key: "system" as const, label: "System", color: "hsl(var(--primary))", bgClass: "bg-primary", textClass: "text-primary" },
  { key: "history" as const, label: "History", color: "hsl(var(--info))", bgClass: "bg-info", textClass: "text-info" },
  { key: "memory" as const, label: "Memory", color: "hsl(var(--warning))", bgClass: "bg-warning", textClass: "text-warning" },
  { key: "rag" as const, label: "RAG", color: "hsl(var(--success))", bgClass: "bg-success", textClass: "text-success" },
];

const RESERVED_COLOR = "hsl(var(--muted-foreground) / 0.15)";

interface ContextBudgetDonutProps {
  overview: BudgetOverview;
  className?: string;
}

export function ContextBudgetDonut({ overview, className }: ContextBudgetDonutProps) {
  const formatK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n);

  const systemLayer = overview.layers.system ?? { used: 0, allocated: 0, pct: 0 };
  const totalUsed = systemLayer.used + overview.layers.history.used + overview.layers.memory.used + overview.layers.rag.used;
  const totalAllocated = systemLayer.allocated + overview.layers.history.allocated + overview.layers.memory.allocated + overview.layers.rag.allocated;
  const fillPct = overview.effectiveContext > 0 ? Math.round((totalUsed / overview.effectiveContext) * 100) : 0;

  // SVG donut parameters
  const size = 52;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Build segments for the outer ring (allocated budget)
  const outerSegments = useMemo(() => {
    const segments: { offset: number; length: number; color: string }[] = [];
    let cumPct = 0;

    for (const layer of LAYERS) {
      const info = layer.key === "system" ? overview.layers.system : overview.layers[layer.key];
      if (!info) continue;
      const pct = info.pct;
      if (pct > 0) {
        segments.push({
          offset: cumPct / 100,
          length: pct / 100,
          color: layer.color,
        });
      }
      cumPct += pct;
    }

    // Reserved segment
    const reservedPct = Math.max(0, 100 - cumPct);
    if (reservedPct > 0) {
      segments.push({
        offset: cumPct / 100,
        length: reservedPct / 100,
        color: RESERVED_COLOR,
      });
    }

    return segments;
  }, [overview]);

  // Build segments for the inner ring (actual usage)
  const innerSegments = useMemo(() => {
    const segments: { offset: number; length: number; color: string }[] = [];
    if (overview.effectiveContext <= 0) return segments;

    let cumPct = 0;
    for (const layer of LAYERS) {
      const info = layer.key === "system" ? overview.layers.system : overview.layers[layer.key];
      if (!info) continue;
      const usedPct = (info.used / overview.effectiveContext) * 100;
      if (usedPct > 0) {
        segments.push({
          offset: cumPct / 100,
          length: usedPct / 100,
          color: layer.color,
        });
      }
      cumPct += usedPct;
    }
    return segments;
  }, [overview]);

  const innerRadius = radius - strokeWidth - 1.5;
  const innerCircumference = 2 * Math.PI * innerRadius;
  const innerStrokeWidth = 3;

  return (
    <div className={cn("flex items-center gap-3 px-4 py-1.5", className)}>
      {/* SVG Donut */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          {/* Background ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
          />
          {/* Outer ring: allocated budget */}
          {outerSegments.map((seg, i) => (
            <circle
              key={`outer-${i}`}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${seg.length * circumference} ${circumference}`}
              strokeDashoffset={-seg.offset * circumference}
              strokeLinecap="butt"
            />
          ))}
          {/* Inner ring background */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={innerRadius}
            fill="none"
            stroke="hsl(var(--muted) / 0.5)"
            strokeWidth={innerStrokeWidth}
          />
          {/* Inner ring: actual usage */}
          {innerSegments.map((seg, i) => (
            <circle
              key={`inner-${i}`}
              cx={size / 2}
              cy={size / 2}
              r={innerRadius}
              fill="none"
              stroke={seg.color}
              strokeWidth={innerStrokeWidth}
              strokeDasharray={`${seg.length * innerCircumference} ${innerCircumference}`}
              strokeDashoffset={-seg.offset * innerCircumference}
              strokeLinecap="butt"
              opacity={0.8}
            />
          ))}
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[9px] font-mono font-medium tabular-nums">{fillPct}%</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground overflow-hidden">
        {LAYERS.map((layer) => {
          const info = layer.key === "system" ? overview.layers.system : overview.layers[layer.key];
          if (!info || (info.allocated === 0 && info.used === 0)) return null;
          return (
            <span key={layer.key} className="flex items-center gap-1 shrink-0">
              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", layer.bgClass)} />
              <span className="font-mono tabular-nums">
                <span className={info.used > 0 ? layer.textClass : ""}>{formatK(info.used)}</span>
                <span className="text-muted-foreground/50">/{formatK(info.allocated)}</span>
              </span>
            </span>
          );
        })}
        {overview.maxPct < 100 && (
          <span className="text-muted-foreground/50 shrink-0">
            cap {overview.maxPct}%
          </span>
        )}
      </div>
    </div>
  );
}
