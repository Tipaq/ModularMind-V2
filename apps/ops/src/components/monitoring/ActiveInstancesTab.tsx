"use client";

import type { AgentMetrics, LiveExecutionsData } from "@modularmind/api-client";
import { ExecutionTable } from "./ExecutionTable";
import { AgentPerformanceTable } from "./AgentPerformanceTable";

// Re-export for backward compatibility
export { ExecutionTable } from "./ExecutionTable";
export { AgentPerformanceTable } from "./AgentPerformanceTable";

// ─── Tab (kept for backward compatibility) ──────────────────────────────────

interface Props {
  liveExecutions: LiveExecutionsData | null;
  agentMetrics: AgentMetrics[] | null;
}

export function ActiveInstancesTab({ liveExecutions, agentMetrics }: Props) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 text-lg font-semibold">Agent Performance — 24h</h2>
        {agentMetrics === null ? (
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <AgentPerformanceTable agents={agentMetrics} />
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-semibold">Active</h2>
          {liveExecutions && (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
              {liveExecutions.total_active}
            </span>
          )}
        </div>
        {!liveExecutions ? (
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <ExecutionTable
            rows={liveExecutions.active}
            emptyMessage="No active executions right now."
          />
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Recent — last hour</h2>
        {!liveExecutions ? (
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <ExecutionTable
            rows={liveExecutions.recent}
            emptyMessage="No completed executions in the last hour."
          />
        )}
      </section>
    </div>
  );
}
