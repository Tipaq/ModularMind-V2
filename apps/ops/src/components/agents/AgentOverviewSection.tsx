import { useEffect, useState } from "react";
import { Bot, Brain, Clock, Search, Settings2 } from "lucide-react";
import {
  AgentConfigGrid,
  formatModelName,
  Input,
  PromptDisplay,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  ToggleRow,
} from "@modularmind/ui";
import type { AgentDetail, AgentUpdateInput } from "@modularmind/api-client";
import { useModelsStore } from "../../stores/models";

interface AgentOverviewSectionProps {
  agent: AgentDetail;
  isEditing: boolean;
  onChange: (data: AgentUpdateInput) => void;
}

function AgentOverviewSectionInner({ agent, isEditing, onChange }: AgentOverviewSectionProps) {
  const [values, setValues] = useState({
    name: agent.name,
    description: agent.description,
    model_id: agent.model_id,
    system_prompt: agent.system_prompt || "",
    timeout_seconds: agent.timeout_seconds,
    memory_enabled: agent.memory_enabled,
    timeout_enabled: agent.timeout_seconds > 0,
    tool_mode: agent.tool_mode ?? ("direct" as const),
  });

  const { unifiedCatalog, fetchUnifiedCatalog } = useModelsStore();

  useEffect(() => {
    if (unifiedCatalog.length === 0) {
      void fetchUnifiedCatalog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readyModels = unifiedCatalog.filter((m) => m.unifiedStatus === "ready");

  const update = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    onChange({
      name: next.name,
      description: next.description,
      model_id: next.model_id,
      system_prompt: next.system_prompt,
      timeout_seconds: next.timeout_enabled ? next.timeout_seconds : 0,
      memory_enabled: next.memory_enabled,
      tool_mode: next.tool_mode,
    });
  };

  if (isEditing) {
    return (
      <SectionCard icon={Settings2} title="Configuration" variant="card" className="space-y-5">
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

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">System Prompt</label>
          <Textarea
            value={values.system_prompt}
            onChange={(e) => update("system_prompt", e.target.value)}
            placeholder="Define how this agent should behave, its personality, constraints, and goals..."
            className="min-h-[200px] font-mono text-[13px] leading-relaxed resize-y border-border/50 bg-background"
          />
        </div>

        <div className="grid grid-cols-3 gap-4 pt-1">
          <ToggleRow
            icon={Clock}
            label="Timeout"
            checked={values.timeout_enabled}
            onCheckedChange={(checked) => update("timeout_enabled", checked)}
          >
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
          </ToggleRow>
          <ToggleRow
            icon={Brain}
            label="Memory"
            checked={values.memory_enabled}
            onCheckedChange={(checked) => update("memory_enabled", checked)}
          />
          <ToggleRow
            icon={Search}
            label="Auto tools"
            checked={values.tool_mode === "auto"}
            onCheckedChange={(checked) => update("tool_mode", checked ? "auto" : "direct")}
          />
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard icon={Settings2} title="Configuration" variant="card" className="space-y-4">
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

      <PromptDisplay content={agent.system_prompt || null} />

      <AgentConfigGrid
        modelId={agent.model_id}
        timeoutSeconds={agent.timeout_seconds}
        memoryEnabled={agent.memory_enabled}
        size="md"
      />
    </SectionCard>
  );
}

export function AgentOverviewSection(props: AgentOverviewSectionProps) {
  const resetKey = props.isEditing ? "editing" : `view-${props.agent.id}`;
  return <AgentOverviewSectionInner key={resetKey} {...props} />;
}
