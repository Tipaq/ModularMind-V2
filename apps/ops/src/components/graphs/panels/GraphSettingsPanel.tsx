import {
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@modularmind/ui";
import type { Node } from "@xyflow/react";

export interface GraphSettings {
  name: string;
  description: string;
  entryNodeId: string | null;
  timeoutSeconds: number;
}

interface GraphSettingsPanelProps {
  settings: GraphSettings;
  nodes: Node[];
  isEditMode: boolean;
  onUpdate: (patch: Partial<GraphSettings>) => void;
}

export function GraphSettingsPanel({
  settings,
  nodes,
  isEditMode,
  onUpdate,
}: GraphSettingsPanelProps) {
  return (
    <div className="p-4 space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Name</Label>
        <Input
          value={settings.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Graph name"
          disabled={!isEditMode}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Description</Label>
        <Textarea
          value={settings.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Optional description"
          disabled={!isEditMode}
          rows={3}
          className="resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Entry Node</Label>
        <Select
          value={settings.entryNodeId ?? ""}
          onValueChange={(value) =>
            onUpdate({ entryNodeId: value || null })
          }
          disabled={!isEditMode}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select entry node" />
          </SelectTrigger>
          <SelectContent>
            {nodes.map((node) => (
              <SelectItem key={node.id} value={node.id}>
                {(node.data?.label as string) || node.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Timeout (seconds)</Label>
        <Input
          type="number"
          value={settings.timeoutSeconds}
          onChange={(e) =>
            onUpdate({ timeoutSeconds: Number(e.target.value) || 300 })
          }
          min={1}
          disabled={!isEditMode}
        />
      </div>
    </div>
  );
}
