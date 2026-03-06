"use client";

import { useMemo } from "react";
import {
  Brain,
  Activity,
  Layers,
  Settings2,
} from "lucide-react";
import {
  TabsContent,
  ChatPanel,
} from "@modularmind/ui";
import type { ChatPanelTab } from "@modularmind/ui";
import type { ExecutionActivity, MessageExecutionData } from "@/hooks/useChat";
import type { EngineAgent, EngineGraph, EngineModel, SupervisorLayer } from "@/hooks/useChatConfig";
import { ConfigTab } from "./insights/ConfigTab";
import type { ExecutionMetrics } from "./insights/ConfigTab";
import { ActivityTab } from "./insights/ActivityTab";
import { MemoryTab } from "./insights/MemoryTab";

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
  selectedModelContextWindow?: number | null;
  enabledAgents: EngineAgent[];
  enabledGraphs: EngineGraph[];
  allAgents: EngineAgent[];
  allGraphs: EngineGraph[];
}

// ── Tab Definitions ──────────────────────────────────────────

const PANEL_TABS: ChatPanelTab[] = [
  { value: "config", label: "Config", icon: Settings2 },
  { value: "activity", label: "Activity", icon: Activity },
  { value: "context", label: "Context", icon: Layers },
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
  selectedModelContextWindow,
  enabledAgents,
  enabledGraphs,
  allAgents,
  allGraphs,
}: InsightsPanelProps) {
  const displayActivities = useMemo(() => {
    return isLiveSelected && isStreaming
      ? liveActivities
      : selectedExecution?.activities ?? [];
  }, [isLiveSelected, isStreaming, liveActivities, selectedExecution?.activities]);

  const isLiveStreaming = isLiveSelected && isStreaming;

  const memoryEntries = selectedExecution?.memoryEntries ?? [];
  const contextData = selectedExecution?.contextData ?? null;
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
    <ChatPanel tabs={PANEL_TABS} defaultTab="config">
      <TabsContent value="config" className="mt-0">
        <ConfigTab
          models={models}
          selectedModelId={config.modelId}
          modelOverride={config.modelOverride}
          onToggleOverride={(enabled) => onConfigChange({ modelOverride: enabled })}
          supervisorMode={config.supervisorMode}
          onToggleSupervisor={(enabled) => onConfigChange({ supervisorMode: enabled })}
          layers={supervisorLayers}
          onUpdateLayer={onUpdateLayer}
          metrics={executionMetrics}
          budgetOverview={contextData?.budgetOverview ?? null}
          modelContextWindow={selectedModelContextWindow}
          enabledAgents={enabledAgents}
          enabledGraphs={enabledGraphs}
          allAgents={allAgents}
          allGraphs={allGraphs}
        />
      </TabsContent>

      <TabsContent value="activity" className="mt-0">
        <ActivityTab
          activities={displayActivities}
          isStreaming={isLiveSelected && isStreaming}
          tokenUsage={tokenUsage}
          activeAgent={activeAgent}
          toolCalls={toolCalls}
          steps={steps}
        />
      </TabsContent>

      <TabsContent value="context" className="mt-0">
        <MemoryTab
          entries={memoryEntries}
          contextData={contextData}
          knowledgeData={knowledgeData}
          modelContextWindow={selectedModelContextWindow}
          isStreaming={isLiveStreaming}
        />
      </TabsContent>
    </ChatPanel>
  );
}
