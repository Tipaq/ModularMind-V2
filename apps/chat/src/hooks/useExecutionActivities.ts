import { useCallback, useRef, useState } from "react";
import type { TraceStreamEvent, StepStreamEvent } from "@modularmind/api-client";

export type ActivityType =
  | "step"
  | "llm"
  | "tool"
  | "retrieval"
  | "parallel"
  | "loop"
  | "error"
  | "routing"
  | "delegation"
  | "direct_response"
  | "agent_created";

export type ActivityStatus = "running" | "completed" | "failed";

export interface ToolCallData {
  toolName: string;
  serverName?: string;
  args?: string;
  result?: string;
}

export interface ExecutionActivity {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  label: string;
  detail?: string;
  preview?: string;
  startedAt: number;
  durationMs?: number;
  toolData?: ToolCallData;
  agentName?: string;
  isEphemeral?: boolean;
  model?: string;
  tools?: string[];
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\u2026";
}

function completeLastRunning(
  prev: ExecutionActivity[],
  type: ActivityType,
  patch: Partial<ExecutionActivity>,
): ExecutionActivity[] {
  const idx = [...prev]
    .reverse()
    .findIndex((a) => a.type === type && a.status === "running");
  if (idx === -1) return prev;
  const realIdx = prev.length - 1 - idx;
  const updated = [...prev];
  updated[realIdx] = {
    ...updated[realIdx],
    status: "completed",
    durationMs: patch.durationMs ?? Date.now() - updated[realIdx].startedAt,
    ...patch,
  };
  return updated;
}

/** SSE trace event from the execution stream — re-exported from api-client. */
export type SSETraceEvent = TraceStreamEvent | StepStreamEvent;

