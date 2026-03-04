"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Bot,
  BookOpen,
  Brain,
  Clock,
  Cpu,
  Database,
  FileText,
  Wrench,
  ChevronDown,
  ChevronRight,
  Activity,
  FileJson,
  Pencil,
  Loader2,
  Route,
  Settings2,
  Zap,
} from "lucide-react";
import {
  Badge,
  Button,
  cn,
  Switch,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  TabsContent,
  ChatPanel,
} from "@modularmind/ui";
import type { ChatPanelTab } from "@modularmind/ui";
import type { ExecutionActivity, MemoryEntry, KnowledgeData, KnowledgeChunk, MessageExecutionData } from "@/hooks/useChat";
import type { EngineModel, SupervisorLayer } from "@/hooks/useChatConfig";
import { ExecutionActivityList } from "./ExecutionActivity";
import { ToolCallCard } from "./ToolCallCard";

interface ChatConfig {
  supervisorMode: boolean;
  supervisorPrompt: string;
  modelId: string | null;
  modelOverride: boolean;
}

interface InsightsPanelProps {
  selectedExecution: MessageExecutionData | null;
  liveActivities: ExecutionActivity[];
  isStreaming: boolean;
  isLiveSelected: boolean;
  config: ChatConfig;
  onConfigChange: (patch: Partial<ChatConfig>) => void;
  models: EngineModel[];
  supervisorLayers: SupervisorLayer[];
  onUpdateLayer: (key: string, content: string) => Promise<boolean>;
}

// ── Execution Metrics ────────────────────────────────────────

interface ExecutionMetrics {
  totalDurationMs: number | null;
  llmDurationMs: number | null;
  tokensPerSecond: number | null;
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  modelUsed: string | null;
  llmCalls: number;
  toolCalls: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

// ── Shared: Collapsible Section ──────────────────────────────

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

// ── Empty State ──────────────────────────────────────────────

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <Icon className="h-5 w-5 mb-2 opacity-30" />
      <p className="text-xs text-center px-4">{message}</p>
    </div>
  );
}

// ── Model Tab Content ────────────────────────────────────────

