"use client";

import { useMemo } from "react";
import { AlertTriangle, Cpu } from "lucide-react";
import { Badge } from "../badge";
import { SectionCard } from "../section-card";
import { Switch } from "../switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../tooltip";
import { formatModelName } from "../../lib/utils";
import type { BudgetOverview } from "../../types/chat";
import type { EngineAgent, EngineModel } from "../../types/engine";
import { BudgetOverviewSection } from "./BudgetOverview";

interface ModelSelectorProps {
  models: EngineModel[];
  selectedModelId: string | null;
  modelOverride: boolean;
  onToggleOverride: (enabled: boolean) => void;
  budgetOverview: BudgetOverview | null;
  allAgents: EngineAgent[];
}

export function ModelSelector({
  models,
  selectedModelId,
  modelOverride,
  onToggleOverride,
  budgetOverview,
  allAgents,
}: ModelSelectorProps) {
  const selectedModel = useMemo(() => {
    if (!selectedModelId) return null;
    const available = models.filter((m) => m.is_active && m.is_available && !m.is_embedding);
    return available.find((m) => m.id === selectedModelId || `${m.provider}:${m.model_id}` === selectedModelId) ?? null;
  }, [models, selectedModelId]);

  const availableModelIds = useMemo(
    () => new Set(models.filter((m) => m.is_available && !m.is_embedding).map((m) => `${m.provider}:${m.model_id}`)),
    [models],
  );

  const missingAgentModels = useMemo(() => {
    const missing: { agentName: string; modelId: string }[] = [];
    for (const agent of allAgents) {
      if (agent.model_id && !availableModelIds.has(agent.model_id)) {
        missing.push({ agentName: agent.name, modelId: agent.model_id });
      }
    }
    return missing;
  }, [allAgents, availableModelIds]);

  const overrideLocked = missingAgentModels.length > 0;

  return (
    <SectionCard icon={Cpu} title="Model">
      {selectedModel ? (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium truncate">{formatModelName(selectedModel.model_id || selectedModel.name)}</span>
          <Badge variant="secondary" className="text-[10px] h-4 shrink-0">{selectedModel.provider}</Badge>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">No model selected</p>
      )}

      {budgetOverview ? <BudgetOverviewSection overview={budgetOverview} /> : null}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px]">Override agent models</span>
          {modelOverride && !overrideLocked && (
            <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
          )}
          {overrideLocked && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="h-3 w-3 text-warning" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-[10px]">
                  <p>Cannot disable — some agent models are not pulled:</p>
                  <ul className="mt-1 list-disc pl-3">
                    {missingAgentModels.map((m) => (
                      <li key={m.modelId}>{m.agentName}: {formatModelName(m.modelId)}</li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <Switch
          checked={overrideLocked || modelOverride}
          onCheckedChange={onToggleOverride}
          disabled={overrideLocked}
        />
      </div>
    </SectionCard>
  );
}
