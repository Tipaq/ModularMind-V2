"use client";

import { useMemo } from "react";
import {
  Activity,
  Layers,
  Settings2,
} from "lucide-react";
import { TabsContent } from "../tabs";
import { ChatPanel } from "../chat-panel";
import type { ChatPanelTab } from "../chat-panel";
import { ActivityTab } from "../activity";
import { ConfigTab } from "./ConfigTab";
import type { ExecutionMetrics } from "./ConfigTab";
import { MemoryTab } from "./MemoryTab";
import type {
  ExecutionActivity,
  MessageExecutionData,
} from "../../types/chat";
import type { EngineAgent, EngineGraph, EngineModel, SupervisorLayer } from "@modularmind/api-client";
import { ALL_TOOL_CATEGORIES } from "../../lib/chat-config";
import type { ChatConfig } from "../../lib/chat-config";

export interface InsightsPanelProps {
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
  /** Optional callback for "Compact History" action. */
  onCompact?: () => Promise<{ summary_preview: string; compacted_count: number; duration_ms: number }>;
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
  onCompact,
}: InsightsPanelProps) {
  const displayActivities = useMemo(() => {
    return isLiveSelected && isStreaming
      ? liveActivities
      : selectedExecution?.activities ?? [];
  }, [isLiveSelected, isStreaming, liveActivities, selectedExecution?.activities]);

  const isLiveStreaming = isLiveSelected && isStreaming;

  const contextData = selectedExecution?.contextData ?? null;
  const knowledgeData = selectedExecution?.knowledgeData ?? null;
  const tokenUsage = selectedExecution?.tokenUsage ?? null;

  const executionMetrics = useMemo<ExecutionMetrics | null>(() => {
    if (!displayActivities.length && !tokenUsage) return null;

    const llmActivities: ExecutionActivity[] = [];
    const toolActivities: ExecutionActivity[] = [];
    const withDuration: ExecutionActivity[] = [];
    let delegationEnd: ExecutionActivity | undefined;
    let directResponse: ExecutionActivity | undefined;
    let earliest = Infinity;

    for (const a of displayActivities) {
      if (a.type === "llm") llmActivities.push(a);
      if (a.type === "tool") toolActivities.push(a);
      if (!delegationEnd && a.type === "delegation" && a.status !== "running" && a.durationMs) {
        delegationEnd = a;
      }
      if (!directResponse && a.type === "direct_response" && a.durationMs) {
        directResponse = a;
      }
      if (a.startedAt) {
        if (a.startedAt < earliest) earliest = a.startedAt;
        if (a.durationMs != null) withDuration.push(a);
      }
    }

    let totalDurationMs: number | null = null;
    if (delegationEnd?.durationMs) {
      totalDurationMs = delegationEnd.durationMs;
    } else if (directResponse?.durationMs) {
      totalDurationMs = directResponse.durationMs;
    } else if (withDuration.length > 0) {
      const latest = Math.max(...withDuration.map((a) => a.startedAt + (a.durationMs || 0)));
      if (latest > earliest) totalDurationMs = latest - earliest;
    }

    const llmDurationMs = llmActivities.reduce((sum, a) => sum + (a.durationMs || 0), 0) || null;

    let tokensPerSecond: number | null = null;
    if (tokenUsage && llmDurationMs && llmDurationMs > 0) {
      tokensPerSecond = (tokenUsage.completion / (llmDurationMs / 1000));
    }

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
          supervisorToolCategories={config.supervisorToolCategories}
          onToggleToolCategory={(category, enabled) => {
            const current = config.supervisorToolCategories;
            if (enabled) {
              if (current === null || current === undefined) return;
              const updated = [...current, category];
              onConfigChange({ supervisorToolCategories: updated });
            } else {
              const all = current ?? ALL_TOOL_CATEGORIES.map((c) => c.id);
              const updated = all.filter((c) => c !== category);
              onConfigChange({ supervisorToolCategories: updated });
            }
          }}
        />
      </TabsContent>

      <TabsContent value="activity" className="mt-0">
        <ActivityTab
          activities={displayActivities}
          isStreaming={isLiveSelected && isStreaming}
          tokenUsage={tokenUsage}
          enabledAgents={enabledAgents}
          enabledGraphs={enabledGraphs}
        />
      </TabsContent>

      <TabsContent value="context" className="mt-0">
        <MemoryTab
          contextData={contextData}
          knowledgeData={knowledgeData}
          modelContextWindow={selectedModelContextWindow}
          isStreaming={isLiveStreaming}
          onCompact={onCompact}
        />
      </TabsContent>
    </ChatPanel>
  );
}
