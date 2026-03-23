"use client";

import { useCallback } from "react";
import type { SendMessageResponse } from "@modularmind/api-client";
import type { ChatMessage } from "../components/chat-messages";
import type { KnowledgeData, TokenUsage, ContextData, MessageExecutionData } from "../types/chat";
import type { ChatAdapter } from "./chat-adapter";
import { extractResponse } from "./useChatUtils";
import { mapKnowledgeData, mapContextData } from "../lib/mappers";

type Message = ChatMessage;

interface StreamRefs {
  sourceRef: React.MutableRefObject<EventSource | null>;
  streamBufferRef: React.MutableRefObject<string>;
  currentAssistantIdRef: React.MutableRefObject<string>;
  currentExecutionIdRef: React.MutableRefObject<string>;
  currentKnowledgeRef: React.MutableRefObject<KnowledgeData | null>;
  currentTokenUsageRef: React.MutableRefObject<TokenUsage | null>;
  currentContextDataRef: React.MutableRefObject<ContextData | null>;
}

export interface StreamCallbacks {
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setStreamingMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setExecutionDataMap: React.Dispatch<React.SetStateAction<Record<string, MessageExecutionData>>>;
  setPendingApproval: React.Dispatch<React.SetStateAction<import("../components/approval-card").ApprovalRequest | null>>;
  setApprovalDecision: React.Dispatch<React.SetStateAction<"approved" | "rejected" | null>>;
  setPendingPrompt: React.Dispatch<React.SetStateAction<import("../components/prompt-card").HumanPromptRequest | null>>;
  handleTraceEvent: (data: Record<string, unknown>) => void;
  resetActivities: () => void;
  finalizeActivities: () => void;
}

export function useStreamManagement(
  adapter: ChatAdapter,
  refs: StreamRefs,
  callbacks: StreamCallbacks,
) {
  const {
    sourceRef, streamBufferRef, currentAssistantIdRef,
    currentExecutionIdRef, currentKnowledgeRef, currentTokenUsageRef, currentContextDataRef,
  } = refs;

  const {
    setMessages, setIsStreaming, setError, setStreamingMsgId, setSelectedMessageId,
    setExecutionDataMap, setPendingApproval, setApprovalDecision, setPendingPrompt,
    handleTraceEvent, finalizeActivities,
  } = callbacks;

  const connectStream = useCallback(
    (
      executionId: string,
      assistantId: string,
      routingStrategy: string | null | undefined,
      delegatedTo: string | null | undefined,
    ) => {
      let liveFlushTimer: ReturnType<typeof setTimeout> | null = null;
      const scheduleLiveFlush = () => {
        if (liveFlushTimer) return;
        liveFlushTimer = setTimeout(() => {
          liveFlushTimer = null;
          setExecutionDataMap((prev) => ({
            ...prev,
            [assistantId]: {
              ...(prev[assistantId] || { activities: [], knowledgeData: null, tokenUsage: null, contextData: null }),
              knowledgeData: currentKnowledgeRef.current,
              contextData: currentContextDataRef.current,
            },
          }));
        }, 150);
      };

      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }

      const streamUrl = adapter.getStreamUrl(executionId);
      const source = new EventSource(streamUrl, adapter.eventSourceInit);
      sourceRef.current = source;

      const cleanup = () => {
        if (liveFlushTimer) { clearTimeout(liveFlushTimer); liveFlushTimer = null; }
        source.removeEventListener("tokens", onEvent);
        source.removeEventListener("trace", onEvent);
        source.removeEventListener("step", onEvent);
        source.removeEventListener("complete", onEvent);
        source.removeEventListener("error", onError);
        source.close();
        if (sourceRef.current === source) sourceRef.current = null;
      };

      const onEvent = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const eventType: string = data.type || "";
          handleTraceEvent(data);

          if (eventType === "human_prompt") {
            console.log("[HITL] human_prompt event received:", data);
            setPendingPrompt({
              executionId: currentExecutionIdRef.current,
              promptId: data.prompt_id || "",
              promptType: data.prompt_type || "confirm",
              question: data.question || "",
              options: data.options || [],
            });
            return;
          }

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
            scheduleLiveFlush();
          }

          if (eventType === "trace:memory") {
            currentContextDataRef.current = mapContextData(data);
            scheduleLiveFlush();
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
            if (routingStrategy && delegatedTo) {
              handleTraceEvent({ type: "trace:supervisor_delegate_end", duration_ms: data.duration_ms });
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: finalContent, metadata: { execution_id: executionId, duration_ms: data.duration_ms, routing_strategy: routingStrategy, delegated_to: delegatedTo, ...(output || {}) } }
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
      source.onerror = () => { setIsStreaming(false); };
    },
    [
      adapter, sourceRef, streamBufferRef, currentAssistantIdRef,
      currentExecutionIdRef, currentKnowledgeRef, currentTokenUsageRef,
      currentContextDataRef, setMessages, setIsStreaming, setError,
      setExecutionDataMap, setPendingApproval, setApprovalDecision,
      handleTraceEvent, finalizeActivities, setStreamingMsgId, setSelectedMessageId,
    ],
  );

  const handleSendResponse = useCallback(
    (
      res: SendMessageResponse,
      assistantId: string,
      sendStartMs: number,
    ) => {
      const {
        execution_id, message_id, direct_response,
        routing_strategy, delegated_to, ephemeral_agent,
        knowledge_data: resKnowledge, context_data: resContext,
      } = res;

      if (execution_id) {
        currentExecutionIdRef.current = execution_id;
      } else if (message_id) {
        currentExecutionIdRef.current = message_id;
      }

      if (resContext) currentContextDataRef.current = mapContextData(resContext);
      if (resKnowledge && resKnowledge.total_results > 0) {
        currentKnowledgeRef.current = mapKnowledgeData(resKnowledge);
      }

      const routingDurationMs = Date.now() - sendStartMs;

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

      if (routing_strategy) {
        handleTraceEvent({ type: "trace:supervisor_routed", strategy: routing_strategy, duration_ms: routingDurationMs });
        if (ephemeral_agent) handleTraceEvent({ type: "trace:agent_created", agent_name: ephemeral_agent.name });
        if (delegated_to) handleTraceEvent({ type: "trace:supervisor_delegate", agent_name: delegated_to });
      }

      connectStream(execution_id, assistantId, routing_strategy, delegated_to);
    },
    [
      connectStream, currentExecutionIdRef, currentContextDataRef,
      currentKnowledgeRef, currentAssistantIdRef, handleTraceEvent,
      setMessages, setIsStreaming, setError, finalizeActivities,
    ],
  );

  return { connectStream, handleSendResponse };
}
