"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Bot,
  Crown,
  Cpu,
  Wrench,
  Zap,
  ChevronDown,
  ChevronRight,
  Activity,
  FileJson,
  Pencil,
  Loader2,
  Settings2,
} from "lucide-react";
import { Badge, Button, Switch, Separator } from "@modularmind/ui";
import type { ExecutionActivity, TokenUsage } from "@/hooks/useChat";
import type { EngineModel, SupervisorLayer } from "@/hooks/useChatConfig";
import { ExecutionActivityList } from "./ExecutionActivity";
import { ToolCallCard } from "./ToolCallCard";

interface ChatConfig {
  supervisorMode: boolean;
  supervisorPrompt: string;
  modelId: string | null;
  modelOverride: boolean;
}

interface ExecutionPanelProps {
  activities: ExecutionActivity[];
  tokenUsage: TokenUsage | null;
  isStreaming: boolean;
  config: ChatConfig;
  onConfigChange: (patch: Partial<ChatConfig>) => void;
  models: EngineModel[];
  supervisorLayers: SupervisorLayer[];
  onUpdateLayer: (key: string, content: string) => Promise<boolean>;
}

function CollapsibleSection({
  title,
  icon: Icon,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ElementType;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex-1">
          {title}
        </span>
        {badge && (
          <Badge variant="secondary" className="text-[10px] h-4">
            {badge}
          </Badge>
        )}
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

// ── Supervisor Section ────────────────────────────────────────

function SupervisorSectionContent({
  supervisorMode,
  onToggle,
  layers,
  onUpdateLayer,
}: {
  supervisorMode: boolean;
  onToggle: (enabled: boolean) => void;
  layers: SupervisorLayer[];
  onUpdateLayer: (key: string, content: string) => Promise<boolean>;
}) {
  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm">Supervisor Mode</span>
        <Switch checked={supervisorMode} onCheckedChange={onToggle} />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {supervisorMode
          ? "The supervisor automatically routes your messages to the best agent, or responds directly."
          : "Select a specific agent below to handle all messages in this conversation."}
      </p>

      {/* Soul Layers */}
      {supervisorMode && layers.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Soul Layers
          </p>
          {layers.map((layer) => (
            <LayerEditor
              key={layer.key}
              layer={layer}
              onSave={onUpdateLayer}
            />
          ))}
        </div>
      )}
    </div>
  );
}


