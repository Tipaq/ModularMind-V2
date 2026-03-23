import { Bot, GitBranch } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  formatModelName,
} from "@modularmind/ui";
import type { Agent, GraphListItem, TargetType } from "@modularmind/api-client";

interface TargetSectionProps {
  targetType: TargetType;
  targetId: string;
  agents: Agent[];
  graphs: GraphListItem[];
  isLoadingTargets: boolean;
  onTargetTypeChange: (type: TargetType) => void;
  onTargetIdChange: (id: string) => void;
}

const TARGET_OPTIONS = [
  { value: "agent" as const, icon: Bot, label: "Agent" },
  { value: "graph" as const, icon: GitBranch, label: "Graph" },
];

function TargetTypeCards({
  targetType,
  onTargetTypeChange,
}: Pick<TargetSectionProps, "targetType" | "onTargetTypeChange">) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {TARGET_OPTIONS.map(({ value, icon: Icon, label }) => {
        const isSelected = targetType === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onTargetTypeChange(value)}
            className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-sm font-medium transition-colors cursor-pointer ${
              isSelected
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-muted-foreground/50"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function AgentPicker({
  targetId,
  agents,
  isLoadingTargets,
  onTargetIdChange,
}: Pick<TargetSectionProps, "targetId" | "agents" | "isLoadingTargets" | "onTargetIdChange">) {
  return (
    <Select value={targetId} onValueChange={onTargetIdChange} disabled={isLoadingTargets}>
      <SelectTrigger>
        <SelectValue placeholder={isLoadingTargets ? "Loading agents..." : "Select an agent..."} />
      </SelectTrigger>
      <SelectContent>
        {agents.map((agent) => (
          <SelectItem key={agent.id} value={agent.id}>
            <div className="flex flex-col">
              <span>{agent.name}</span>
              <span className="text-xs text-muted-foreground">{formatModelName(agent.model_id)}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function GraphPicker({
  targetId,
  graphs,
  isLoadingTargets,
  onTargetIdChange,
}: Pick<TargetSectionProps, "targetId" | "graphs" | "isLoadingTargets" | "onTargetIdChange">) {
  return (
    <Select value={targetId} onValueChange={onTargetIdChange} disabled={isLoadingTargets}>
      <SelectTrigger>
        <SelectValue placeholder={isLoadingTargets ? "Loading graphs..." : "Select a graph..."} />
      </SelectTrigger>
      <SelectContent>
        {graphs.map((graph) => (
          <SelectItem key={graph.id} value={graph.id}>
            <div className="flex flex-col">
              <span>{graph.name}</span>
              <span className="text-xs text-muted-foreground">{graph.node_count} nodes</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TargetSection(props: TargetSectionProps) {
  return (
    <div className="space-y-3">
      <TargetTypeCards
        targetType={props.targetType}
        onTargetTypeChange={(type) => {
          props.onTargetTypeChange(type);
          props.onTargetIdChange("");
        }}
      />
      {props.targetType === "agent" ? (
        <AgentPicker
          targetId={props.targetId}
          agents={props.agents}
          isLoadingTargets={props.isLoadingTargets}
          onTargetIdChange={props.onTargetIdChange}
        />
      ) : (
        <GraphPicker
          targetId={props.targetId}
          graphs={props.graphs}
          isLoadingTargets={props.isLoadingTargets}
          onTargetIdChange={props.onTargetIdChange}
        />
      )}
    </div>
  );
}

export { TargetSection };
