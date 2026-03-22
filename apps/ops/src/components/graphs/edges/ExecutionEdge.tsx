import { memo } from "react";
import { getBezierPath, type EdgeProps } from "@xyflow/react";

const statusColors: Record<string, string> = {
  idle: "hsl(var(--muted-foreground))",
  running: "hsl(var(--primary))",
  completed: "hsl(var(--success))",
  failed: "hsl(var(--destructive))",
};

function ExecutionEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const status = (data?.status as string) || "idle";
  const stroke = statusColors[status] || statusColors.idle;
  const strokeWidth = status === "running" ? 2.5 : selected ? 2 : 1.5;
  const label = data?.label as string | undefined;

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        className={status === "running" ? "animate-pulse" : ""}
      />
      {label && (
        <text>
          <textPath
            href={`#${id}`}
            startOffset="50%"
            textAnchor="middle"
            className="text-[10px] fill-muted-foreground"
          >
            {label}
          </textPath>
        </text>
      )}
    </>
  );
}

export default memo(ExecutionEdgeComponent);
