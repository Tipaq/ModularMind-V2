import type { ExecutionActivity } from "../types/chat";
import { truncate, completeLastRunning, appendChild, updateChildDeep } from "./activity-tree";

type SetActivities = React.Dispatch<React.SetStateAction<ExecutionActivity[]>>;
type SeqRef = React.MutableRefObject<number>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventData = Record<string, any>;

export function handleLlmStart(data: EventData, agentParent: string | null, seqRef: SeqRef, setActivities: SetActivities) {
  const id = `llm-${++seqRef.current}`;
  const model = (data.model as string) || "LLM";
  const activity: ExecutionActivity = {
    id, type: "llm", status: "running", label: `Calling ${model}`,
    detail: data.message_count ? `${data.message_count} messages` : undefined,
    model, preview: data.prompt_preview ? truncate(data.prompt_preview as string, 120) : undefined,
    startedAt: Date.now(),
    llmData: {
      model, messageCount: data.message_count as number | undefined,
      messageTypes: data.message_types as Record<string, number> | undefined,
      messages: data.messages as { role: string; content: string }[] | undefined,
    },
  };
  if (agentParent) setActivities((prev) => appendChild(prev, agentParent, activity));
  else setActivities((prev) => [...prev, activity]);
}

export function handleLlmEnd(data: EventData, agentParent: string | null, setActivities: SetActivities) {
  const tokens = data.tokens as { prompt: number; completion: number; total: number } | undefined;
  let detail: string | undefined;
  if (tokens) {
    const parts: string[] = [];
    if (tokens.total) parts.push(`${tokens.total} tokens`);
    if (tokens.prompt && tokens.completion) parts.push(`${tokens.prompt}\u2192${tokens.completion}`);
    detail = parts.join(" \u00b7 ");
  }
  const llmEndData: Partial<ExecutionActivity["llmData"]> = {
    tokens: tokens ? { ...tokens, estimated: data.tokens_estimated as boolean | undefined } : undefined,
    responsePreview: data.response_preview ? truncate(data.response_preview as string, 300) : undefined,
  };
  if (data.model) llmEndData.model = data.model as string;
  const patch: Partial<ExecutionActivity> = {
    durationMs: data.duration_ms as number | undefined, detail,
    preview: data.response_preview ? truncate(data.response_preview as string, 150) : undefined,
  };
  if (agentParent) {
    setActivities((prev) => updateChildDeep(prev, agentParent, "llm", (c) => ({
      ...c, status: "completed", durationMs: patch.durationMs ?? Date.now() - c.startedAt, ...patch, llmData: { ...c.llmData!, ...llmEndData },
    })));
  } else {
    setActivities((prev) => {
      const realIdx = prev.findLastIndex((a) => a.type === "llm" && a.status === "running");
      if (realIdx === -1) return prev;
      const updated = [...prev];
      const existing = updated[realIdx];
      updated[realIdx] = { ...existing, status: "completed", durationMs: patch.durationMs ?? Date.now() - existing.startedAt, ...patch, llmData: { ...existing.llmData!, ...llmEndData } };
      return updated;
    });
  }
}

export function handleToolStart(data: EventData, agentParent: string | null, seqRef: SeqRef, setActivities: SetActivities) {
  const id = `tool-${++seqRef.current}`;
  const rawName = (data.tool_name as string) || "tool";
  const stripped = rawName.includes("__") ? rawName.split("__").slice(1).join("__") : rawName;
  const displayName = stripped.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const serverHint = rawName.includes("__") ? rawName.split("__")[0] : undefined;
  const activity: ExecutionActivity = {
    id, type: "tool", status: "running", label: `Running ${displayName}`,
    preview: data.input_preview ? truncate(data.input_preview as string, 120) : undefined,
    startedAt: Date.now(),
    toolData: { toolName: displayName, serverName: (data.server_name as string) || serverHint, args: data.input_preview as string | undefined },
  };
  if (agentParent) setActivities((prev) => appendChild(prev, agentParent, activity));
  else setActivities((prev) => [...prev, activity]);
}

