import { useCallback, useRef, useState } from "react";
import { api } from "../lib/api";
import { useExecutionActivities } from "./useExecutionActivities";
import { useRightPanel } from "./useRightPanel";

export type { ExecutionActivity, ActivityType, ActivityStatus, ToolCallData } from "./useExecutionActivities";
export type {
  SupervisorData,
  KnowledgeData,
  KnowledgeCollection,
  KnowledgeChunk,
  MemoryEntry,
  RightPanelState,
} from "./useRightPanel";

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

interface SendMessageResponse {
  execution_id?: string;
  user_message: Message;
  direct_response?: string;
  routing_strategy?: string;
  delegated_to?: string;
  is_ephemeral?: boolean;
  ephemeral_agent?: { id: string; name: string };
  memory_entries?: Array<{
    id: string;
    content: string;
    scope: string;
    tier: string;
    importance: number;
    memory_type: string;
    category: string;
  }>;
}

interface ExecutionOutput {
  response?: string;
  messages?: Array<{ type: string; content?: string }>;
  node_outputs?: Record<string, { response?: string }>;
}

function extractResponse(output: ExecutionOutput | null | undefined): string {
  if (!output) return "";
  if (typeof output.response === "string") return output.response;
  if (Array.isArray(output.messages)) {
    for (let i = output.messages.length - 1; i >= 0; i--) {
      const m = output.messages[i];
      if (m.type === "ai" && m.content) return m.content;
    }
  }
  if (output.node_outputs && typeof output.node_outputs === "object") {
    const values = Object.values(output.node_outputs);
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
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const streamBufferRef = useRef("");

  const {
    activities,
    handleEvent: handleTraceEvent,
    reset: resetActivities,
    finalize: finalizeActivities,
  } = useExecutionActivities();

  const {
    panelState,
    resetPanel,
    setSupervisorData,
    setMemoryEntries,
    setKnowledgeLoading,
    handlePanelEvent,
  } = useRightPanel();

  const setInitialMessages = useCallback((msgs: Message[]) => {
    setMessages(msgs);
  }, []);

  const sendMessage = useCallback(
    async (content: string, overrideConversationId?: string) => {
      const targetConvId = overrideConversationId || conversationId;
      if (!targetConvId || isStreaming) return;

      setError(null);
      setIsStreaming(true);
      streamBufferRef.current = "";
      resetActivities();
      resetPanel();

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
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant" as const, content: "", created_at: new Date().toISOString(), metadata: {} },
      ]);

      handleTraceEvent({ type: "trace:supervisor_routing" });

      const sendStartMs = Date.now();

      // Send message to backend
      let res: SendMessageResponse;
      try {
        res = await api.post<SendMessageResponse>(`/conversations/${targetConvId}/messages`, { content });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        setIsStreaming(false);
        return;
      }

      const { execution_id, user_message, direct_response, routing_strategy, delegated_to, is_ephemeral, ephemeral_agent, memory_entries } = res;

      // Replace temp user message with real one
      setMessages((prev) => prev.map((m) => (m.id === tempUserMsg.id ? user_message : m)));

      // Populate right panel with supervisor + memory data
      setSupervisorData({
        routingStrategy: routing_strategy || null,
        delegatedTo: delegated_to || null,
        isEphemeral: is_ephemeral || false,
        ephemeralAgent: ephemeral_agent || null,
      });
      if (memory_entries?.length) {
        setMemoryEntries(
          memory_entries.map((e) => ({
            id: e.id,
            content: e.content,
            scope: e.scope,
            tier: e.tier,
            importance: e.importance,
            memoryType: e.memory_type,
            category: e.category,
          })),
        );
      }
      if (execution_id) {
        setKnowledgeLoading();
      }

      const routingDurationMs = Date.now() - sendStartMs;

      // Direct response (no execution needed)
      if (!execution_id && direct_response) {
        handleTraceEvent({ type: "trace:supervisor_routed", strategy: routing_strategy || "DIRECT_RESPONSE", duration_ms: routingDurationMs });
        handleTraceEvent({ type: "trace:supervisor_direct", preview: direct_response.slice(0, 150), duration_ms: routingDurationMs });
        const durationMs = Date.now() - sendStartMs;
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

      // Connect to SSE stream
      const source = new EventSource(`/api/v1/executions/${execution_id}/stream`, { withCredentials: true });
      sourceRef.current = source;

      const onEvent = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          handleTraceEvent(data);
          handlePanelEvent(data);

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
            setTokenUsage({ prompt: data.prompt_tokens || 0, completion: data.completion_tokens || 0, total: data.total_tokens || 0 });
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
    [conversationId, isStreaming, handleTraceEvent, resetActivities, finalizeActivities, resetPanel, setSupervisorData, setMemoryEntries, setKnowledgeLoading, handlePanelEvent],
  );

  const cancelStream = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  return {
    messages,
    isStreaming,
    error,
    tokenUsage,
    activities,
    panelState,
    sendMessage,
    setInitialMessages,
    cancelStream,
  };
}