function ModelTabContent({
  models,
  selectedModelId,
  modelOverride,
  onSelectModel,
  onToggleOverride,
  metrics,
}: {
  models: EngineModel[];
  selectedModelId: string | null;
  modelOverride: boolean;
  onSelectModel: (id: string | null) => void;
  onToggleOverride: (enabled: boolean) => void;
  metrics: ExecutionMetrics | null;
}) {
  const availableModels = useMemo(
    () => models.filter((m) => m.is_active && m.is_available && !m.is_embedding),
    [models],
  );

  const toEngineModelId = useCallback(
    (m: EngineModel) => `${m.provider}:${m.model_id}`,
    [],
  );

  // Find the selected model object for displaying details
  const selectedModel = useMemo(
    () => availableModels.find((m) => toEngineModelId(m) === selectedModelId) ?? null,
    [availableModels, selectedModelId, toEngineModelId],
  );

  useEffect(() => {
    if (!selectedModelId && availableModels.length > 0) {
      onSelectModel(toEngineModelId(availableModels[0]));
    }
  }, [selectedModelId, availableModels, onSelectModel, toEngineModelId]);

  return (
    <div className="p-4 space-y-3">
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
          <Select
            value={selectedModelId ?? ""}
            onValueChange={(v) => onSelectModel(v || null)}
          >
            <SelectTrigger className="w-full text-sm">
              <SelectValue placeholder="Select a model..." />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((m) => (
                <SelectItem key={m.id} value={toEngineModelId(m)}>
                  {m.display_name || m.name} ({m.provider})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Model info card — always visible when a model is selected */}
          {selectedModel && (
            <div className="border border-border/50 rounded-lg p-2.5">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground">Provider</span>
                <span className="text-right font-medium">{selectedModel.provider}</span>
                <span className="text-muted-foreground">Model ID</span>
                <span className="text-right font-mono text-[11px] truncate">{selectedModel.model_id}</span>
              </div>
            </div>
          )}

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

      {/* Execution Metrics */}
      {metrics && (metrics.totalDurationMs != null || metrics.tokenUsage) && (
        <div className="space-y-2 pt-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Last Execution
          </p>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            {metrics.totalDurationMs != null && (
              <>
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />Total time
                </span>
                <span className="font-mono text-right">{formatDuration(metrics.totalDurationMs)}</span>
              </>
            )}
            {metrics.llmDurationMs != null && (
              <>
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Zap className="h-3 w-3" />LLM time
                </span>
                <span className="font-mono text-right">
                  {formatDuration(metrics.llmDurationMs)}
                  {metrics.llmCalls > 1 && (
                    <span className="text-muted-foreground ml-1">({metrics.llmCalls} calls)</span>
                  )}
                </span>
              </>
            )}
            {metrics.toolCalls > 0 && (
              <>
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Wrench className="h-3 w-3" />Tools
                </span>
                <span className="font-mono text-right">{metrics.toolCalls} call{metrics.toolCalls > 1 ? "s" : ""}</span>
              </>
            )}
          </div>

          {/* Token usage card */}
          {metrics.tokenUsage && (
            <div className="border border-border/50 rounded-lg p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono">{formatNumber(metrics.tokenUsage.prompt)}</span>
                <span className="text-muted-foreground">&rarr;</span>
                <span className="font-mono">{formatNumber(metrics.tokenUsage.completion)}</span>
                <span className="text-muted-foreground">=</span>
                <span className="font-mono font-medium">{formatNumber(metrics.tokenUsage.total)}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>prompt</span>
                <span />
                <span>completion</span>
                <span />
                <span>total</span>
              </div>
              {metrics.tokensPerSecond != null && (
                <div className="text-center text-[10px] text-muted-foreground pt-0.5 border-t border-border/30">
                  <span className="font-mono font-medium text-foreground">{Math.round(metrics.tokensPerSecond)}</span> tok/s
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Supervisor Tab Content ───────────────────────────────────

function SupervisorTabContent({
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
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm">Supervisor Mode</span>
        <Switch checked={supervisorMode} onCheckedChange={onToggle} />
      </div>
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
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(layer.content);
  const [saving, setSaving] = useState(false);

  const handleEdit = () => {
    setDraft(layer.content);
    setEditing(true);
    setExpanded(false);
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
      {!editing && layer.content && (
        <div
          className="relative cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <pre
            className={cn(
              "text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words px-3 py-2 leading-relaxed",
              !expanded && "line-clamp-6",
            )}
          >
            {layer.content}
          </pre>
          {!expanded && (
            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-card/80 to-transparent pointer-events-none" />
          )}
        </div>
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

// ── Activity Tab Content ─────────────────────────────────────

function ActivityTabContent({
  activities,
  isStreaming,
  tokenUsage,
  activeAgent,
  toolCalls,
  steps,
}: {
  activities: ExecutionActivity[];
  isStreaming: boolean;
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  activeAgent: { name: string; isEphemeral?: boolean; status: string } | null;
  toolCalls: ExecutionActivity[];
  steps: ExecutionActivity[];
}) {
  if (!activities.length && !tokenUsage) {
    return <EmptyState icon={Activity} message="Send a message to see execution activity." />;
  }

  return (
    <div className="p-4 space-y-3">
      {/* Token Usage */}
      {tokenUsage && (
        <div className="border border-border/50 rounded-lg p-2.5">
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

      {/* Active Agent */}
      {activeAgent && (
        <div className="border border-border/50 rounded-lg p-2.5">
          <div className="flex items-center gap-2">
            <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium flex-1">{activeAgent.name}</span>
            {activeAgent.isEphemeral && (
              <Badge variant="outline" className="text-[10px]">ephemeral</Badge>
            )}
            <Badge
              variant={activeAgent.status === "running" ? "default" : "secondary"}
              className="text-[10px]"
            >
              {activeAgent.status}
            </Badge>
          </div>
        </div>
      )}

      {/* Activity Stream */}
      {activities.length > 0 && (
        <ExecutionActivityList
          activities={activities}
          isStreaming={isStreaming}
          hasContent={true}
          flat
        />
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

      {/* Steps */}
      {steps.length > 0 && (
        <CollapsibleSection title="Steps" icon={FileJson} badge={`${steps.length}`}>
          <div className="space-y-2">
            {steps.map((step) => (
              <StepCard key={step.id} step={step} />
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

// ── Memory Tab Content ───────────────────────────────────────

const SCOPE_LABELS: Record<string, string> = {
  cross_conversation: "Cross-conv",
  user_profile: "Profile",
  agent: "Agent",
  conversation: "Conversation",
};

const IMPORTANCE_COLORS: Record<string, string> = {
  high: "text-warning",
  medium: "text-muted-foreground",
  low: "text-muted-foreground/60",
};

function importanceLevel(score: number): string {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

function MemoryTabContent({ entries }: { entries: MemoryEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState icon={Brain} message="No memories retrieved for this message." />;
  }

  return (
    <div className="p-4 space-y-2">
      {entries.map((entry) => {
        const level = importanceLevel(entry.importance);
        return (
          <div
            key={entry.id}
            className="border border-border/50 rounded-lg p-2.5 space-y-1.5"
          >
            <p className="text-xs leading-relaxed">{entry.content}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {entry.category && (
                <Badge variant="outline" className="text-[10px] h-4">
                  {entry.category}
                </Badge>
              )}
              <Badge variant="secondary" className="text-[10px] h-4">
                {SCOPE_LABELS[entry.scope] || entry.scope}
              </Badge>
              <span className={`text-[10px] ${IMPORTANCE_COLORS[level]}`}>
                {(entry.importance * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Knowledge Tab Content ────────────────────────────────────

function KnowledgeChunkItem({ chunk }: { chunk: KnowledgeChunk }) {
  const [expanded, setExpanded] = useState(false);
  const scorePercent = Math.round(chunk.score * 100);
  const scoreColor =
    scorePercent >= 80
      ? "text-success"
      : scorePercent >= 50
        ? "text-warning"
        : "text-muted-foreground";

  return (
    <div
      className="border border-border/50 rounded-lg p-2.5 space-y-1.5 cursor-pointer hover:bg-muted/30 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-1.5">
        <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium truncate flex-1">
          {chunk.documentFilename || "Unknown document"}
        </span>
        <span className={cn("text-[10px] font-mono shrink-0", scoreColor)}>
          {scorePercent}%
        </span>
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </div>

      {/* Score bar */}
      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            scorePercent >= 80
              ? "bg-success"
              : scorePercent >= 50
                ? "bg-warning"
                : "bg-muted-foreground/40",
          )}
          style={{ width: `${scorePercent}%` }}
        />
      </div>

      <p className="text-[10px] text-muted-foreground">
        {chunk.collectionName} &middot; chunk #{chunk.chunkIndex}
      </p>

      {expanded && chunk.contentPreview && (
        <p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words bg-muted/50 rounded p-1.5 mt-1">
          {chunk.contentPreview}
        </p>
      )}
    </div>
  );
}

function KnowledgeTabContent({ data }: { data: KnowledgeData | null }) {
  if (!data || data.chunks.length === 0) {
    return <EmptyState icon={BookOpen} message="No knowledge retrieved for this message." />;
  }

  return (
    <div className="p-4 space-y-3">
      {/* Collections summary */}
      {data.collections.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Collections ({data.collections.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.collections.map((c) => (
              <Badge
                key={c.collectionId}
                variant="secondary"
                className="text-[10px] gap-1"
              >
                <Database className="h-2.5 w-2.5" />
                {c.collectionName}
                <span className="text-muted-foreground">({c.chunkCount})</span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Chunks */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Results ({data.totalResults})
        </p>
        <div className="space-y-1.5">
          {data.chunks.map((chunk) => (
            <KnowledgeChunkItem key={chunk.chunkId} chunk={chunk} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step Card ────────────────────────────────────────────────

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

// ── Tab Definitions ──────────────────────────────────────────

const PANEL_TABS: ChatPanelTab[] = [
  { value: "model", label: "Model", icon: Cpu },
  { value: "supervisor", label: "Supervisor", icon: Route },
  { value: "activity", label: "Activity", icon: Activity },
  { value: "memory", label: "Memory", icon: Brain },
  { value: "knowledge", label: "RAG", icon: BookOpen },
];

// ── Main Panel ───────────────────────────────────────────────

export function InsightsPanel({
  selectedExecution,
  liveActivities,
  isStreaming,
  isLiveSelected,
  config,
  onConfigChange,
  models,
  supervisorLayers,
  onUpdateLayer,
}: InsightsPanelProps) {
  const displayActivities = useMemo(() => {
    return isLiveSelected && isStreaming
      ? liveActivities
      : selectedExecution?.activities ?? [];
  }, [isLiveSelected, isStreaming, liveActivities, selectedExecution?.activities]);

  const memoryEntries = selectedExecution?.memoryEntries ?? [];
  const knowledgeData = selectedExecution?.knowledgeData ?? null;
  const tokenUsage = selectedExecution?.tokenUsage ?? null;

  const toolCalls = useMemo(
    () => displayActivities.filter((a) => a.type === "tool" && a.toolData),
    [displayActivities],
  );

  const activeAgent = useMemo(() => {
    const delegation = [...displayActivities].reverse().find((a) => a.type === "delegation");
    if (!delegation) return null;
    return {
      name: delegation.agentName || delegation.label.replace("Delegating to ", ""),
      isEphemeral: delegation.isEphemeral,
      status: delegation.status,
    };
  }, [displayActivities]);

  const steps = useMemo(
    () => displayActivities.filter((a) => a.type === "step"),
    [displayActivities],
  );

  const executionMetrics = useMemo<ExecutionMetrics | null>(() => {
    // Show metrics as soon as we have any activities (routing, delegation, etc.) or token data
    if (!displayActivities.length && !tokenUsage) return null;

    const llmActivities = displayActivities.filter((a) => a.type === "llm");
    const toolActivities = displayActivities.filter((a) => a.type === "tool");

    // Total duration: use delegation end duration (most accurate) or compute from activity span
    let totalDurationMs: number | null = null;
    const delegationEnd = displayActivities.find((a) => a.type === "delegation" && a.status !== "running" && a.durationMs);
    const directResponse = displayActivities.find((a) => a.type === "direct_response" && a.durationMs);
    if (delegationEnd?.durationMs) {
      totalDurationMs = delegationEnd.durationMs;
    } else if (directResponse?.durationMs) {
      totalDurationMs = directResponse.durationMs;
    } else {
      const withDuration = displayActivities.filter((a) => a.startedAt && a.durationMs != null);
      if (withDuration.length > 0) {
        const earliest = Math.min(...displayActivities.filter((a) => a.startedAt).map((a) => a.startedAt));
        const latest = Math.max(...withDuration.map((a) => a.startedAt + (a.durationMs || 0)));
        if (latest > earliest) totalDurationMs = latest - earliest;
      }
    }

    // LLM duration: sum of all LLM call durations
    const llmDurationMs = llmActivities.reduce((sum, a) => sum + (a.durationMs || 0), 0) || null;

    // Tokens per second
    let tokensPerSecond: number | null = null;
    if (tokenUsage && llmDurationMs && llmDurationMs > 0) {
      tokensPerSecond = (tokenUsage.completion / (llmDurationMs / 1000));
    }

    // Model used: from LLM activity trace, or fall back to configured model
    const modelUsed = [...llmActivities].reverse().find((a) => a.model)?.model ?? config.modelId;

    return {
      totalDurationMs,
      llmDurationMs,
      tokensPerSecond,
      tokenUsage,
      modelUsed,
      llmCalls: llmActivities.length,
      toolCalls: toolActivities.length,
    };
  }, [displayActivities, tokenUsage, config.modelId]);

  return (
    <ChatPanel tabs={PANEL_TABS} defaultTab="model">
      <TabsContent value="model" className="mt-0">
        <ModelTabContent
          models={models}
          selectedModelId={config.modelId}
          modelOverride={config.modelOverride}
          onSelectModel={(id) => onConfigChange({ modelId: id })}
          onToggleOverride={(enabled) => onConfigChange({ modelOverride: enabled })}
          metrics={executionMetrics}
        />
      </TabsContent>

      <TabsContent value="supervisor" className="mt-0">
        <SupervisorTabContent
          supervisorMode={config.supervisorMode}
          onToggle={(enabled) => onConfigChange({ supervisorMode: enabled })}
          layers={supervisorLayers}
          onUpdateLayer={onUpdateLayer}
        />
      </TabsContent>

      <TabsContent value="activity" className="mt-0">
        <ActivityTabContent
          activities={displayActivities}
          isStreaming={isLiveSelected && isStreaming}
          tokenUsage={tokenUsage}
          activeAgent={activeAgent}
          toolCalls={toolCalls}
          steps={steps}
        />
      </TabsContent>

      <TabsContent value="memory" className="mt-0">
        <MemoryTabContent entries={memoryEntries} />
      </TabsContent>

      <TabsContent value="knowledge" className="mt-0">
        <KnowledgeTabContent data={knowledgeData} />
      </TabsContent>
    </ChatPanel>
  );
}