export function handleToolEnd(data: EventData, agentParent: string | null, setActivities: SetActivities) {
  if (agentParent) {
    setActivities((prev) => updateChildDeep(prev, agentParent, "tool", (c) => ({
      ...c, status: "completed", durationMs: (data.duration_ms as number | undefined) ?? Date.now() - c.startedAt,
      preview: data.output_preview ? truncate(data.output_preview as string, 150) : c.preview,
      toolData: { ...c.toolData!, result: data.output_preview as string | undefined },
    })));
  } else {
    setActivities((prev) => {
      const realIdx = prev.findLastIndex((a) => a.type === "tool" && a.status === "running");
      if (realIdx === -1) return prev;
      const updated = [...prev];
      const existing = updated[realIdx];
      updated[realIdx] = {
        ...existing, status: "completed",
        durationMs: (data.duration_ms as number | undefined) ?? Date.now() - existing.startedAt,
        preview: data.output_preview ? truncate(data.output_preview as string, 150) : existing.preview,
        toolData: { ...existing.toolData!, result: data.output_preview as string | undefined },
      };
      return updated;
    });
  }
}

export function handleRetrieval(data: EventData, seqRef: SeqRef, setActivities: SetActivities) {
  if (data.status === "started") {
    const id = `rag-${++seqRef.current}`;
    setActivities((prev) => [...prev, {
      id, type: "retrieval", status: "running", label: "Searching documents",
      detail: data.query ? `"${truncate(data.query as string, 60)}"` : undefined,
      startedAt: Date.now(), query: data.query ? truncate(data.query as string, 120) : undefined,
    }]);
  } else if (data.status === "completed") {
    setActivities((prev) => completeLastRunning(prev, "retrieval", {
      durationMs: data.duration_ms as number | undefined,
      detail: data.num_results != null ? `${data.num_results} results` : undefined,
      numResults: data.num_results as number | undefined,
    }));
  }
}

export function handleSupervisorEvents(
  eventType: string, data: EventData, seqRef: SeqRef,
  currentAgentIdRef: React.MutableRefObject<string | null>, setActivities: SetActivities,
) {
  if (eventType === "trace:supervisor_routing") {
    const id = `route-${++seqRef.current}`;
    setActivities((prev) => [...prev, { id, type: "routing", status: "running", label: "Supervisor", startedAt: Date.now() }]);
    return;
  }
  if (eventType === "trace:supervisor_routed") {
    setActivities((prev) => completeLastRunning(prev, "routing", {
      durationMs: data.duration_ms as number | undefined, detail: (data.strategy as string) || undefined,
      routingData: { strategy: (data.strategy as string) || "unknown", reasoning: data.reasoning as string | undefined, confidence: data.confidence as number | undefined, targetAgent: data.agent_name as string | undefined, targetGraph: data.graph_name as string | undefined },
    }));
    return;
  }
  if (eventType === "trace:supervisor_delegate") {
    const id = `agent-${++seqRef.current}`;
    currentAgentIdRef.current = id;
    setActivities((prev) => [...prev, { id, type: "agent_execution", status: "running", label: (data.agent_name as string) || "Agent", detail: data.is_ephemeral ? "ephemeral" : undefined, startedAt: Date.now(), isEphemeral: data.is_ephemeral as boolean | undefined, agentName: data.agent_name as string | undefined, children: [], toolCallCount: 0, llmCallCount: 0, iterationCount: 0 }]);
    return;
  }
  if (eventType === "trace:supervisor_delegate_end") {
    setActivities((prev) => {
      const idx = prev.findLastIndex((a) => a.type === "agent_execution" && a.status === "running");
      if (idx === -1) return completeLastRunning(prev, "delegation", { durationMs: data.duration_ms as number | undefined });
      const updated = [...prev];
      const agent = updated[idx];
      const children = agent.children || [];
      updated[idx] = { ...agent, status: "completed", durationMs: (data.duration_ms as number | undefined) ?? Date.now() - agent.startedAt, toolCallCount: children.filter((c) => c.type === "tool").length, llmCallCount: children.filter((c) => c.type === "llm").length };
      return updated;
    });
    currentAgentIdRef.current = null;
    return;
  }
  if (eventType === "trace:supervisor_direct") {
    const id = `direct-${++seqRef.current}`;
    setActivities((prev) => [...prev, { id, type: "direct_response", status: "completed", label: "Direct response", preview: data.preview ? truncate(data.preview as string, 150) : undefined, startedAt: Date.now(), durationMs: (data.duration_ms as number) || 0 }]);
    return;
  }
  if (eventType === "trace:agent_created") {
    const id = `created-${++seqRef.current}`;
    setActivities((prev) => [...prev, { id, type: "agent_created", status: "completed", label: `Created agent: ${data.agent_name || "ephemeral"}`, agentName: data.agent_name as string | undefined, startedAt: Date.now(), durationMs: (data.duration_ms as number) || 0 }]);
  }
}

