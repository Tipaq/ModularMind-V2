import { useCallback, useEffect, useRef, useState } from "react";
import type { Message as ApiMessage, MessageAttachment, SendMessageResponse } from "@modularmind/api-client";
import type { TokenUsage, ApprovalRequest } from "@modularmind/ui";
import { extractResponse } from "@modularmind/ui";
import { api } from "../lib/api";
import { useExecutionActivities } from "@modularmind/ui";
import { useInsightsPanel } from "./useInsightsPanel";

export type { ExecutionActivity, ActivityType, ActivityStatus, ToolCallData } from "@modularmind/ui";
export type {
  SupervisorData,
  KnowledgeData,
  KnowledgeCollection,
  KnowledgeChunk,
  InsightsPanelState,
} from "./useInsightsPanel";
export type { TokenUsage } from "@modularmind/ui";

export type Message = ApiMessage;

export function useChat(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [approvalDecision, setApprovalDecision] = useState<"approved" | "rejected" | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const streamBufferRef = useRef("");
  const executionIdRef = useRef<string | null>(null);

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
    setKnowledgeLoading,
    handlePanelEvent,
  } = useInsightsPanel();

  const setInitialMessages = useCallback((msgs: Message[]) => {
    setMessages(msgs);
  }, []);

  const uploadAttachment = useCallback(
    async (conversationId: string, file: File): Promise<MessageAttachment> => {
      const formData = new FormData();
      formData.append("file", file);
      return api.upload<MessageAttachment>(
        `/conversations/${conversationId}/attachments`,
        formData,
      );
    },
    [],
  );

  const sendMessage = useCallback(
    async (content: string, overrideConversationId?: string, files?: File[]) => {
      const targetConvId = overrideConversationId || conversationId;
      if (!targetConvId || isStreaming) return;

      setError(null);
      setIsStreaming(true);
      streamBufferRef.current = "";
      resetActivities();
      resetPanel();

      // Upload attachments first
      let attachmentIds: string[] = [];
      let uploadedAttachments: MessageAttachment[] = [];
      if (files && files.length > 0) {
        try {
          const results = await Promise.all(
            files.map((f) => uploadAttachment(targetConvId, f)),
          );
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
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant" as const, content: "", created_at: new Date().toISOString(), metadata: {} },
      ]);

      handleTraceEvent({ type: "trace:supervisor_routing" });

      const sendStartMs = Date.now();

      // Send message to backend
      const body: { content: string; attachment_ids?: string[] } = { content };
      if (attachmentIds.length > 0) body.attachment_ids = attachmentIds;

      let res: SendMessageResponse;
      try {
        res = await api.post<SendMessageResponse>(`/conversations/${targetConvId}/messages`, body);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        setIsStreaming(false);
        return;
      }

      const { execution_id, user_message, direct_response, routing_strategy, delegated_to, is_ephemeral, ephemeral_agent } = res;

      // Track execution ID for cancel button
      executionIdRef.current = execution_id || null;

      // Replace temp user message with real one
      setMessages((prev) => prev.map((m) => (m.id === tempUserMsg.id ? user_message : m)));

      // Populate right panel with supervisor + memory data
      setSupervisorData({
        routingStrategy: routing_strategy || null,
        delegatedTo: delegated_to || null,
        isEphemeral: is_ephemeral || false,
        ephemeralAgent: ephemeral_agent || null,
      });
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
      // Close any previous source before opening a new one
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }

      const source = new EventSource(`/api/v1/executions/${execution_id}/stream`, { withCredentials: true });
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
          handlePanelEvent(data);

          // Approval gate events: type="step" + event="approval_required"
          if (eventType === "step" && data.event === "approval_required") {
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

          if (eventType === "step" && data.event === "approval_granted") {
            console.log("[useChat] Approval granted:", data);
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

          if (eventType === "tokens") {
            setTokenUsage({ prompt: data.prompt_tokens || 0, completion: data.completion_tokens || 0, total: data.total_tokens || 0 });
          }

          if (eventType === "complete") {
            executionIdRef.current = null;
            const output = data.output_data || data.output;

            // Cancelled execution — remove placeholder assistant message
            if (data.status === "stopped") {
              setMessages((prev) => prev.filter((m) => m.id !== assistantId));
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
            executionIdRef.current = null;
            setError(data.message || "Execution error");
            setIsStreaming(false);
            cleanup();
          }
        } catch (err) {
          console.error("[useChat] Failed to parse SSE event:", err);
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
    [conversationId, isStreaming, handleTraceEvent, resetActivities, finalizeActivities, resetPanel, setSupervisorData, setKnowledgeLoading, handlePanelEvent],
  );

  const cancelStream = useCallback(() => {
    // Close SSE connection
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }

    // Notify backend to cancel the execution
    const execId = executionIdRef.current;
    if (execId) {
      api.post(`/executions/${execId}/stop`).catch(() => {});
      executionIdRef.current = null;
    }

    // Remove the placeholder assistant message
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && !last.content) {
        return prev.slice(0, -1);
      }
      return prev;
    });

    setIsStreaming(false);
  }, []);

  // Cleanup on unmount: close any active SSE connection
  useEffect(() => {
    return () => {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };
  }, []);

  const approveExecution = useCallback(async (executionId: string) => {
    await api.post(`/executions/${executionId}/approve`);
    setApprovalDecision("approved");
    setPendingApproval(null);
  }, []);

  const rejectExecution = useCallback(async (executionId: string) => {
    await api.post(`/executions/${executionId}/reject`);
    setApprovalDecision("rejected");
    setPendingApproval(null);
  }, []);

  return {
    messages,
    isStreaming,
    error,
    tokenUsage,
    activities,
    panelState,
    pendingApproval,
    approvalDecision,
    sendMessage,
    setInitialMessages,
    cancelStream,
    approveExecution,
    rejectExecution,
  };
}
