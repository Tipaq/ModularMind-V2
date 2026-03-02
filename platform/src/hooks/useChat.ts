"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useExecutionActivities } from "./useExecutionActivities";
import type { ExecutionActivity } from "./useExecutionActivities";

export type { ExecutionActivity, ActivityType, ActivityStatus, ToolCallData } from "./useExecutionActivities";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface MemoryEntry {
  id: string;
  content: string;
  scope: string;
  tier: string;
  importance: number;
  memory_type: string;
  category: string;
}

export interface MessageExecutionData {
  activities: ExecutionActivity[];
  memoryEntries: MemoryEntry[];
  tokenUsage: TokenUsage | null;
}

interface SendMessageResponse {
  execution_id?: string;
  message_id?: string;
  stream_url?: string;
  user_message: Message;
  direct_response?: string;
  routing_strategy?: string;
  delegated_to?: string;
  is_ephemeral?: boolean;
  ephemeral_agent?: { id: string; name: string };
  memory_entries?: MemoryEntry[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractResponse(output: any): string {
  if (!output) return "";
  if (typeof output.response === "string") return output.response;
  if (Array.isArray(output.messages)) {
    for (let i = output.messages.length - 1; i >= 0; i--) {
      const m = output.messages[i];
      if (m.type === "ai" && m.content) return m.content;
    }
  }
  if (output.node_outputs && typeof output.node_outputs === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values = Object.values(output.node_outputs) as any[];
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i]?.response) return values[i].response;
    }
  }
  return "";
}