function LayerEditor({
  layer,
  onSave,
}: {
  layer: SupervisorLayer;
  onSave: (key: string, content: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(layer.content);
  const [saving, setSaving] = useState(false);

  const handleEdit = () => {
    setDraft(layer.content);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(layer.key, draft);
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/20">
        <span className="text-xs font-medium flex-1">{layer.label}</span>
        {!editing && (
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={handleEdit}>
            <Pencil className="h-2.5 w-2.5" />
          </Button>
        )}
      </div>
      {!editing && (
        <p className="text-[10px] text-muted-foreground px-3 py-1.5">
          {layer.description}
        </p>
      )}
      {editing && (
        <div className="px-3 pb-2 pt-1 space-y-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full min-h-[80px] max-h-[200px] text-xs font-mono bg-muted/50 border border-border rounded p-2 resize-y focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-1 justify-end">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" className="h-6 px-2 text-xs" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Model Section ─────────────────────────────────────────────

function ModelSectionContent({
  models,
  selectedModelId,
  modelOverride,
  onSelectModel,
  onToggleOverride,
}: {
  models: EngineModel[];
  selectedModelId: string | null;
  modelOverride: boolean;
  onSelectModel: (id: string | null) => void;
  onToggleOverride: (enabled: boolean) => void;
}) {
  const availableModels = useMemo(
    () => models.filter((m) => m.is_active && m.is_available && !m.is_embedding),
    [models],
  );

  // Build the full model identifier the Engine expects: "provider:model_id"
  // e.g. "ollama:qwen2.5:latest" — not the catalog id "qwen2.5-latest"
  const toEngineModelId = useCallback(
    (m: EngineModel) => `${m.provider}:${m.model_id}`,
    [],
  );

  // Auto-select first available model when none is selected
  useEffect(() => {
    if (!selectedModelId && availableModels.length > 0) {
      onSelectModel(toEngineModelId(availableModels[0]));
    }
  }, [selectedModelId, availableModels, onSelectModel, toEngineModelId]);

  return (
    <div className="space-y-3">
      {availableModels.length === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            No models available. Pull a model in Ollama or configure provider credentials.
          </p>
          <a
            href="/configuration"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Settings2 className="h-3 w-3" />
            Go to Configuration
          </a>
        </div>
      ) : (
        <>
          <select
            value={selectedModelId || ""}
            onChange={(e) => onSelectModel(e.target.value || null)}
            className="w-full text-sm bg-muted/50 border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {availableModels.map((m) => (
              <option key={m.id} value={toEngineModelId(m)}>
                {m.display_name || m.name} ({m.provider})
              </option>
            ))}
          </select>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Override agent models</p>
              {modelOverride && (
                <p className="text-xs text-warning mt-0.5">
                  All agents and graphs will use this model instead of their configured model.
                </p>
              )}
            </div>
            <Switch checked={modelOverride} onCheckedChange={onToggleOverride} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────

export function ExecutionPanel({
  activities,
  tokenUsage,
  isStreaming,
  config,
  onConfigChange,
  models,
  supervisorLayers,
  onUpdateLayer,
}: ExecutionPanelProps) {
  // Extract tool calls from activities
  const toolCalls = useMemo(
    () => activities.filter((a) => a.type === "tool" && a.toolData),
    [activities],
  );

  // Extract active agent info from delegation activities
  const activeAgent = useMemo(() => {
    const delegation = [...activities].reverse().find((a) => a.type === "delegation");
    if (!delegation) return null;
    return {
      name: delegation.agentName || delegation.label.replace("Delegating to ", ""),
      isEphemeral: delegation.isEphemeral,
      status: delegation.status,
    };
  }, [activities]);

  // Extract step data for intermediate I/O
  const steps = useMemo(
    () => activities.filter((a) => a.type === "step"),
    [activities],
  );

  const hasExecutionContent = activities.length > 0 || isStreaming || tokenUsage;

  return (
    <div className="w-80 h-full border-l flex flex-col bg-card overflow-hidden shrink-0">
      {/* Header */}
      <div className="h-14 border-b flex items-center px-4 shrink-0">
        <Settings2 className="h-4 w-4 mr-2 text-muted-foreground" />
        <span className="text-sm font-medium">Configuration</span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Model Section */}
        <CollapsibleSection title="Model" icon={Cpu} defaultOpen={true}>
          <ModelSectionContent
            models={models}
            selectedModelId={config.modelId}
            modelOverride={config.modelOverride}
            onSelectModel={(id) => onConfigChange({ modelId: id })}
            onToggleOverride={(enabled) => onConfigChange({ modelOverride: enabled })}
          />
        </CollapsibleSection>

        <Separator />

        {/* Supervisor Section */}
        <CollapsibleSection title="Supervisor" icon={Crown} defaultOpen={true}>
          <SupervisorSectionContent
            supervisorMode={config.supervisorMode}
            onToggle={(enabled) => onConfigChange({ supervisorMode: enabled })}
            layers={supervisorLayers}
            onUpdateLayer={onUpdateLayer}
          />
        </CollapsibleSection>

        {/* Execution sections — only show when there's data */}
        {hasExecutionContent && (
          <>
            <Separator />

            {/* Token Usage */}
            {tokenUsage && (
              <div className="px-4 py-2.5">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">Tokens:</span>
                  <span className="font-mono">{tokenUsage.prompt}</span>
                  <span className="text-muted-foreground">&rarr;</span>
                  <span className="font-mono">{tokenUsage.completion}</span>
                  <span className="text-muted-foreground">=</span>
                  <span className="font-mono font-medium">{tokenUsage.total}</span>
                </div>
              </div>
            )}

            {/* Activity Stream */}
            <CollapsibleSection title="Activity" icon={Activity} defaultOpen={true} badge={activities.length > 0 ? `${activities.length}` : undefined}>
              <ExecutionActivityList
                activities={activities}
                isStreaming={isStreaming}
                hasContent={true}
              />
            </CollapsibleSection>

            {/* Active Agent */}
            {activeAgent && (
              <CollapsibleSection title="Active Agent" icon={Bot} defaultOpen={true}>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{activeAgent.name}</span>
                    {activeAgent.isEphemeral && (
                      <Badge variant="outline" className="text-[10px]">ephemeral</Badge>
                    )}
                    <Badge
                      variant={activeAgent.status === "running" ? "default" : "secondary"}
                      className="text-[10px] ml-auto"
                    >
                      {activeAgent.status}
                    </Badge>
                  </div>
                </div>
              </CollapsibleSection>
            )}

            {/* Tool Calls */}
            {toolCalls.length > 0 && (
              <CollapsibleSection title="Tool Calls" icon={Wrench} defaultOpen={true} badge={`${toolCalls.length}`}>
                <div className="space-y-2">
                  {toolCalls.map((tc) => (
                    <ToolCallCard
                      key={tc.id}
                      toolData={tc.toolData!}
                      status={tc.status}
                      durationMs={tc.durationMs}
                    />
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Intermediate I/O */}
            {steps.length > 0 && (
              <CollapsibleSection title="Steps" icon={FileJson} badge={`${steps.length}`}>
                <div className="space-y-2">
                  {steps.map((step) => (
                    <StepCard key={step.id} step={step} />
                  ))}
                </div>
              </CollapsibleSection>
            )}
          </>
        )}

        {/* Empty execution state */}
        {!hasExecutionContent && (
          <>
            <Separator />
            <div className="flex flex-col items-center justify-center h-24 text-muted-foreground">
              <Zap className="h-5 w-5 mb-1.5 opacity-30" />
              <p className="text-xs">Send a message to see execution details</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StepCard({ step }: { step: ExecutionActivity }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
      >
        <Badge
          variant={step.status === "running" ? "default" : step.status === "failed" ? "destructive" : "secondary"}
          className="text-[10px]"
        >
          {step.status}
        </Badge>
        <span className="text-xs font-medium truncate flex-1">{step.label}</span>
        {step.durationMs != null && (
          <span className="text-[10px] text-muted-foreground">
            {step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {expanded && step.preview && (
        <div className="border-t border-border/50 px-3 py-2">
          <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-words">
            {step.preview}
          </pre>
        </div>
      )}
    </div>
  );
}
