"use client";

import { memo } from "react";

const DONUT_SIZE = 18;
const DONUT_STROKE_WIDTH = 2.5;
const CONTEXT_WARNING_THRESHOLD = 70;
const CONTEXT_CRITICAL_THRESHOLD = 90;

export const ContextMiniDonut = memo(function ContextMiniDonut({ percent }: { percent: number }) {
  const radius = (DONUT_SIZE - DONUT_STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (percent / 100) * circumference;
  const color = percent >= CONTEXT_CRITICAL_THRESHOLD
    ? "hsl(var(--destructive))"
    : percent >= CONTEXT_WARNING_THRESHOLD
      ? "hsl(var(--warning))"
      : "hsl(var(--primary))";

  return (
    <svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} className="-rotate-90">
      <circle cx={DONUT_SIZE / 2} cy={DONUT_SIZE / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={DONUT_STROKE_WIDTH} />
      <circle
        cx={DONUT_SIZE / 2}
        cy={DONUT_SIZE / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={DONUT_STROKE_WIDTH}
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
      />
    </svg>
  );
});
