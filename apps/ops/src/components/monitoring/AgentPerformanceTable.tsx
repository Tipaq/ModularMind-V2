"use client";

import { cn } from "@modularmind/ui";
import type { AgentMetrics } from "@modularmind/api-client";
import { thresholdColor, thresholdBarColor } from "../../lib/monitoringUtils";
import { formatTokensShort, formatDurationMs } from "./ExecutionTable";

export function AgentPerformanceTable({ agents }: { agents: AgentMetrics[] }) {
  const sorted = [...agents].sort((a, b) => b.total_executions - a.total_executions);

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-8 text-center">
        <p className="text-sm text-muted-foreground">No agent execution data in the last 24 hours.</p>
      </div>
    );
  }

  const maxRuns = Math.max(...sorted.map((a) => a.total_executions));

  return (
    <div className="overflow-x-auto rounded-xl border border-border/50 bg-card/50">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 bg-muted/30">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Agent</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Runs</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground min-w-[100px]">Volume</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Tokens</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Avg Duration</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Errors</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground min-w-[120px]">Error Rate</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((agent) => {
            const runsPct = maxRuns > 0 ? (agent.total_executions / maxRuns) * 100 : 0;
            return (
              <tr key={agent.agent_id} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <span className="text-xs font-semibold">{agent.agent_name}</span>
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums font-bold">
                  {agent.total_executions}
                </td>
                <td className="px-4 py-3">
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-primary/60 transition-all"
                      style={{ width: `${runsPct}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                  {formatTokensShort(agent.total_tokens)}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                  {formatDurationMs(agent.avg_duration_ms)}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums">
                  {agent.error_count > 0 ? (
                    <span className="text-destructive font-medium">{agent.error_count}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 w-16 rounded-full bg-muted">
                      <div
                        className={cn("h-1.5 rounded-full transition-all", thresholdBarColor(agent.error_rate, 5, 15))}
                        style={{ width: `${Math.min(agent.error_rate, 100)}%` }}
                      />
                    </div>
                    <span className={cn("text-xs tabular-nums font-medium w-10 text-right", thresholdColor(agent.error_rate, 5, 15))}>
                      {agent.error_rate.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
