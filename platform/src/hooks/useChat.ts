"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useExecutionActivities } from "./useExecutionActivities";
import type { ExecutionActivity } from "./useExecutionActivities";

export type { ExecutionActivity, ActivityType, ActivityStatus, ToolCallData } from "./useExecutionActivities";

import type { ChatMessage } from "@modularmind/ui";

export type Message = ChatMessage;

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

export interface KnowledgeCollection {
  collectionId: string;
  collectionName: string;
  chunkCount: number;
}

export interface KnowledgeChunk {
  chunkId: string;
  documentId: string;
  collectionId: string;
  collectionName: string;
  documentFilename: string | null;
  contentPreview: string;
  score: number;
  chunkIndex: number;
}

export interface KnowledgeData {
  collections: KnowledgeCollection[];
  chunks: KnowledgeChunk[];
  totalResults: number;
}

export interface ContextHistoryMessage {
  role: string;
  content: string;
}

export interface ContextHistoryBudget {
  includedCount: number;
  maxMessages: number;
  totalChars: number;
  maxChars: number;
  budgetExceeded: boolean;
  contextWindow?: number;
  historyBudgetPct?: number;
  historyBudgetTokens?: number;
}

export interface ContextHistory {
  budget: ContextHistoryBudget | null;
  messages: ContextHistoryMessage[];
  summary: string;
}

export interface BudgetLayerInfo {
  pct: number;
  allocated: number;
  used: number;
}

export interface BudgetOverview {
  contextWindow: number;
  effectiveContext: number;
  maxPct: number;
  layers: {
    history: BudgetLayerInfo;
    memory: BudgetLayerInfo;
    rag: BudgetLayerInfo;
  };
}

export interface ContextData {
  history: ContextHistory | null;
  memoryEntries: MemoryEntry[];
  budgetOverview: BudgetOverview | null;
}

export interface MessageExecutionData {
  activities: ExecutionActivity[];
  memoryEntries: MemoryEntry[];
  knowledgeData: KnowledgeData | null;
  tokenUsage: TokenUsage | null;
  contextData: ContextData | null;
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
  knowledge_data?: {
    collections: { collection_id: string; collection_name: string; chunk_count: number }[];
    chunks: { chunk_id: string; document_id: string; collection_id: string; collection_name: string; document_filename: string | null; content_preview: string; score: number; chunk_index: number }[];
    total_results: number;
  };
  context_data?: {
    history?: {
      budget?: { included_count: number; max_messages: number; total_chars: number; max_chars: number; budget_exceeded: boolean; context_window?: number; history_budget_pct?: number; history_budget_tokens?: number };
      messages?: { role: string; content: string }[];
      summary?: string;
    };
    memory_entries?: MemoryEntry[];
    budget_overview?: {
      context_window: number;
      effective_context: number;
      max_pct: number;
      layers: {
        history: { pct: number; allocated: number; used: number };
        memory: { pct: number; allocated: number; used: number };
        rag: { pct: number; allocated: number; used: number };
      };
    };
  };
}

interface OutputData {
  response?: string;
  messages?: { type: string; content?: string }[];
  node_outputs?: Record<string, { response?: string }>;
}

