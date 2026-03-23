"use client";

import { Brain, Clock, Cpu } from "lucide-react";
import { Badge } from "./badge";
import { cn, formatModelName } from "../lib/utils";

export interface AgentConfigGridProps {
  modelId: string;
  timeoutSeconds: number;
  memoryEnabled: boolean;
  size?: "sm" | "md";
}

const SIZE_CLASSES = {
  sm: { label: "text-[9px]", value: "text-[11px]", icon: "h-3 w-3", gap: "gap-1.5" },
  md: { label: "text-[10px]", value: "text-sm", icon: "h-3.5 w-3.5", gap: "gap-2" },
};

export function AgentConfigGrid({
  modelId,
  timeoutSeconds,
  memoryEnabled,
  size = "md",
}: AgentConfigGridProps) {
  const s = SIZE_CLASSES[size];

  return (
    <div className="grid grid-cols-3 gap-3">
      <ConfigCell label="Model" icon={Cpu} sizeClasses={s}>
        <span className={cn(s.value, "font-medium truncate")}>
          {formatModelName(modelId)}
        </span>
      </ConfigCell>
      <ConfigCell label="Timeout" icon={Clock} sizeClasses={s}>
        <span className={s.value}>
          {timeoutSeconds > 0 ? `${timeoutSeconds}s` : "None"}
        </span>
      </ConfigCell>
      <ConfigCell label="Memory" icon={Brain} sizeClasses={s}>
        <Badge
          variant={memoryEnabled ? "default" : "secondary"}
          className={cn(size === "sm" ? "text-[9px] py-0 px-1" : "text-[10px]")}
        >
          {memoryEnabled ? (size === "sm" ? "On" : "Enabled") : (size === "sm" ? "Off" : "Disabled")}
        </Badge>
      </ConfigCell>
    </div>
  );
}

function ConfigCell({
  label,
  icon: Icon,
  sizeClasses,
  children,
}: {
  label: string;
  icon: React.ElementType;
  sizeClasses: typeof SIZE_CLASSES.sm;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn("flex items-center", sizeClasses.gap)}>
        <Icon className={cn(sizeClasses.icon, "text-muted-foreground shrink-0")} />
        <p className={cn(sizeClasses.label, "font-medium text-muted-foreground uppercase tracking-wider")}>
          {label}
        </p>
      </div>
      {children}
    </div>
  );
}
