"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useExecutionActivities } from "@modularmind/ui";
import type { SendMessageResponse } from "@modularmind/api-client";

export type { ExecutionActivity, ActivityType, ActivityStatus, ToolCallData } from "@modularmind/ui";

import type { ChatMessage, KnowledgeCollection, KnowledgeChunk, KnowledgeData, TokenUsage, ContextData, MessageExecutionData, ApprovalRequest } from "@modularmind/ui";
import { extractResponse, mapKnowledgeData } from "@modularmind/ui";

export type { KnowledgeCollection, KnowledgeChunk, KnowledgeData };
export type { TokenUsage, ContextHistoryMessage, ContextHistoryBudget, ContextHistory, BudgetLayerInfo, BudgetOverview, ContextData, MessageExecutionData } from "@modularmind/ui";

export type Message = ChatMessage;

export function useChat(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [executionDataMap, setExecutionDataMap] = useState<Record<string, MessageExecutionData>>({});
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [approvalDecision, setApprovalDecision] = useState<"approved" | "rejected" | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const streamBufferRef = useRef("");

  // Refs for accumulating data during a single message exchange
  const currentAssistantIdRef = useRef("");
  const currentExecutionIdRef = useRef("");
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

  const uploadAttachment = useCallback(
    async (conversationId: string, file: File): Promise<{ id: string; filename: string; content_type: string; size_bytes: number }> => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/chat/conversations/${conversationId}/attachments`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || err.detail || "Failed to upload attachment");
      }
      return res.json();
    },
    [],
  );

  const sendMessage = useCallback(
    async (content: string, overrideConversationId?: string, files?: File[], supervisorMode?: boolean) => {
      const targetConvId = overrideConversationId || conversationId;
      if (!targetConvId || isStreaming) return;

      setError(null);
      setIsStreaming(true);
      streamBufferRef.current = "";
      resetActivities();
      currentKnowledgeRef.current = null;
      currentTokenUsageRef.current = null;
      currentContextDataRef.current = null;

      // Upload attachments first
      let attachmentIds: string[] = [];
      let uploadedAttachments: { id: string; filename: string; content_type: string; size_bytes: number }[] = [];
      if (files && files.length > 0) {
        try {
          const results = await Promise.all(files.map((f) => uploadAttachment(targetConvId, f)));
          attachmentIds = results.map((a) => a.id);
          uploadedAttachments = results;
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to upload attachments");
          setIsStreaming(false);
          return;
        }
      }

      // Optimistically add user message
      const tempUserMsg: Message = {
        id: `temp-${Date.now()}`,
        role: "user",
        content,
        created_at: new Date().toISOString(),
        metadata: {},
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
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

      if (supervisorMode) {
        handleTraceEvent({ type: "trace:supervisor_routing" });
      }

      const sendStartMs = Date.now();

      // Send message to backend via Platform proxy
      const body: { content: string; attachment_ids?: string[] } = { content };
      if (attachmentIds.length > 0) body.attachment_ids = attachmentIds;

      let res: SendMessageResponse;
      try {
        const response = await fetch(`/api/chat/conversations/${targetConvId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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

      const { execution_id, message_id, user_message, direct_response, routing_strategy, delegated_to, ephemeral_agent, knowledge_data: resKnowledge, context_data: resContext } = res;

      // Track the stable key for localStorage persistence:
      // - delegated executions: use execution_id
      // - direct responses: use message_id (the persisted assistant message UUID)
      if (execution_id) {
        currentExecutionIdRef.current = execution_id;
      } else if (message_id) {
        currentExecutionIdRef.current = message_id;
      }

      // Capture context data from HTTP response (supervisor path)
      if (resContext) {
        const h = resContext.history;
        const bo = resContext.budget_overview;
        currentContextDataRef.current = {
          history: h ? {
            budget: h.budget ? {
              includedCount: h.budget.included_count,
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
          userProfile: resContext.user_profile || null,
          budgetOverview: bo ? {
            contextWindow: bo.context_window,
            effectiveContext: bo.effective_context,
            maxPct: bo.max_pct,
            layers: {
              history: bo.layers.history,
              memory: bo.layers.memory,
              rag: bo.layers.rag,
              ...(bo.layers.system ? { system: bo.layers.system } : {}),
            },
          } : null,
        };
      }

      // Capture knowledge data from HTTP response (DIRECT_RESPONSE path)
      if (resKnowledge && resKnowledge.total_results > 0) {
        currentKnowledgeRef.current = mapKnowledgeData(resKnowledge);
      }

      // Replace temp user message with real one
      setMessages((prev) => prev.map((m) => (m.id === tempUserMsg.id ? user_message : m)));

      const routingDurationMs = Date.now() - sendStartMs;

      // Error fallback: direct_response without execution (e.g. agent not found)
      if (!execution_id && direct_response) {
        handleTraceEvent({ type: "trace:supervisor_routed", strategy: routing_strategy || "DIRECT_RESPONSE", duration_ms: routingDurationMs });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: direct_response, metadata: { routing_strategy, delegated_to, duration_ms: routingDurationMs } } : m,
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

          if (data.type === "step" && data.event === "approval_required") {
            console.log("[useChat] Approval required:", data);
            setPendingApproval({
              executionId: data.execution_id,
              nodeId: data.node_id,
              message: data.message || "Review and approve to continue.",
              plan: data.plan || "",
              timeoutSeconds: data.timeout_seconds || 0,
            });
            setApprovalDecision(null);
            return;
          }

          if (data.type === "step" && data.event === "approval_granted") {
            console.log("[useChat] Approval granted:", data);
            setApprovalDecision("approved");
            setPendingApproval(null);
            return;
          }

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
            currentKnowledgeRef.current = mapKnowledgeData(data);
            // Flush live knowledge data to executionDataMap so UI updates during streaming
            if (assistantId) {
              setExecutionDataMap((prev) => ({
                ...prev,
                [assistantId]: {
                  ...(prev[assistantId] || { activities: [], knowledgeData: null, tokenUsage: null, contextData: null }),
                  knowledgeData: currentKnowledgeRef.current,
                },
              }));
            }
          }

          if (data.type === "trace:memory") {
            const h = data.history;
            const bo = data.budget_overview;
            currentContextDataRef.current = {
              history: h ? {
                budget: h.budget ? {
                  includedCount: h.budget.included_count ?? 0,
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
              userProfile: data.user_profile || null,
              budgetOverview: bo ? {
                contextWindow: bo.context_window,
                effectiveContext: bo.effective_context,
                maxPct: bo.max_pct,
                layers: {
                  history: bo.layers.history,
                  memory: bo.layers.memory,
                  rag: bo.layers.rag,
                  ...(bo.layers.system ? { system: bo.layers.system } : {}),
                },
              } : null,
            };
            // Flush live context data to executionDataMap so UI updates during streaming
            if (assistantId) {
              setExecutionDataMap((prev) => ({
                ...prev,
                [assistantId]: {
                  ...(prev[assistantId] || { activities: [], knowledgeData: null, tokenUsage: null, contextData: null }),
                  contextData: currentContextDataRef.current,
                },
              }));
            }
          }

          if (data.type === "tokens") {
            const usage = { prompt: data.prompt_tokens || 0, completion: data.completion_tokens || 0, total: data.total_tokens || 0 };
            currentTokenUsageRef.current = usage;
          }

          if (data.type === "complete") {
            const output = data.output_data || data.output;

            // Cancelled execution — remove placeholder assistant message
            if (data.status === "stopped") {
              setMessages((prev) => prev.filter((m) => m.id !== assistantId));
              currentAssistantIdRef.current = "";
              currentExecutionIdRef.current = "";
              finalizeActivities();
              setIsStreaming(false);
              source.close();
              return;
            }

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
    [conversationId, isStreaming, handleTraceEvent, resetActivities, finalizeActivities, uploadAttachment],
  );

  // Cleanup on unmount: close any active SSE connection
  useEffect(() => {
    return () => {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };
  }, []);

  const cancelStream = useCallback(() => {
    // Close SSE connection
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }

    // Notify backend to cancel the execution via Platform proxy
    const execId = currentExecutionIdRef.current;
    if (execId) {
      fetch(`/api/chat/executions/${execId}`, { method: "POST" }).catch(() => {});
      currentExecutionIdRef.current = "";
    }

    // Remove the placeholder assistant message
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && !last.content) {
        return prev.slice(0, -1);
      }
      return prev;
    });

    currentAssistantIdRef.current = "";
    setIsStreaming(false);
  }, []);

  const approveExecution = useCallback(async (executionId: string) => {
    await fetch(`/api/chat/executions/${executionId}/approve`, { method: "POST" });
    setApprovalDecision("approved");
    setPendingApproval(null);
  }, []);

  const rejectExecution = useCallback(async (executionId: string) => {
    await fetch(`/api/chat/executions/${executionId}/reject`, { method: "POST" });
    setApprovalDecision("rejected");
    setPendingApproval(null);
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
    pendingApproval,
    approvalDecision,
    sendMessage,
    setInitialMessages,
    cancelStream,
    approveExecution,
    rejectExecution,
  };
}
