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
  const realIdx = prev.findLastIndex((a) => a.type === type && a.status === "running");
  if (realIdx === -1) return prev;
  const updated = [...prev];
  updated[realIdx] = {
    ...updated[realIdx],
    status: "completed",
    durationMs: patch.durationMs ?? Date.now() - updated[realIdx].startedAt,
    ...patch,
  };
  return updated;
}

/** Append a child activity to a parent by ID (searches top-level and inside graph children). */
function appendChild(
  prev: ExecutionActivity[],
  parentId: string,
  child: ExecutionActivity,
): ExecutionActivity[] {
  return prev.map((a) => {
    if (a.id === parentId) {
      return { ...a, children: [...(a.children || []), child] };
    }
    // Search inside graph_execution children for nested agent_execution
    if (a.type === "graph_execution" && a.children?.some((c) => c.id === parentId)) {
      return {
        ...a,
        children: a.children!.map((c) =>
          c.id === parentId
            ? { ...c, children: [...(c.children || []), child] }
            : c,
        ),
      };
    }
    return a;
  });
}

/**
 * Update the last running child of `childType` inside `parentId`.
 * Searches top-level and inside graph_execution children (for graph→agent→llm/tool).
 */
function updateChildDeep(
  prev: ExecutionActivity[],
  parentId: string,
  childType: ActivityType,
  updater: (child: ExecutionActivity) => ExecutionActivity,
): ExecutionActivity[] {
  return prev.map((a) => {
    // Direct parent match
    if (a.id === parentId) {
      const children = [...(a.children || [])];
      const idx = children.findLastIndex((c) => c.type === childType && c.status === "running");
      if (idx === -1) return a;
      children[idx] = updater(children[idx]);
      return { ...a, children };
    }
    // Inside graph_execution children
    if (a.type === "graph_execution" && a.children?.some((c) => c.id === parentId)) {
      return {
        ...a,
        children: a.children!.map((c) => {
          if (c.id !== parentId) return c;
          const children = [...(c.children || [])];
          const idx = children.findLastIndex((ch) => ch.type === childType && ch.status === "running");
          if (idx === -1) return c;
          children[idx] = updater(children[idx]);
          return { ...c, children };
        }),
      };
    }
    return a;
  });
}

/**
 * Shared hook that converts SSE trace events into a hierarchical list of
 * ExecutionActivity items.
 *
 * Agent execution activities (type "agent_execution") have nested `children`
 * arrays containing their tool and LLM call activities.
 */
