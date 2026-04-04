"use client";

import { Activity, Clock, Bot, AlertTriangle } from "lucide-react";
import { cn } from "@modularmind/ui";
import type { DLQMessage, LiveExecutionsData, AgentMetrics } from "@modularmind/api-client";
import { api } from "@modularmind/api-client";
import { estimateCost, formatCostUSD } from "../../../lib/tokenPricing";
import { retryDLQBatch } from "../../../lib/monitoringUtils";
import { ExecutionTable } from "../ExecutionTable";
import { AgentPerformanceTable } from "../AgentPerformanceTable";
import { CollapsibleSection } from "../CollapsibleSection";
import { DLQSection } from "../pipelines/DLQSection";
import { countDLQByDomain } from "../../../lib/dlqDomains";

// ─── Summary Strip ──────────────────────────────────────────────────────────

function ExecutionsSummary({
  liveExecutions,
  agentMetrics,
}: {
  liveExecutions: LiveExecutionsData | null;
  agentMetrics: AgentMetrics[] | null;
}) {
  const totalActive = liveExecutions?.total_active ?? 0;
  const recentCount = liveExecutions?.recent.length ?? 0;

  // Compute total tokens & cost from recent + active
  const allExecs = [
    ...(liveExecutions?.active ?? []),
    ...(liveExecutions?.recent ?? []),
  ];
  const totalTokens = allExecs.reduce(
    (sum, e) => sum + e.tokens_prompt + e.tokens_completion,
    0,
  );
  const totalCost = allExecs.reduce((sum, e) => {
    if (!e.model) return sum;
    const cost = estimateCost(e.model, e.tokens_prompt, e.tokens_completion);
    return sum + (cost ?? 0);
  }, 0);

  // Global error rate from agent metrics
  const globalErrorRate = (() => {
    if (!agentMetrics || agentMetrics.length === 0) return 0;
    const totalRuns = agentMetrics.reduce((sum, a) => sum + a.total_executions, 0);
    const totalErrors = agentMetrics.reduce((sum, a) => sum + a.error_count, 0);
    return totalRuns > 0 ? (totalErrors / totalRuns) * 100 : 0;
  })();

  const cards = [
    {
      label: "Active Now",
      value: totalActive,
      color: totalActive > 0 ? "text-success" : "text-muted-foreground",
      icon: Activity,
      iconColor: totalActive > 0 ? "text-success" : "text-muted-foreground",
    },
    {
      label: "Last Hour",
      value: recentCount,
      color: "text-foreground",
      icon: Clock,
      iconColor: "text-muted-foreground",
    },
    {
      label: "Tokens Used",
      value: totalTokens >= 1_000_000
        ? `${(totalTokens / 1_000_000).toFixed(1)}M`
        : totalTokens >= 1000
          ? `${(totalTokens / 1000).toFixed(1)}k`
          : String(totalTokens),
      color: "text-foreground",
      icon: Bot,
      iconColor: "text-info",
    },
    {
      label: "Est. Cost",
      value: formatCostUSD(totalCost > 0 ? totalCost : null),
      color: "text-foreground",
      icon: Activity,
      iconColor: "text-muted-foreground",
    },
    {
      label: "Error Rate (24h)",
      value: `${globalErrorRate.toFixed(1)}%`,
      color: globalErrorRate > 10 ? "text-destructive" : globalErrorRate > 5 ? "text-warning" : "text-success",
      icon: AlertTriangle,
      iconColor: globalErrorRate > 10 ? "text-destructive" : globalErrorRate > 5 ? "text-warning" : "text-success",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-border/50 bg-card/50 px-4 py-3.5 flex items-center gap-3"
        >
          <div className={cn("rounded-lg bg-muted/60 p-2", card.iconColor)}>
            <card.icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className={cn("text-lg font-bold tabular-nums leading-tight", card.color)}>
              {card.value}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface ExecutionsTabProps {
  liveExecutions: LiveExecutionsData | null;
  agentMetrics: AgentMetrics[] | null;
  dlqMessages: DLQMessage[];
  onRefresh: () => Promise<void>;
}

export function ExecutionsTab({ liveExecutions, agentMetrics, dlqMessages, onRefresh }: ExecutionsTabProps) {
  const dlqCounts = countDLQByDomain(dlqMessages);

  const handleStopExecution = async (id: string) => {
    await api.post(`/internal/actions/executions/${id}/stop`);
    await onRefresh();
  };

  const handleRetryDLQ = (count: number) => retryDLQBatch(count, onRefresh);

  return (
    <div className="space-y-6">
      {/* Summary Strip */}
      <ExecutionsSummary liveExecutions={liveExecutions} agentMetrics={agentMetrics} />

      {/* Active Executions */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-success" />
            <h2 className="text-base font-semibold">Active Executions</h2>
          </div>
          {liveExecutions && liveExecutions.total_active > 0 && (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success tabular-nums">
              {liveExecutions.total_active}
            </span>
          )}
        </div>
        {liveExecutions ? (
          <ExecutionTable
            rows={liveExecutions.active}
            emptyMessage="No active executions right now."
            onStopExecution={handleStopExecution}
            showCost
          />
        ) : (
          <div className="rounded-xl border border-border/50 bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Loading executions...
          </div>
        )}
      </section>

      {/* Recent Executions */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Recent Executions</h2>
          <span className="text-xs text-muted-foreground">last hour</span>
        </div>
        {liveExecutions ? (
          <ExecutionTable
            rows={liveExecutions.recent}
            emptyMessage="No completed executions in the last hour."
            showCost
          />
        ) : (
          <div className="rounded-xl border border-border/50 bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        )}
      </section>

      {/* Agent Performance */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Bot className="h-4 w-4 text-info" />
          <h2 className="text-base font-semibold">Agent Performance</h2>
          <span className="text-xs text-muted-foreground">24h</span>
        </div>
        {agentMetrics ? (
          <AgentPerformanceTable agents={agentMetrics} />
        ) : (
          <div className="rounded-xl border border-border/50 bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        )}
      </section>

      {/* Execution DLQ */}
      <CollapsibleSection
        title="Execution DLQ"
        badge={
          dlqCounts.executions > 0 ? (
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
              {dlqCounts.executions}
            </span>
          ) : undefined
        }
      >
        <DLQSection
          dlqMessages={dlqMessages}
          domain="executions"
          onRetryBatch={handleRetryDLQ}
        />
      </CollapsibleSection>
    </div>
  );
}
