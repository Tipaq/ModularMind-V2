import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { Badge, formatModelName, Input, Switch } from "@modularmind/ui";
import type { AgentDetail, AgentUpdateInput } from "@modularmind/api-client";

interface AgentOverviewSectionProps {
  agent: AgentDetail;
  isEditing: boolean;
  onChange: (data: AgentUpdateInput) => void;
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function AgentOverviewSection({ agent, isEditing, onChange }: AgentOverviewSectionProps) {
  const [values, setValues] = useState({
    name: agent.name,
    description: agent.description,
    model_id: agent.model_id,
    timeout_seconds: agent.timeout_seconds,
    memory_enabled: agent.memory_enabled,
  });

  useEffect(() => {
    if (!isEditing) {
      setValues({
        name: agent.name,
        description: agent.description,
        model_id: agent.model_id,
        timeout_seconds: agent.timeout_seconds,
        memory_enabled: agent.memory_enabled,
      });
    }
  }, [isEditing, agent]);

  const update = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    onChange({
      name: next.name,
      description: next.description,
      model_id: next.model_id,
      timeout_seconds: next.timeout_seconds,
      memory_enabled: next.memory_enabled,
    });
  };

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        <Settings2 className="h-3.5 w-3.5" />
        General
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <PropRow label="Name">
            <Input
              value={values.name}
              onChange={(e) => update("name", e.target.value)}
              className="w-60 h-8 text-sm"
            />
          </PropRow>
          <PropRow label="Description">
            <Input
              value={values.description}
              onChange={(e) => update("description", e.target.value)}
              className="w-60 h-8 text-sm"
            />
          </PropRow>
          <PropRow label="Model">
            <Input
              value={values.model_id}
              onChange={(e) => update("model_id", e.target.value)}
              className="w-60 h-8 text-sm font-mono"
              placeholder="ollama:llama3.2"
            />
          </PropRow>
          <PropRow label="Timeout (s)">
            <Input
              type="number"
              value={values.timeout_seconds}
              onChange={(e) => update("timeout_seconds", Number(e.target.value))}
              className="w-24 h-8 text-sm"
              min={1}
            />
          </PropRow>
          <PropRow label="Memory">
            <Switch
              checked={values.memory_enabled}
              onCheckedChange={(checked) => update("memory_enabled", checked)}
            />
          </PropRow>
        </div>
      ) : (
        <div className="space-y-1">
          <PropRow label="Name">
            <span className="text-sm">{agent.name}</span>
          </PropRow>
          <PropRow label="Description">
            <span className="text-sm text-muted-foreground">
              {agent.description || "No description"}
            </span>
          </PropRow>
          <PropRow label="Model">
            <Badge variant="outline" className="text-[10px]">
              {formatModelName(agent.model_id)}
            </Badge>
          </PropRow>
          <PropRow label="Timeout">
            <span className="text-sm">{agent.timeout_seconds}s</span>
          </PropRow>
          <PropRow label="Memory">
            <Badge
              variant={agent.memory_enabled ? "default" : "secondary"}
              className="text-[10px]"
            >
              {agent.memory_enabled ? "On" : "Off"}
            </Badge>
          </PropRow>
        </div>
      )}
    </div>
  );
}