export function useExecutionActivities() {
  const [activities, setActivities] = useState<ExecutionActivity[]>([]);
  const seqRef = useRef(0);
  /** ID of the currently active agent_execution whose children we append to. */
  const currentAgentIdRef = useRef<string | null>(null);
  /** ID of the currently active graph_execution whose children we append to. */
  const currentGraphIdRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setActivities([]);
    seqRef.current = 0;
    currentAgentIdRef.current = null;
    currentGraphIdRef.current = null;
  }, []);

  const finalize = useCallback(() => {
    const completeIfRunning = (a: ExecutionActivity): ExecutionActivity => {
      const base = a.status === "running"
        ? { ...a, status: "completed" as const, durationMs: Date.now() - a.startedAt }
        : a;
      if (base.children?.length) {
        return { ...base, children: base.children.map(completeIfRunning) };
      }
      return base;
    };
    setActivities((prev) => prev.map(completeIfRunning));
    currentAgentIdRef.current = null;
    currentGraphIdRef.current = null;
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEvent = useCallback((data: Record<string, any>) => {
    const eventType = data?.type as string | undefined;
    if (!eventType) return;

    const agentParent = currentAgentIdRef.current;

    // --- LLM ---
    if (eventType === "trace:llm_start") {
      const id = `llm-${++seqRef.current}`;
      const model = (data.model as string) || "LLM";
      let detail: string | undefined;
      if (data.message_count) detail = `${data.message_count} messages`;
      const activity: ExecutionActivity = {
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
          messages: data.messages as { role: string; content: string }[] | undefined,
        },
      };
      if (agentParent) {
        setActivities((prev) => appendChild(prev, agentParent, activity));
      } else {
        setActivities((prev) => [...prev, activity]);
      }
      return;
    }
    if (eventType === "trace:llm_end") {
      const tokens = data.tokens as { prompt: number; completion: number; total: number } | undefined;
      let detail: string | undefined;
      if (tokens) {
        const parts: string[] = [];
        if (tokens.total) parts.push(`${tokens.total} tokens`);
        if (tokens.prompt && tokens.completion)
          parts.push(`${tokens.prompt}\u2192${tokens.completion}`);
        detail = parts.join(" \u00b7 ");
      }
      const llmEndData: Partial<ExecutionActivity["llmData"]> = {
        tokens: tokens ? { ...tokens, estimated: data.tokens_estimated as boolean | undefined } : undefined,
        responsePreview: data.response_preview ? truncate(data.response_preview as string, 300) : undefined,
      };
      if (data.model) llmEndData.model = data.model as string;

      const patch: Partial<ExecutionActivity> = {
        durationMs: data.duration_ms as number | undefined,
        detail,
        preview: data.response_preview ? truncate(data.response_preview as string, 150) : undefined,
      };
      if (agentParent) {
        setActivities((prev) =>
          updateChildDeep(prev, agentParent, "llm", (c) => ({
            ...c,
            status: "completed",
            durationMs: patch.durationMs ?? Date.now() - c.startedAt,
            ...patch,
            llmData: { ...c.llmData!, ...llmEndData },
          })),
        );
      } else {
        setActivities((prev) => {
          const realIdx = prev.findLastIndex((a) => a.type === "llm" && a.status === "running");
          if (realIdx === -1) return prev;
          const updated = [...prev];
          const existing = updated[realIdx];
          updated[realIdx] = {
            ...existing,
            status: "completed",
            durationMs: patch.durationMs ?? Date.now() - existing.startedAt,
            ...patch,
            llmData: { ...existing.llmData!, ...llmEndData },
          };
          return updated;
        });
      }
      return;
    }

    // --- Tool ---
    if (eventType === "trace:tool_start") {
      const id = `tool-${++seqRef.current}`;
      const rawName = (data.tool_name as string) || "tool";
      const stripped = rawName.includes("__") ? rawName.split("__").slice(1).join("__") : rawName;
      const displayName = stripped
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const serverHint = rawName.includes("__") ? rawName.split("__")[0] : undefined;
      const activity: ExecutionActivity = {
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
      };
      if (agentParent) {
        setActivities((prev) => appendChild(prev, agentParent, activity));
      } else {
        setActivities((prev) => [...prev, activity]);
      }
      return;
    }
    if (eventType === "trace:tool_end") {
      const patch: Partial<ExecutionActivity> = {
        durationMs: data.duration_ms as number | undefined,
        preview: data.output_preview ? truncate(data.output_preview as string, 150) : undefined,
        toolData: {
          toolName: "",
          result: data.output_preview as string | undefined,
        },
      };
      if (agentParent) {
        setActivities((prev) =>
          updateChildDeep(prev, agentParent, "tool", (c) => ({
            ...c,
            status: "completed",
            durationMs: patch.durationMs ?? Date.now() - c.startedAt,
            preview: patch.preview ?? c.preview,
            toolData: { ...c.toolData!, result: data.output_preview as string | undefined },
          })),
        );
      } else {
        setActivities((prev) => {
          const realIdx = prev.findLastIndex((a) => a.type === "tool" && a.status === "running");
          if (realIdx === -1) return prev;
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
      }
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

    // --- Graph ---
    if (eventType === "trace:graph_start") {
      const id = `graph-${++seqRef.current}`;
      currentGraphIdRef.current = id;
      setActivities((prev) => [
        ...prev,
        {
          id,
          type: "graph_execution",
          status: "running",
          label: (data.graph_name as string) || "Graph",
          graphName: data.graph_name as string | undefined,
          nodeCount: data.node_count as number | undefined,
          startedAt: Date.now(),
          children: [],
        },
      ]);
      return;
    }
    if (eventType === "trace:graph_end") {
      setActivities((prev) => {
        const idx = prev.findLastIndex((a) => a.type === "graph_execution" && a.status === "running");
        if (idx === -1) return prev;
        const updated = [...prev];
        const graph = updated[idx];
        updated[idx] = {
          ...graph,
          status: "completed",
          durationMs: Date.now() - graph.startedAt,
        };
        return updated;
      });
      currentGraphIdRef.current = null;
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
        { id, type: "routing", status: "running", label: "Supervisor", startedAt: Date.now() },
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

    // --- Supervisor delegate → create agent_execution ---
    if (eventType === "trace:supervisor_delegate") {
      const id = `agent-${++seqRef.current}`;
      currentAgentIdRef.current = id;
      setActivities((prev) => [
        ...prev,
        {
          id,
          type: "agent_execution",
          status: "running",
          label: (data.agent_name as string) || "Agent",
          detail: data.is_ephemeral ? "ephemeral" : undefined,
          startedAt: Date.now(),
          isEphemeral: data.is_ephemeral as boolean | undefined,
          agentName: data.agent_name as string | undefined,
          children: [],
          toolCallCount: 0,
          llmCallCount: 0,
          iterationCount: 0,
        },
      ]);
      return;
    }
    if (eventType === "trace:supervisor_delegate_end") {
      // Complete agent_execution (backup — step_completed usually handles this)
      setActivities((prev) => {
        const idx = prev.findLastIndex((a) => a.type === "agent_execution" && a.status === "running");
        if (idx === -1) return completeLastRunning(prev, "delegation", { durationMs: data.duration_ms as number | undefined });
        const updated = [...prev];
        const agent = updated[idx];
        const children = agent.children || [];
        updated[idx] = {
          ...agent,
          status: "completed",
          durationMs: (data.duration_ms as number | undefined) ?? Date.now() - agent.startedAt,
          toolCallCount: children.filter((c) => c.type === "tool").length,
          llmCallCount: children.filter((c) => c.type === "llm").length,
        };
        return updated;
      });
      currentAgentIdRef.current = null;
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

    // --- Context compaction ---
    if (eventType === "trace:compaction_start") {
      const id = `compact-${++seqRef.current}`;
      setActivities((prev) => [
        ...prev,
        {
          id,
          type: "compaction",
          status: "running",
          label: "Compacting history",
          detail: data.message_count ? `${data.message_count} messages` : undefined,
          startedAt: Date.now(),
        },
      ]);
      return;
    }
    if (eventType === "trace:compaction_end") {
      setActivities((prev) =>
        completeLastRunning(prev, "compaction", {
          durationMs: data.duration_ms as number | undefined,
          detail: data.compacted_count
            ? `${data.compacted_count} messages compacted`
            : (data.error as string) || undefined,
        }),
      );
      return;
    }

    // --- Step events (execution) ---
    if (eventType === "step" && data.event === "step_started") {
      // Raw LLM mode — skip agent_execution wrapper, LLM calls appear top-level
      if (data.raw_mode) return;

      const agentName = data.agent_name as string | undefined;
      const inputPrompt = data.input_prompt as string | undefined;
      const model = data.model as string | undefined;
      const nodeId = data.node_id as string | undefined;
      const graphParent = currentGraphIdRef.current;
      const existingAgentId = currentAgentIdRef.current;

      if (existingAgentId) {
        // Enrich existing agent_execution (from supervisor_delegate)
        setActivities((prev) => {
          if (graphParent) {
            return prev.map((a) => {
              if (a.id !== graphParent) return a;
              return {
                ...a,
                children: (a.children || []).map((c) =>
                  c.id === existingAgentId
                    ? { ...c, inputPrompt, model, nodeId: nodeId ?? c.nodeId, agentName: agentName ?? c.agentName }
                    : c,
                ),
              };
            });
          }
          return prev.map((a) =>
            a.id === existingAgentId
              ? { ...a, inputPrompt, model, nodeId: nodeId ?? a.nodeId, agentName: agentName ?? a.agentName }
              : a,
          );
        });
      } else {
        // No supervisor — create agent_execution
        // Set ref BEFORE setActivities so subsequent events see it immediately
        const id = `agent-${++seqRef.current}`;
        currentAgentIdRef.current = id;
        const agentActivity: ExecutionActivity = {
          id,
          type: "agent_execution",
          status: "running",
          label: agentName || "Agent executing",
          startedAt: Date.now(),
          agentName,
          inputPrompt,
          model,
          nodeId,
          children: [],
          toolCallCount: 0,
          llmCallCount: 0,
          iterationCount: 0,
        };
        setActivities((prev) => {
          if (graphParent) {
            return appendChild(prev, graphParent, agentActivity);
          }
          return [...prev, agentActivity];
        });
      }
      return;
    }
    if (eventType === "step" && data.event === "step_completed") {
      // Raw LLM mode — no agent_execution to complete
      if (data.raw_mode) return;

      const agentResponse = data.agent_response as string | undefined;
      const inputPrompt = data.input_prompt as string | undefined;
      const graphParent = currentGraphIdRef.current;

      // Reset ref BEFORE setActivities so subsequent events don't target stale agent
      currentAgentIdRef.current = null;

      setActivities((prev) => {
        if (graphParent) {
          // Complete agent_execution inside graph
          return prev.map((a) => {
            if (a.id !== graphParent) return a;
            const children = [...(a.children || [])];
            const idx = children.findLastIndex((c) => c.type === "agent_execution" && c.status === "running");
            if (idx === -1) return a;
            const agent = children[idx];
            const agentChildren = agent.children || [];
            children[idx] = {
              ...agent,
              status: "completed",
              durationMs: (data.duration_ms as number | undefined) ?? Date.now() - agent.startedAt,
              agentResponse,
              inputPrompt: inputPrompt ?? agent.inputPrompt,
              toolCallCount: agentChildren.filter((c) => c.type === "tool").length,
              llmCallCount: agentChildren.filter((c) => c.type === "llm").length,
            };
            return { ...a, children };
          });
        }
        const idx = prev.findLastIndex((a) => a.type === "agent_execution" && a.status === "running");
        if (idx === -1) return completeLastRunning(prev, "step", { durationMs: data.duration_ms as number | undefined });
        const updated = [...prev];
        const agent = updated[idx];
        const children = agent.children || [];
        updated[idx] = {
          ...agent,
          status: "completed",
          durationMs: (data.duration_ms as number | undefined) ?? Date.now() - agent.startedAt,
          agentResponse,
          toolCallCount: children.filter((c) => c.type === "tool").length,
          llmCallCount: children.filter((c) => c.type === "llm").length,
        };
        return updated;
      });
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
