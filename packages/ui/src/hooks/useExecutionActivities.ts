"use client";

import { useCallback, useRef, useState } from "react";
import type { ActivityType, ExecutionActivity } from "../types/chat";

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

/**
 * Shared hook that converts SSE trace events into a list of ExecutionActivity items.
 *
 * The `handleEvent` callback accepts a permissive `Record<string, unknown>` so
 * that it works in both the chat app (which has typed SSE events from api-client)
 * and the platform app (which uses plain JSON objects).
 */
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEvent = useCallback((data: Record<string, any>) => {
    const eventType = data?.type as string | undefined;
    if (!eventType) return;

    // --- LLM ---
    if (eventType === "trace:llm_start") {
      const id = `llm-${++seqRef.current}`;
      const model = (data.model as string) || "LLM";
      let detail: string | undefined;
      if (data.message_count) detail = `${data.message_count} messages`;
      setActivities((prev) => [
        ...prev,
        {
          id,
          type: "llm",
          status: "running",
          label: `Calling ${model}`,
          detail,
          model,
          preview: data.prompt_preview ? truncate(data.prompt_preview as string, 120) : undefined,
          startedAt: Date.now(),
          llmData: {
            model,
            messageCount: data.message_count as number | undefined,
            messageTypes: data.message_types as Record<string, number> | undefined,
          },
        },
      ]);
      return;
    }
    if (eventType === "trace:llm_end") {
      setActivities((prev) => {
        const idx = [...prev].reverse().findIndex((a) => a.type === "llm" && a.status === "running");
        if (idx === -1) return prev;
        const realIdx = prev.length - 1 - idx;
        const updated = [...prev];
        const existing = updated[realIdx];

        const tokens = data.tokens as { prompt: number; completion: number; total: number } | undefined;
        let detail: string | undefined;
        if (tokens) {
          const parts: string[] = [];
          if (tokens.total) parts.push(`${tokens.total} tokens`);
          if (tokens.prompt && tokens.completion)
            parts.push(`${tokens.prompt}\u2192${tokens.completion}`);
          detail = parts.join(" \u00b7 ");
        }

        updated[realIdx] = {
          ...existing,
          status: "completed",
          durationMs: (data.duration_ms as number | undefined) ?? Date.now() - existing.startedAt,
          detail,
          preview: data.response_preview ? truncate(data.response_preview as string, 150) : existing.preview,
          llmData: {
            ...existing.llmData!,
            tokens: tokens ? { ...tokens, estimated: data.tokens_estimated as boolean | undefined } : undefined,
            responsePreview: data.response_preview ? truncate(data.response_preview as string, 300) : undefined,
          },
        };
        return updated;
      });
      return;
    }

    // --- Tool ---
    if (eventType === "trace:tool_start") {
      const id = `tool-${++seqRef.current}`;
      const rawName = (data.tool_name as string) || "tool";
      const displayName = rawName.includes("__") ? rawName.split("__").slice(1).join("__") : rawName;
      const serverHint = rawName.includes("__") ? rawName.split("__")[0] : undefined;
      setActivities((prev) => [
        ...prev,
        {
          id,
          type: "tool",
          status: "running",
          label: `Running ${displayName}`,
          preview: data.input_preview ? truncate(data.input_preview as string, 120) : undefined,
          startedAt: Date.now(),
          toolData: {
            toolName: displayName,
            serverName: (data.server_name as string) || serverHint,
            args: data.input_preview as string | undefined,
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
          durationMs: (data.duration_ms as number | undefined) ?? Date.now() - existing.startedAt,
          preview: data.output_preview ? truncate(data.output_preview as string, 150) : existing.preview,
          toolData: { ...existing.toolData!, result: data.output_preview as string | undefined },
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
            detail: data.query ? `"${truncate(data.query as string, 60)}"` : undefined,
            startedAt: Date.now(),
            query: data.query ? truncate(data.query as string, 120) : undefined,
          },
        ]);
      } else if (data.status === "completed") {
        setActivities((prev) =>
          completeLastRunning(prev, "retrieval", {
            durationMs: data.duration_ms as number | undefined,
            detail: data.num_results != null ? `${data.num_results} results` : undefined,
            numResults: data.num_results as number | undefined,
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
        { id, type: "step", status: "running", label: (data.node_name as string) || "Processing", startedAt: Date.now() },
      ]);
      return;
    }
    if (eventType === "trace:node_end") {
      setActivities((prev) => completeLastRunning(prev, "step", { durationMs: data.duration_ms as number | undefined }));
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
          branchCount: data.branch_count as number | undefined,
        },
      ]);
      return;
    }
    if (eventType === "trace:parallel_end") {
      setActivities((prev) => completeLastRunning(prev, "parallel", { durationMs: data.duration_ms as number | undefined }));
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
          loopMode: data.mode as string | undefined,
          loopItems: data.total_items as number | undefined,
        },
      ]);
      return;
    }
    if (eventType === "trace:loop_end") {
      setActivities((prev) => completeLastRunning(prev, "loop", { durationMs: data.duration_ms as number | undefined }));
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
        completeLastRunning(prev, "routing", {
          durationMs: data.duration_ms as number | undefined,
          detail: (data.strategy as string) || undefined,
          routingData: {
            strategy: (data.strategy as string) || "unknown",
            reasoning: data.reasoning as string | undefined,
            confidence: data.confidence as number | undefined,
            targetAgent: data.agent_name as string | undefined,
            targetGraph: data.graph_name as string | undefined,
          },
        }),
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
          isEphemeral: data.is_ephemeral as boolean | undefined,
          agentName: data.agent_name as string | undefined,
        },
      ]);
      return;
    }
    if (eventType === "trace:supervisor_delegate_end") {
      setActivities((prev) => completeLastRunning(prev, "delegation", { durationMs: data.duration_ms as number | undefined }));
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
          preview: data.preview ? truncate(data.preview as string, 150) : undefined,
          startedAt: Date.now(),
          durationMs: (data.duration_ms as number) || 0,
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
          agentName: data.agent_name as string | undefined,
          startedAt: Date.now(),
          durationMs: (data.duration_ms as number) || 0,
        },
      ]);
      return;
    }

    // --- Step events (execution) ---
    if (eventType === "step" && data.event === "step_started") {
      const id = `step-${++seqRef.current}`;
      const agentName = data.agent_name as string | undefined;
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
      setActivities((prev) => completeLastRunning(prev, "step", { durationMs: data.duration_ms as number | undefined }));
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
          durationMs: (data.duration_ms as number) || undefined,
          errorData: {
            errorType: data.error_type as string | undefined,
            step: data.step as string | undefined,
          },
        },
      ]);
      return;
    }
  }, []);

  return { activities, handleEvent, reset, finalize } as const;
}
