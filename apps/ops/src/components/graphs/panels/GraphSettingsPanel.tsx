import { useEffect } from "react";
import { Clock, Cpu } from "lucide-react";
import {
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleRow,
  formatModelName,
} from "@modularmind/ui";
import { useModelsStore } from "../../../stores/models";

export interface GraphSettings {
  name: string;
  description: string;
  entryNodeId: string | null;
  timeoutSeconds: number;
  timeoutEnabled: boolean;
  modelOverride: string | null;
}

interface GraphSettingsPanelProps {
  settings: GraphSettings;
  isEditMode: boolean;
  onUpdate: (patch: Partial<GraphSettings>) => void;
}

export function GraphSettingsPanel({
  settings,
  isEditMode,
  onUpdate,
}: GraphSettingsPanelProps) {
  const { unifiedCatalog, fetchUnifiedCatalog } = useModelsStore();

  useEffect(() => {
    if (unifiedCatalog.length === 0) fetchUnifiedCatalog();
  }, [unifiedCatalog.length, fetchUnifiedCatalog]);

  const readyModels = unifiedCatalog.filter((m) => m.unifiedStatus === "ready");

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
          placeholder="Describe what this graph workflow does..."
          disabled={!isEditMode}
          rows={4}
          className="resize-y min-h-[80px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Model Override</Label>
        <Select
          value={settings.modelOverride || "_none"}
          onValueChange={(v) => onUpdate({ modelOverride: v === "_none" ? null : v })}
          disabled={!isEditMode}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Use agent models" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">
              <span className="text-muted-foreground">No override (use agent models)</span>
            </SelectItem>
            {readyModels.map((m) => {
              const modelId = `${m.provider}:${m.model_name}`;
              return (
                <SelectItem key={modelId} value={modelId}>
                  <div className="flex items-center gap-2">
                    <Cpu className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span>{formatModelName(modelId)}</span>
                    <span className="text-[10px] text-muted-foreground">{m.provider}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          Override all agent models in this graph
        </p>
      </div>

      <ToggleRow
        icon={Clock}
        label="Timeout"
        checked={settings.timeoutEnabled}
        onCheckedChange={(checked) =>
          onUpdate({
            timeoutEnabled: checked,
            timeoutSeconds: checked ? (settings.timeoutSeconds || 300) : 0,
          })
        }
        disabled={!isEditMode}
      >
        {settings.timeoutEnabled && (
          <div className="flex items-center gap-1.5 mt-1">
            <Input
              type="number"
              value={settings.timeoutSeconds}
              onChange={(e) => onUpdate({ timeoutSeconds: Number(e.target.value) })}
              className="w-16 h-7 text-xs"
              min={10}
              max={3600}
              disabled={!isEditMode}
            />
            <span className="text-[10px] text-muted-foreground">sec</span>
          </div>
        )}
      </ToggleRow>
    </div>
  );
}
