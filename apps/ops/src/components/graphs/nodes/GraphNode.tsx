import { memo } from "react";
import { Handle } from "@xyflow/react";
import { cn } from "@modularmind/ui";
import { NODE_CONFIG } from "./nodeConfig";
import type { NodeType } from "@modularmind/api-client";

interface GraphNodeData {
  label?: string;
  type?: NodeType;
  executionStatus?: string;
  executionDurationMs?: number;
  isEntryNode?: boolean;
  [key: string]: unknown;
}

interface GraphNodeProps {
  data: GraphNodeData;
  selected: boolean;
}

const statusColors: Record<string, string> = {
  running: "ring-blue-500 ring-2 animate-pulse",
  completed: "ring-emerald-500 ring-2",
  failed: "ring-red-500 ring-2",
  paused: "ring-yellow-500 ring-2",
};

function GraphNodeComponent({ data, selected }: GraphNodeProps) {
  const nodeType = (data.type || "agent") as NodeType;
  const config = NODE_CONFIG[nodeType];
  if (!config) return null;

  const Icon = config.icon;
  const label = data.label || config.label;
  const execStatus = data.executionStatus as string | undefined;

  return (
    <div
      className={cn(
        "min-w-[140px] rounded-lg border-2 shadow-sm px-3 py-2 transition-all",
        config.bgClass,
        config.borderClass,
        selected && "ring-2 ring-primary ring-offset-2",
        execStatus && statusColors[execStatus],
      )}
    >
      {/* Target handles */}
      {config.targets.map((h, i) => (
        <Handle
          key={`t-${i}`}
          type="target"
          position={h.position}
          id={h.id}
          style={h.style}
          className="!w-2.5 !h-2.5 !bg-gray-400 !border-2 !border-white"
        />
      ))}

      <div className="flex items-center gap-2">
        <div className={cn("rounded-md p-1.5", config.iconBgClass)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("text-xs font-medium truncate", config.textClass)}>{label}</p>
          {execStatus && (
            <p className="text-[10px] text-muted-foreground capitalize">{execStatus}</p>
          )}
        </div>
        {data.isEntryNode && (
          <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="Entry point" />
        )}
      </div>

      {data.executionDurationMs != null && (
        <p className="text-[10px] text-muted-foreground mt-1">
          {data.executionDurationMs}ms
        </p>
      )}

      {/* Source handles */}
      {config.sources.map((h, i) => (
        <Handle
          key={`s-${i}`}
          type="source"
          position={h.position}
          id={h.id}
          style={h.style}
          className="!w-2.5 !h-2.5 !bg-gray-400 !border-2 !border-white"
        />
      ))}
    </div>
  );
}

export default memo(GraphNodeComponent);
