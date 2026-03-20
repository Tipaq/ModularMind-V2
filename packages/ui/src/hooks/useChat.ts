"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SendMessageResponse } from "@modularmind/api-client";
import type { ChatMessage } from "../components/chat-messages";
import type { ApprovalRequest } from "../components/approval-card";
import type { KnowledgeData, TokenUsage, ContextData, MessageExecutionData } from "../types/chat";
import type { ChatAdapter } from "./chat-adapter";
import { extractResponse } from "./useChatUtils";
import { useExecutionActivities } from "./useExecutionActivities";
import { mapKnowledgeData, mapContextData } from "../lib/mappers";

export type Message = ChatMessage;

export function useChat(conversationId: string | null, adapter: ChatAdapter) {
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

  // ── Snapshot execution data into the map when streaming finishes ────────
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
      if (execId) {
        try {
          localStorage.setItem(`mm:exec:${execId}`, JSON.stringify(data));
        } catch {
          // Ignore storage errors (quota exceeded, etc.)
        }
      }
    }
  }, [isStreaming, activities]);

  // ── Auto-restore execution data from localStorage on message load ──────
  const restoredMsgIdsRef = useRef(new Set<string>());
  useEffect(() => {
    const toRestore: Record<string, MessageExecutionData> = {};
    for (const msg of messages) {
      if (msg.role !== "assistant" || restoredMsgIdsRef.current.has(msg.id)) continue;
      restoredMsgIdsRef.current.add(msg.id);
      try {
        const execId = msg.metadata?.execution_id as string | undefined;
        if (execId) {
          const stored = localStorage.getItem(`mm:exec:${execId}`);
          if (stored) { toRestore[msg.id] = JSON.parse(stored) as MessageExecutionData; continue; }
        }
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

  // ── Send message ───────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string, overrideConversationId?: string, files?: File[], supervisorMode?: boolean, skipUserMessage?: boolean) => {
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
          const results = await Promise.all(
            files.map((f) => adapter.uploadAttachment(targetConvId, f)),
          );
          attachmentIds = results.map((a) => a.id);
          uploadedAttachments = results;
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to upload attachments");
          setIsStreaming(false);
          return;
        }
      }

      // Optimistically add user message (skip when regenerating)
      let tempUserMsg: Message | null = null;
      if (!skipUserMessage) {
        tempUserMsg = {
          id: `temp-${Date.now()}`,
          role: "user",
          content,
          created_at: new Date().toISOString(),
          metadata: {},
          attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        };
        setMessages((prev) => [...prev, tempUserMsg!]);
      }

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

      // Send message to backend
      const body: { content: string; attachment_ids?: string[] } = { content };
      if (attachmentIds.length > 0) body.attachment_ids = attachmentIds;

      let res: SendMessageResponse;
      try {
        res = await adapter.sendMessage(targetConvId, body);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
        setMessages((prev) => prev.filter((m) => m.id !== assistantId && (!tempUserMsg || m.id !== tempUserMsg.id)));
        currentAssistantIdRef.current = "";
        setIsStreaming(false);
        return;
      }

      const {
        execution_id, message_id, user_message, direct_response,
        routing_strategy, delegated_to, ephemeral_agent,
        knowledge_data: resKnowledge, context_data: resContext,
      } = res;

      // Track the stable key for localStorage persistence
      if (execution_id) {
        currentExecutionIdRef.current = execution_id;
      } else if (message_id) {
        currentExecutionIdRef.current = message_id;
      }

      // Capture context data from HTTP response (supervisor path)
      if (resContext) {
        currentContextDataRef.current = mapContextData(resContext);
      }

      // Capture knowledge data from HTTP response (DIRECT_RESPONSE path)
      if (resKnowledge && resKnowledge.total_results > 0) {
        currentKnowledgeRef.current = mapKnowledgeData(resKnowledge);
      }

      // Replace temp user message with real one
      if (tempUserMsg) {
        setMessages((prev) => prev.map((m) => (m.id === tempUserMsg!.id ? user_message : m)));
      }

      const routingDurationMs = Date.now() - sendStartMs;

      // Direct response (no execution needed)
      if (!execution_id && direct_response) {
        handleTraceEvent({ type: "trace:supervisor_routed", strategy: routing_strategy || "DIRECT_RESPONSE", duration_ms: routingDurationMs });
        handleTraceEvent({ type: "trace:supervisor_direct", preview: direct_response.slice(0, 150), duration_ms: routingDurationMs });
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

      // Connect to SSE stream
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }

      const streamUrl = adapter.getStreamUrl(execution_id);
      const source = new EventSource(streamUrl, adapter.eventSourceInit);
      sourceRef.current = source;

      const cleanup = () => {
        source.removeEventListener("tokens", onEvent);
        source.removeEventListener("trace", onEvent);
        source.removeEventListener("step", onEvent);
        source.removeEventListener("complete", onEvent);
        source.removeEventListener("error", onError);
        source.close();
        if (sourceRef.current === source) {
          sourceRef.current = null;
        }
      };

      const onEvent = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const eventType: string = data.type || "";

          handleTraceEvent(data);

          // Approval gate events
          if (eventType === "step" && data.event === "approval_required") {
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

          if (eventType === "step" && data.event === "approval_granted") {
            setApprovalDecision("approved");
            setPendingApproval(null);
            return;
          }

          if (eventType === "step") {
            const output = data.output_data || data.output;
            const response = extractResponse(output);
            if (response) {
              streamBufferRef.current = response;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: response } : m)),
              );
            }
          }

          if (eventType === "trace:knowledge") {
            currentKnowledgeRef.current = mapKnowledgeData(data);
            // Flush live knowledge data so UI updates during streaming
            setExecutionDataMap((prev) => ({
              ...prev,
              [assistantId]: {
                ...(prev[assistantId] || { activities: [], knowledgeData: null, tokenUsage: null, contextData: null }),
                knowledgeData: currentKnowledgeRef.current,
              },
            }));
          }

          if (eventType === "trace:memory") {
            currentContextDataRef.current = mapContextData(data);
            // Flush live context data so UI updates during streaming
            setExecutionDataMap((prev) => ({
              ...prev,
              [assistantId]: {
                ...(prev[assistantId] || { activities: [], knowledgeData: null, tokenUsage: null, contextData: null }),
                contextData: currentContextDataRef.current,
              },
            }));
          }

          if (eventType === "tokens") {
            currentTokenUsageRef.current = {
              prompt: data.prompt_tokens || 0,
              completion: data.completion_tokens || 0,
              total: data.total_tokens || 0,
            };
          }

          if (eventType === "complete") {
            const output = data.output_data || data.output;

            // Cancelled execution — remove placeholder assistant message
            if (data.status === "stopped") {
              setMessages((prev) => prev.filter((m) => m.id !== assistantId));
              currentAssistantIdRef.current = "";
              currentExecutionIdRef.current = "";
              finalizeActivities();
              setIsStreaming(false);
              cleanup();
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
            cleanup();
          }

          if (eventType === "error") {
            setError(data.message || "Execution error");
            setIsStreaming(false);
            cleanup();
          }
        } catch {
          // Ignore parse errors
        }
      };

      const onError = (e: Event) => {
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
        cleanup();
      };

      source.addEventListener("tokens", onEvent);
      source.addEventListener("trace", onEvent);
      source.addEventListener("step", onEvent);
      source.addEventListener("complete", onEvent);
      source.addEventListener("error", onError);

      source.onerror = () => {
        setIsStreaming(false);
      };
    },
    [conversationId, isStreaming, adapter, handleTraceEvent, resetActivities, finalizeActivities],
  );

  // ── Cancel stream ──────────────────────────────────────────────────────

  const cancelStream = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }

    const execId = currentExecutionIdRef.current;
    if (execId) {
      adapter.stopExecution(execId).catch(() => {});
      currentExecutionIdRef.current = "";
    }

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && !last.content) {
        return prev.slice(0, -1);
      }
      return prev;
    });

    currentAssistantIdRef.current = "";
    setIsStreaming(false);
  }, [adapter]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };
  }, []);

  // ── Approval actions ───────────────────────────────────────────────────

  const approveExecution = useCallback(async (executionId: string) => {
    await adapter.approveExecution(executionId);
    setApprovalDecision("approved");
    setPendingApproval(null);
  }, [adapter]);

  const rejectExecution = useCallback(async (executionId: string) => {
    await adapter.rejectExecution(executionId);
    setApprovalDecision("rejected");
    setPendingApproval(null);
  }, [adapter]);

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (isStreaming || !conversationId) return;
    const msgIdx = messages.findIndex((m) => m.id === messageId);
    if (msgIdx === -1) return;

    await adapter.deleteMessagesFrom(conversationId, messageId).catch(() => {});
    setMessages((prev) => prev.slice(0, msgIdx));
    sendMessage(newContent, conversationId, undefined, undefined, false);
  }, [isStreaming, conversationId, messages, adapter, sendMessage]);

  const regenerateLastMessage = useCallback(async () => {
    if (isStreaming || !conversationId) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    await adapter.deleteMessagesFrom(conversationId, lastAssistant.id).catch(() => {});
    setMessages((prev) => prev.filter((m) => m.id !== lastAssistant.id));
    sendMessage(lastUserMsg.content, conversationId, undefined, undefined, true);
  }, [isStreaming, conversationId, messages, adapter, sendMessage]);

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
    regenerateLastMessage,
    editMessage,
  };
}