export function useExecutionActivities() {
  const [activities, setActivities] = useState<ExecutionActivity[]>([]);
  const seqRef = useRef(0);

  const reset = useCallback(() => {
    setActivities([]);
    seqRef.current = 0;
  }, []);

  const finalize = useCallback(() => {
    setActivities((prev) =>
      prev.map((a) =>
        a.status === "running"
          ? { ...a, status: "completed" as const, durationMs: Date.now() - a.startedAt }
          : a,
      ),
    );
  }, []);

  const handleEvent = useCallback((data: SSETraceEvent) => {
    const eventType = data?.type as string | undefined;
    if (!eventType) return;

    // --- LLM ---
    if (eventType === "trace:llm_start") {
      const id = `llm-${++seqRef.current}`;
      let detail: string | undefined;
      if (data.message_count) detail = `${data.message_count} messages`;
      setActivities((prev) => [
        ...prev,
        {
          id,
          type: "llm",
          status: "running",
          label: `Calling ${data.model || "LLM"}`,
          detail,
          preview: data.prompt_preview ? truncate(data.prompt_preview, 120) : undefined,
          startedAt: Date.now(),
        },
      ]);
      return;
    }
    if (eventType === "trace:llm_end") {
      let detail: string | undefined;
      if (data.tokens) {
        const parts: string[] = [];
        if (data.tokens.total) parts.push(`${data.tokens.total} tokens`);
        if (data.tokens.prompt && data.tokens.completion)
          parts.push(`${data.tokens.prompt}\u2192${data.tokens.completion}`);
        detail = parts.join(" \u00b7 ");
      }
      setActivities((prev) =>
        completeLastRunning(prev, "llm", {
          durationMs: data.duration_ms,
          detail,
          preview: data.response_preview ? truncate(data.response_preview, 150) : undefined,
        }),
      );
      return;
    }

    // --- Tool ---
    if (eventType === "trace:tool_start") {
      const id = `tool-${++seqRef.current}`;
      const rawName = data.tool_name || "tool";
      const displayName = rawName.includes("__") ? rawName.split("__").slice(1).join("__") : rawName;
      const serverHint = rawName.includes("__") ? rawName.split("__")[0] : undefined;
      setActivities((prev) => [
        ...prev,
        {
          id,
          type: "tool",
          status: "running",
          label: `Running ${displayName}`,
          preview: data.input_preview ? truncate(data.input_preview, 120) : undefined,
          startedAt: Date.now(),
          toolData: {
            toolName: displayName,
            serverName: data.server_name || serverHint,
            args: data.input_preview,
          },
        },
      ]);
      return;
    }
    if (eventType === "trace:tool_end") {
      setActivities((prev) => {
        const idx = [...prev].reverse().findIndex((a) => a.type === "tool" && a.status === "running");
        if (idx === -1) return prev;
        const realIdx = prev.length - 1 - idx;
        const updated = [...prev];
        const existing = updated[realIdx];
        updated[realIdx] = {
          ...existing,
          status: "completed",
          durationMs: data.duration_ms ?? Date.now() - existing.startedAt,
          preview: data.output_preview ? truncate(data.output_preview, 150) : existing.preview,
          toolData: { ...existing.toolData!, result: data.output_preview },
        };
        return updated;
      });
      return;
    }

    // --- Retrieval ---
    if (eventType === "trace:retrieval") {
      if (data.status === "started") {
        const id = `rag-${++seqRef.current}`;
        setActivities((prev) => [
          ...prev,
          {
            id,
            type: "retrieval",
            status: "running",
            label: "Searching documents",
            detail: data.query ? `"${truncate(data.query, 60)}"` : undefined,
            startedAt: Date.now(),
          },
        ]);
      } else if (data.status === "completed") {
        setActivities((prev) =>
          completeLastRunning(prev, "retrieval", {
            durationMs: data.duration_ms,
            detail: data.num_results != null ? `${data.num_results} results` : undefined,
          }),
        );
      }
      return;
    }

    // --- Node / Step ---
    if (eventType === "trace:node_start") {
      const id = `node-${++seqRef.current}`;
      setActivities((prev) => [
        ...prev,
        { id, type: "step", status: "running", label: data.node_name || "Processing", startedAt: Date.now() },
      ]);
      return;
    }
    if (eventType === "trace:node_end") {
      setActivities((prev) => completeLastRunning(prev, "step", { durationMs: data.duration_ms }));
      return;
    }

    // --- Parallel ---
    if (eventType === "trace:parallel_start") {
      const id = `par-${++seqRef.current}`;
      setActivities((prev) => [
        ...prev,
        {
          id,
          type: "parallel",
          status: "running",
          label: "Parallel execution",
          detail: data.branch_count ? `${data.branch_count} branches` : undefined,
          startedAt: Date.now(),
        },
      ]);
      return;
    }
    if (eventType === "trace:parallel_end") {
      setActivities((prev) => completeLastRunning(prev, "parallel", { durationMs: data.duration_ms }));
      return;
    }

    // --- Loop ---
    if (eventType === "trace:loop_start") {
      const id = `loop-${++seqRef.current}`;
      setActivities((prev) => [
        ...prev,
        {
          id,
          type: "loop",
          status: "running",
          label: `Loop${data.mode === "batch" ? " (batch)" : ""}`,
          detail: data.total_items != null ? `${data.total_items} items` : undefined,
          startedAt: Date.now(),
        },
      ]);
      return;
    }
    if (eventType === "trace:loop_end") {
      setActivities((prev) => completeLastRunning(prev, "loop", { durationMs: data.duration_ms }));
      return;
    }

    // --- Supervisor routing ---
    if (eventType === "trace:supervisor_routing") {
      const id = `route-${++seqRef.current}`;
      setActivities((prev) => [
        ...prev,
        { id, type: "routing", status: "running", label: "Analyzing request", startedAt: Date.now() },
      ]);
      return;
    }
    if (eventType === "trace:supervisor_routed") {
      setActivities((prev) =>
        completeLastRunning(prev, "routing", { durationMs: data.duration_ms, detail: data.strategy || undefined }),
      );
      return;
    }
    if (eventType === "trace:supervisor_delegate") {
      const id = `delegate-${++seqRef.current}`;
      setActivities((prev) => [
        ...prev,
        {
          id,
          type: "delegation",
          status: "running",
          label: `Delegating to ${data.agent_name || "agent"}`,
          detail: data.is_ephemeral ? "ephemeral" : undefined,
          startedAt: Date.now(),
          isEphemeral: data.is_ephemeral,
          agentName: data.agent_name,
        },
      ]);
      return;
    }
    if (eventType === "trace:supervisor_delegate_end") {
      setActivities((prev) => completeLastRunning(prev, "delegation", { durationMs: data.duration_ms }));
      return;
    }
    if (eventType === "trace:supervisor_direct") {
      const id = `direct-${++seqRef.current}`;
      setActivities((prev) => [
        ...prev,
        {
          id,
          type: "direct_response",
          status: "completed",
          label: "Direct response",
          preview: data.preview ? truncate(data.preview, 150) : undefined,
          startedAt: Date.now(),
          durationMs: data.duration_ms || 0,
        },
      ]);
      return;
    }
    if (eventType === "trace:agent_created") {
      const id = `created-${++seqRef.current}`;
      setActivities((prev) => [
        ...prev,
        {
          id,
          type: "agent_created",
          status: "completed",
          label: `Created agent: ${data.agent_name || "ephemeral"}`,
          startedAt: Date.now(),
          durationMs: data.duration_ms || 0,
        },
      ]);
      return;
    }

    // --- Step events (execution) ---
    if (eventType === "step" && data.event === "step_started") {
      const id = `step-${++seqRef.current}`;
      const agentName = data.agent_name;
      const label = agentName
        ? `${agentName}${data.is_ephemeral ? " (ephemeral)" : ""}`
        : "Agent executing";
      setActivities((prev) => [
        ...prev,
        { id, type: "step", status: "running", label, startedAt: Date.now(), agentName },
      ]);
      return;
    }
    if (eventType === "step" && data.event === "step_completed") {
      setActivities((prev) => completeLastRunning(prev, "step", { durationMs: data.duration_ms }));
      return;
    }

    // --- Errors ---
    if (eventType === "trace:error") {
      const id = `err-${++seqRef.current}`;
      setActivities((prev) => [
        ...prev,
        {
          id,
          type: "error",
          status: "failed",
          label: `${data.error || "An error occurred"}`,
          startedAt: Date.now(),
          durationMs: data.duration_ms || undefined,
        },
      ]);
      return;
    }
  }, []);

  return { activities, handleEvent, reset, finalize } as const;
}
