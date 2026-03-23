import { useEffect, useState } from "react";
import { Bot, Brain, Clock, Cpu, Settings2 } from "lucide-react";
import {
  Badge,
  formatModelName,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@modularmind/ui";
import type { AgentDetail, AgentUpdateInput } from "@modularmind/api-client";
import { useModelsStore } from "../../stores/models";

interface AgentOverviewSectionProps {
  agent: AgentDetail;
  isEditing: boolean;
  onChange: (data: AgentUpdateInput) => void;
}

export function AgentOverviewSection({ agent, isEditing, onChange }: AgentOverviewSectionProps) {
  const [values, setValues] = useState({
    name: agent.name,
    description: agent.description,
    model_id: agent.model_id,
    timeout_seconds: agent.timeout_seconds,
    memory_enabled: agent.memory_enabled,
    timeout_enabled: agent.timeout_seconds > 0,
  });

  const { unifiedCatalog, fetchUnifiedCatalog } = useModelsStore();

  useEffect(() => {
    if (unifiedCatalog.length === 0) fetchUnifiedCatalog();
  }, [unifiedCatalog.length, fetchUnifiedCatalog]);

  useEffect(() => {
    if (!isEditing) {
      setValues({
        name: agent.name,
        description: agent.description,
        model_id: agent.model_id,
        timeout_seconds: agent.timeout_seconds,
        memory_enabled: agent.memory_enabled,
        timeout_enabled: agent.timeout_seconds > 0,
      });
    }
  }, [isEditing, agent]);

  const readyModels = unifiedCatalog.filter((m) => m.unifiedStatus === "ready");

  const update = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    onChange({
      name: next.name,
      description: next.description,
      model_id: next.model_id,
      timeout_seconds: next.timeout_enabled ? next.timeout_seconds : 0,
      memory_enabled: next.memory_enabled,
    });
  };

  if (isEditing) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Settings2 className="h-3.5 w-3.5" />
          Configuration
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input
              value={values.name}
              onChange={(e) => update("name", e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Model</label>
            <Select value={values.model_id} onValueChange={(v) => update("model_id", v)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {readyModels.map((m) => {
                  const modelId = `${m.provider}:${m.model_name}`;
                  return (
                    <SelectItem key={modelId} value={modelId}>
                      <div className="flex items-center gap-2">
                        <span>{formatModelName(modelId)}</span>
                        <span className="text-[10px] text-muted-foreground">{m.provider}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <Textarea
            value={values.description}
            onChange={(e) => update("description", e.target.value)}
            className="text-sm resize-none min-h-[56px]"
            rows={2}
            placeholder="What does this agent do?"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 pt-1">
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Timeout</p>
                {values.timeout_enabled && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Input
                      type="number"
                      value={values.timeout_seconds}
                      onChange={(e) => update("timeout_seconds", Number(e.target.value))}
                      className="w-16 h-7 text-xs"
                      min={10}
                      max={600}
                    />
                    <span className="text-[10px] text-muted-foreground">sec</span>
                  </div>
                )}
              </div>
            </div>
            <Switch
              checked={values.timeout_enabled}
              onCheckedChange={(checked) => update("timeout_enabled", checked)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Brain className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Memory</p>
            </div>
            <Switch
              checked={values.memory_enabled}
              onCheckedChange={(checked) => update("memory_enabled", checked)}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Settings2 className="h-3.5 w-3.5" />
        Configuration
      </div>

      <div className="flex items-start gap-3.5">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div className="space-y-0.5 min-w-0">
          <h2 className="text-base font-semibold">{agent.name}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {agent.description || "No description"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 pt-1">
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Model</p>
          <div className="flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">{formatModelName(agent.model_id)}</span>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Timeout</p>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm">
              {agent.timeout_seconds > 0 ? `${agent.timeout_seconds}s` : "None"}
            </span>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Memory</p>
          <div className="flex items-center gap-2">
            <Brain className="h-3.5 w-3.5 text-muted-foreground" />
            <Badge
              variant={agent.memory_enabled ? "default" : "secondary"}
              className="text-[10px]"
            >
              {agent.memory_enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