export function handleStepEvents(
  eventType: string, data: EventData, seqRef: SeqRef,
  currentAgentIdRef: React.MutableRefObject<string | null>,
  currentGraphIdRef: React.MutableRefObject<string | null>,
  setActivities: SetActivities,
) {
  if (eventType === "step" && data.event === "step_started") {
    if (data.raw_mode) return;
    const agentName = data.agent_name as string | undefined;
    const inputPrompt = data.input_prompt as string | undefined;
    const model = data.model as string | undefined;
    const nodeId = data.node_id as string | undefined;
    const graphParent = currentGraphIdRef.current;
    const existingAgentId = currentAgentIdRef.current;
    if (existingAgentId) {
      setActivities((prev) => {
        if (graphParent) {
          return prev.map((a) => {
            if (a.id !== graphParent) return a;
            return { ...a, children: (a.children || []).map((c) => c.id === existingAgentId ? { ...c, inputPrompt, model, nodeId: nodeId ?? c.nodeId, agentName: agentName ?? c.agentName } : c) };
          });
        }
        return prev.map((a) => a.id === existingAgentId ? { ...a, inputPrompt, model, nodeId: nodeId ?? a.nodeId, agentName: agentName ?? a.agentName } : a);
      });
    } else {
      const id = `agent-${++seqRef.current}`;
      currentAgentIdRef.current = id;
      const agentActivity: ExecutionActivity = { id, type: "agent_execution", status: "running", label: agentName || "Agent executing", startedAt: Date.now(), agentName, inputPrompt, model, nodeId, children: [], toolCallCount: 0, llmCallCount: 0, iterationCount: 0 };
      setActivities((prev) => graphParent ? appendChild(prev, graphParent, agentActivity) : [...prev, agentActivity]);
    }
    return;
  }
  if (eventType === "step" && data.event === "step_completed") {
    if (data.raw_mode) return;
    const agentResponse = data.agent_response as string | undefined;
    const inputPrompt = data.input_prompt as string | undefined;
    const graphParent = currentGraphIdRef.current;
    currentAgentIdRef.current = null;
    setActivities((prev) => {
      if (graphParent) {
        return prev.map((a) => {
          if (a.id !== graphParent) return a;
          const children = [...(a.children || [])];
          const idx = children.findLastIndex((c) => c.type === "agent_execution" && c.status === "running");
          if (idx === -1) return a;
          const agent = children[idx];
          const agentChildren = agent.children || [];
          children[idx] = { ...agent, status: "completed", durationMs: (data.duration_ms as number | undefined) ?? Date.now() - agent.startedAt, agentResponse, inputPrompt: inputPrompt ?? agent.inputPrompt, toolCallCount: agentChildren.filter((c) => c.type === "tool").length, llmCallCount: agentChildren.filter((c) => c.type === "llm").length };
          return { ...a, children };
        });
      }
      const idx = prev.findLastIndex((a) => a.type === "agent_execution" && a.status === "running");
      if (idx === -1) return completeLastRunning(prev, "step", { durationMs: data.duration_ms as number | undefined });
      const updated = [...prev];
      const agent = updated[idx];
      const children = agent.children || [];
      updated[idx] = { ...agent, status: "completed", durationMs: (data.duration_ms as number | undefined) ?? Date.now() - agent.startedAt, agentResponse, toolCallCount: children.filter((c) => c.type === "tool").length, llmCallCount: children.filter((c) => c.type === "llm").length };
      return updated;
    });
  }
}

export function handleCompactionEvents(eventType: string, data: EventData, seqRef: SeqRef, setActivities: SetActivities) {
  if (eventType === "trace:compaction_start") {
    const id = `compact-${++seqRef.current}`;
    setActivities((prev) => [...prev, { id, type: "compaction", status: "running", label: "Compacting history", detail: data.message_count ? `${data.message_count} messages` : undefined, startedAt: Date.now() }]);
    return;
  }
  if (eventType === "trace:compaction_end") {
    setActivities((prev) => completeLastRunning(prev, "compaction", {
      durationMs: data.duration_ms as number | undefined,
      detail: data.compacted_count ? `${data.compacted_count} messages compacted` : (data.error as string) || undefined,
    }));
  }
}

export function handleErrorEvents(eventType: string, data: EventData, seqRef: SeqRef, setActivities: SetActivities) {
  if (eventType === "trace:error") {
    const id = `err-${++seqRef.current}`;
    setActivities((prev) => [...prev, {
      id, type: "error", status: "failed", label: `${data.error || "An error occurred"}`,
      startedAt: Date.now(), durationMs: (data.duration_ms as number) || undefined,
      errorData: { errorType: data.error_type as string | undefined, step: data.step as string | undefined },
    }]);
  }
}