function extractResponse(output: OutputData | null | undefined): string {
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
      const resp = values[i]?.response;
      if (resp) return resp;
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
  const currentKnowledgeRef = useRef<KnowledgeData | null>(null);
  const currentTokenUsageRef = useRef<TokenUsage | null>(null);
  const currentContextDataRef = useRef<ContextData | null>(null);

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
        knowledgeData: currentKnowledgeRef.current,
        tokenUsage: currentTokenUsageRef.current,
        contextData: currentContextDataRef.current,
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
      currentKnowledgeRef.current = null;
      currentTokenUsageRef.current = null;
      currentContextDataRef.current = null;

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

      const { execution_id, message_id, user_message, direct_response, routing_strategy, delegated_to, ephemeral_agent, memory_entries: resMemory, knowledge_data: resKnowledge, context_data: resContext } = res;

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

      // Capture context data from HTTP response (supervisor path)
      if (resContext) {
        const h = resContext.history;
        const bo = resContext.budget_overview;
        currentContextDataRef.current = {
          history: h ? {
            budget: h.budget ? {
              includedCount: h.budget.included_count,
              maxMessages: h.budget.max_messages,
              totalChars: h.budget.total_chars,
              maxChars: h.budget.max_chars,
              budgetExceeded: h.budget.budget_exceeded,
              contextWindow: h.budget.context_window,
              historyBudgetPct: h.budget.history_budget_pct,
              historyBudgetTokens: h.budget.history_budget_tokens,
            } : null,
            messages: h.messages || [],
            summary: h.summary || "",
          } : null,
          memoryEntries: resContext.memory_entries || [],
          budgetOverview: bo ? {
            contextWindow: bo.context_window,
            effectiveContext: bo.effective_context,
            maxPct: bo.max_pct,
            layers: {
              history: bo.layers.history,
              memory: bo.layers.memory,
              rag: bo.layers.rag,
            },
          } : null,
        };
      }

      // Capture knowledge data from HTTP response (DIRECT_RESPONSE path)
      if (resKnowledge && resKnowledge.total_results > 0) {
        currentKnowledgeRef.current = {
          collections: resKnowledge.collections.map((c) => ({
            collectionId: c.collection_id,
            collectionName: c.collection_name,
            chunkCount: c.chunk_count,
          })),
          chunks: resKnowledge.chunks.map((ch) => ({
            chunkId: ch.chunk_id,
            documentId: ch.document_id,
            collectionId: ch.collection_id,
            collectionName: ch.collection_name,
            documentFilename: ch.document_filename,
            contentPreview: ch.content_preview,
            score: ch.score,
            chunkIndex: ch.chunk_index,
          })),
          totalResults: resKnowledge.total_results,
        };
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

          if (data.type === "trace:knowledge") {
            interface RawCollection { collection_id: string; collection_name: string; chunk_count: number }
            interface RawChunk { chunk_id: string; document_id: string; collection_id: string; collection_name: string; document_filename: string | null; content_preview: string; score: number; chunk_index: number }
            currentKnowledgeRef.current = {
              collections: ((data.collections || []) as RawCollection[]).map(
                (c) => ({
                  collectionId: c.collection_id,
                  collectionName: c.collection_name,
                  chunkCount: c.chunk_count,
                }),
              ),
              chunks: ((data.chunks || []) as RawChunk[]).map(
                (ch) => ({
                  chunkId: ch.chunk_id,
                  documentId: ch.document_id,
                  collectionId: ch.collection_id,
                  collectionName: ch.collection_name,
                  documentFilename: ch.document_filename,
                  contentPreview: ch.content_preview,
                  score: ch.score,
                  chunkIndex: ch.chunk_index,
                }),
              ),
              totalResults: (data.total_results as number) || 0,
            };
          }

          if (data.type === "trace:memory") {
            const h = data.history;
            const bo = data.budget_overview;
            const memEntries = (data.memory_entries || []) as MemoryEntry[];
            currentContextDataRef.current = {
              history: h ? {
                budget: h.budget ? {
                  includedCount: h.budget.included_count ?? 0,
                  maxMessages: h.budget.max_messages ?? 0,
                  totalChars: h.budget.total_chars ?? 0,
                  maxChars: h.budget.max_chars ?? 0,
                  budgetExceeded: h.budget.budget_exceeded ?? false,
                  contextWindow: h.budget.context_window,
                  historyBudgetPct: h.budget.history_budget_pct,
                  historyBudgetTokens: h.budget.history_budget_tokens,
                } : null,
                messages: h.messages || [],
                summary: h.summary || "",
              } : null,
              memoryEntries: memEntries,
              budgetOverview: bo ? {
                contextWindow: bo.context_window,
                effectiveContext: bo.effective_context,
                maxPct: bo.max_pct,
                layers: {
                  history: bo.layers.history,
                  memory: bo.layers.memory,
                  rag: bo.layers.rag,
                },
              } : null,
            };
            // Also populate currentMemoryRef for backward compatibility
            if (memEntries.length > 0) {
              currentMemoryRef.current = memEntries;
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
