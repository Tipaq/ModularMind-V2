import { Input, Label } from "@modularmind/ui";
import { NODE_CONFIG, type NodeType } from "../nodes/nodeConfig";
import type { Node } from "@xyflow/react";

interface PropertiesPanelProps {
  node: Node | null;
  onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
}

export function PropertiesPanel({ node, onUpdateNode }: PropertiesPanelProps) {
  if (!node) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Select a node to view properties
      </div>
    );
  }

  const nodeType = (node.data?.type || node.type || "agent") as NodeType;
  const config = NODE_CONFIG[nodeType];
  const Icon = config?.icon;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        {Icon && (
          <div className={`rounded-md p-1.5 ${config.iconBgClass}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div>
          <h3 className="text-sm font-medium">{config?.label || nodeType}</h3>
          <p className="text-xs text-muted-foreground">{config?.description}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Label</Label>
          <Input
            value={(node.data?.label as string) || ""}
            onChange={(e) => onUpdateNode(node.id, { ...node.data, label: e.target.value })}
            placeholder={config?.label}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Node ID</Label>
          <p className="text-xs text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1">
            {node.id}
          </p>
        </div>

        {(nodeType === "agent" || nodeType === "supervisor") && (
          <div className="space-y-1.5">
            <Label className="text-xs">Agent ID</Label>
            <Input
              value={(node.data?.agent_id as string) || ""}
              onChange={(e) => onUpdateNode(node.id, { ...node.data, agent_id: e.target.value })}
              placeholder="Agent ID"
            />
          </div>
        )}

        {nodeType === "subgraph" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Subgraph ID</Label>
            <Input
              value={(node.data?.subgraph_id as string) || ""}
              onChange={(e) => onUpdateNode(node.id, { ...node.data, subgraph_id: e.target.value })}
              placeholder="Graph ID"
            />
          </div>
        )}

        {nodeType === "condition" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Condition Expression</Label>
            <Input
              value={(node.data?.condition as string) || ""}
              onChange={(e) => onUpdateNode(node.id, { ...node.data, condition: e.target.value })}
              placeholder="e.g. confidence > 0.7"
            />
          </div>
        )}
      </div>
    </div>
  );
}
