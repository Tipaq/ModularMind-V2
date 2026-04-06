"use client";

import { useCallback, useRef, useState } from "react";
import type { ExecutionActivity } from "../types/chat";
import { completeLastRunning } from "../lib/activity-tree";
import {
  handleLlmStart, handleLlmEnd,
  handleToolStart, handleToolEnd,
  handleRetrieval,
  handleSupervisorEvents, handleStepEvents,
  handleCompactionEvents, handleErrorEvents,
} from "../lib/activity-handlers";

export function useExecutionActivities() {
  const [activities, setActivities] = useState<ExecutionActivity[]>([]);
  const seqRef = useRef(0);
  const currentAgentIdRef = useRef<string | null>(null);
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
      if (base.children?.length) return { ...base, children: base.children.map(completeIfRunning) };
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

    if (eventType === "trace:llm_start") { handleLlmStart(data, agentParent, seqRef, setActivities); return; }
    if (eventType === "trace:llm_end") { handleLlmEnd(data, agentParent, setActivities); return; }
    if (eventType === "trace:tool_start") { handleToolStart(data, agentParent, seqRef, setActivities); return; }
    if (eventType === "trace:tool_end") { handleToolEnd(data, agentParent, setActivities); return; }
    if (eventType === "trace:retrieval") { handleRetrieval(data, seqRef, setActivities); return; }

    if (eventType === "trace:graph_start") {
      const id = `graph-${++seqRef.current}`;
      currentGraphIdRef.current = id;
      setActivities((prev) => [...prev, {
        id, type: "graph_execution", status: "running",
        label: (data.graph_name as string) || "Graph",
        graphName: data.graph_name as string | undefined,
        nodeCount: data.node_count as number | undefined,
        startedAt: Date.now(), children: [],
      }]);
      return;
    }
    if (eventType === "trace:graph_end") {
      const completeRunning = (a: ExecutionActivity): ExecutionActivity => {
        const base = a.status === "running"
          ? { ...a, status: "completed" as const, durationMs: Date.now() - a.startedAt }
          : a;
        if (base.children?.length) return { ...base, children: base.children.map(completeRunning) };
        return base;
      };
      setActivities((prev) => {
        const idx = prev.findLastIndex((a) => a.type === "graph_execution" && a.status === "running");
        if (idx === -1) return prev;
        const updated = [...prev];
        const graph = updated[idx];
        updated[idx] = {
          ...graph,
          status: "completed",
          durationMs: Date.now() - graph.startedAt,
          children: graph.children?.map(completeRunning),
        };
        return updated;
      });
      currentGraphIdRef.current = null;
      return;
    }
    if (eventType === "trace:node_start") {
      const id = `node-${++seqRef.current}`;
      setActivities((prev) => [...prev, { id, type: "step", status: "running", label: (data.node_name as string) || "Processing", startedAt: Date.now() }]);
      return;
    }
    if (eventType === "trace:node_end") {
      setActivities((prev) => completeLastRunning(prev, "step", { durationMs: data.duration_ms as number | undefined }));
      return;
    }
    if (eventType === "trace:parallel_start") {
      const id = `par-${++seqRef.current}`;
      setActivities((prev) => [...prev, { id, type: "parallel", status: "running", label: "Parallel execution", detail: data.branch_count ? `${data.branch_count} branches` : undefined, startedAt: Date.now(), branchCount: data.branch_count as number | undefined }]);
      return;
    }
    if (eventType === "trace:parallel_end") {
      setActivities((prev) => completeLastRunning(prev, "parallel", { durationMs: data.duration_ms as number | undefined }));
      return;
    }
    if (eventType === "trace:loop_start") {
      const id = `loop-${++seqRef.current}`;
      setActivities((prev) => [...prev, { id, type: "loop", status: "running", label: `Loop${data.mode === "batch" ? " (batch)" : ""}`, detail: data.total_items != null ? `${data.total_items} items` : undefined, startedAt: Date.now(), loopMode: data.mode as string | undefined, loopItems: data.total_items as number | undefined }]);
      return;
    }
    if (eventType === "trace:loop_end") {
      setActivities((prev) => completeLastRunning(prev, "loop", { durationMs: data.duration_ms as number | undefined }));
      return;
    }

    handleSupervisorEvents(eventType, data, seqRef, currentAgentIdRef, setActivities);
    handleStepEvents(eventType, data, seqRef, currentAgentIdRef, currentGraphIdRef, setActivities);
    handleErrorEvents(eventType, data, seqRef, setActivities);
    handleCompactionEvents(eventType, data, seqRef, setActivities);
  }, []);

  return { activities, handleEvent, reset, finalize } as const;
}