export function useChat(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [executionDataMap, setExecutionDataMap] = useState<Record<string, MessageExecutionData>>({});
  const sourceRef = useRef<EventSource | null>(null);
  const streamBufferRef = useRef("");

  // Refs for accumulating data during a single message exchange
  const currentAssistantIdRef = useRef("");
  const currentExecutionIdRef = useRef("");
  const currentMemoryRef = useRef<MemoryEntry[]>([]);
  const currentTokenUsageRef = useRef<TokenUsage | null>(null);

  const {
    activities,
    handleEvent: handleTraceEvent,
    reset: resetActivities,
    finalize: finalizeActivities,
  } = useExecutionActivities();

  // Snapshot execution data into the map when streaming finishes
  useEffect(() => {
    if (!isStreaming && currentAssistantIdRef.current) {
      const id = currentAssistantIdRef.current;
      const execId = currentExecutionIdRef.current;
      currentAssistantIdRef.current = "";
      currentExecutionIdRef.current = "";
      const data: MessageExecutionData = {
        activities: [...activities],
        memoryEntries: [...currentMemoryRef.current],
        tokenUsage: currentTokenUsageRef.current,
      };
      setExecutionDataMap((prev) => ({ ...prev, [id]: data }));
      // Persist to localStorage so execution data survives hard refresh.
      // Key: mm:exec:<execution_id> for delegated executions,
      //      mm:msg:<message_id>   for direct responses (no execution_id).
      if (execId) {
        try {
          localStorage.setItem(`mm:exec:${execId}`, JSON.stringify(data));
        } catch {
          // Ignore storage errors (quota exceeded, etc.)
        }
      }
    }
  }, [isStreaming, activities]);

  // Safety net: auto-restore any loaded message that has execution_id (delegated)
  // or that matches a mm:msg:<id> localStorage key (direct response).
  // Runs whenever messages change — handles hard refresh + any load path.
  const restoredMsgIdsRef = useRef(new Set<string>());
  useEffect(() => {
    const toRestore: Record<string, MessageExecutionData> = {};
    for (const msg of messages) {
      if (msg.role !== "assistant" || restoredMsgIdsRef.current.has(msg.id)) continue;
      restoredMsgIdsRef.current.add(msg.id);
      try {
        // Delegated execution: key = mm:exec:<execution_id>
        const execId = msg.metadata?.execution_id as string | undefined;
        if (execId) {
          const stored = localStorage.getItem(`mm:exec:${execId}`);
          if (stored) { toRestore[msg.id] = JSON.parse(stored) as MessageExecutionData; continue; }
        }
        // Direct response: key = mm:exec:<message_id> (message_id used as execId at save time)
        const stored = localStorage.getItem(`mm:exec:${msg.id}`);
        if (stored) { toRestore[msg.id] = JSON.parse(stored) as MessageExecutionData; }
      } catch {
        // Ignore parse/storage errors
      }
    }
    if (Object.keys(toRestore).length > 0) {
      setExecutionDataMap((prev) => ({ ...prev, ...toRestore }));
    }
  }, [messages]);

  const setInitialMessages = useCallback((msgs: Message[]) => {
    setMessages(msgs);
    setSelectedMessageId(null);
    restoredMsgIdsRef.current.clear();
    setExecutionDataMap({});
  }, []);

  const sendMessage = useCallback(
    async (content: string, overrideConversationId?: string) => {
      const targetConvId = overrideConversationId || conversationId;
      if (!targetConvId || isStreaming) return;

      setError(null);
      setIsStreaming(true);
      streamBufferRef.current = "";
      resetActivities();
      currentMemoryRef.current = [];
      currentTokenUsageRef.current = null;

      // Optimistically add user message
      const tempUserMsg: Message = {
        id: `temp-${Date.now()}`,
        role: "user",
        content,
        created_at: new Date().toISOString(),
        metadata: {},
      };
      setMessages((prev) => [...prev, tempUserMsg]);

      // Add placeholder assistant message
      const assistantId = `assistant-${Date.now()}`;
      currentAssistantIdRef.current = assistantId;
      setSelectedMessageId(assistantId);
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant" as const, content: "", created_at: new Date().toISOString(), metadata: {} },
      ]);

      handleTraceEvent({ type: "trace:supervisor_routing" });

      const sendStartMs = Date.now();

      // Send message to backend via Platform proxy
      let res: SendMessageResponse;
      try {
        const response = await fetch(`/api/chat/conversations/${targetConvId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: "Failed to send message" }));
          throw new Error(errData.error || errData.detail || "Failed to send message");
        }
        res = await response.json();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        currentAssistantIdRef.current = "";
        setIsStreaming(false);
        return;
      }

      const { execution_id, message_id, user_message, direct_response, routing_strategy, delegated_to, ephemeral_agent, memory_entries: resMemory } = res;

      // Track the stable key for localStorage persistence:
      // - delegated executions: use execution_id
      // - direct responses: use message_id (the persisted assistant message UUID)
      if (execution_id) {
        currentExecutionIdRef.current = execution_id;
      } else if (message_id) {
        currentExecutionIdRef.current = message_id;
      }

      // Capture memory entries for this message
      if (resMemory && resMemory.length > 0) {
        currentMemoryRef.current = resMemory;
      }

      // Replace temp user message with real one
      setMessages((prev) => prev.map((m) => (m.id === tempUserMsg.id ? user_message : m)));

      const routingDurationMs = Date.now() - sendStartMs;

      // Direct response (no execution needed)
      if (!execution_id && direct_response) {
        handleTraceEvent({ type: "trace:supervisor_routed", strategy: routing_strategy || "DIRECT_RESPONSE", duration_ms: routingDurationMs });
        handleTraceEvent({ type: "trace:supervisor_direct", preview: direct_response.slice(0, 150), duration_ms: routingDurationMs });
        const durationMs = routingDurationMs;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: direct_response, metadata: { routing_strategy, delegated_to, duration_ms: durationMs } } : m,
          ),
        );
        finalizeActivities();
        setIsStreaming(false);
        return;
      }

      if (!execution_id) {
        setError("No execution started");
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        currentAssistantIdRef.current = "";
        setIsStreaming(false);
        return;
      }

      // Emit routing traces
      if (routing_strategy) {
        handleTraceEvent({ type: "trace:supervisor_routed", strategy: routing_strategy, duration_ms: routingDurationMs });
        if (ephemeral_agent) {
          handleTraceEvent({ type: "trace:agent_created", agent_name: ephemeral_agent.name });
        }
        if (delegated_to) {
          handleTraceEvent({ type: "trace:supervisor_delegate", agent_name: delegated_to });
        }
      }

      // Connect to SSE stream via Platform proxy
      const source = new EventSource(`/api/chat/executions/${execution_id}/stream`);
      sourceRef.current = source;

      const onEvent = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          handleTraceEvent(data);

          if (data.type === "step") {
            const output = data.output_data || data.output;
            const response = extractResponse(output);
            if (response) {
              streamBufferRef.current = response;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: response } : m)),
              );
            }
          }

          if (data.type === "tokens") {
            const usage = { prompt: data.prompt_tokens || 0, completion: data.completion_tokens || 0, total: data.total_tokens || 0 };
            currentTokenUsageRef.current = usage;
          }

          if (data.type === "complete") {
            const output = data.output_data || data.output;
            const finalContent = extractResponse(output) || streamBufferRef.current;
            if (routing_strategy && delegated_to) {
              handleTraceEvent({ type: "trace:supervisor_delegate_end", duration_ms: data.duration_ms });
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: finalContent, metadata: { execution_id, duration_ms: data.duration_ms, routing_strategy, delegated_to, ...(output || {}) } }
                  : m,
              ),
            );
            finalizeActivities();
            setIsStreaming(false);
            source.close();
          }

          if (data.type === "error") {
            setError(data.message || "Execution error");
            setIsStreaming(false);
            source.close();
          }
        } catch {
          // Ignore parse errors
        }
      };

      source.addEventListener("tokens", onEvent);
      source.addEventListener("trace", onEvent);
      source.addEventListener("step", onEvent);
      source.addEventListener("complete", onEvent);
      source.addEventListener("error", (e) => {
        const me = e as MessageEvent;
        if (me.data) {
          try {
            const data = JSON.parse(me.data);
            setError(data.message || "Execution error");
          } catch {
            setError("Stream connection error");
          }
        }
        setIsStreaming(false);
        source.close();
      });

      source.onerror = () => {
        setIsStreaming(false);
      };
    },
    [conversationId, isStreaming, handleTraceEvent, resetActivities, finalizeActivities],
  );

  const cancelStream = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  // ID of the message currently being streamed (for live activity display)
  const streamingMessageId = isStreaming ? currentAssistantIdRef.current : null;

  return {
    messages,
    isStreaming,
    error,
    activities,
    executionDataMap,
    selectedMessageId,
    setSelectedMessageId,
    streamingMessageId,
    sendMessage,
    setInitialMessages,
    cancelStream,
  };
}
