"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../components/chat-messages";
import type { ApprovalRequest } from "../components/approval-card";
import type { HumanPromptRequest } from "../components/prompt-card";
import type { ChatError, KnowledgeData, TokenUsage, ContextData } from "../types/chat";
import { ApiError } from "@modularmind/api-client";
import type { ChatAdapter } from "./chat-adapter";
import { useExecutionActivities } from "./useExecutionActivities";
import { useMessagePersistence } from "./useMessagePersistence";
import { useStreamManagement } from "./useStreamManagement";

export type Message = ChatMessage;

function parseApiError(err: unknown): ChatError {
  if (err instanceof ApiError) {
    try {
      const parsed = JSON.parse(err.body);
      const detail = typeof parsed.detail === "string" ? parsed.detail : err.body;
      return { message: detail, isRetryable: err.status === 429 || err.status >= 500 };
    } catch {
      return { message: err.body || `API Error ${err.status}`, isRetryable: err.status === 429 };
    }
  }
  return { message: err instanceof Error ? err.message : "Failed to send message" };
}

export function useChat(conversationId: string | null, adapter: ChatAdapter) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [approvalDecision, setApprovalDecision] = useState<"approved" | "rejected" | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<HumanPromptRequest | null>(null);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const streamBufferRef = useRef("");
  const pendingApprovalRef = useRef<ApprovalRequest | null>(null);
  useEffect(() => {
    pendingApprovalRef.current = pendingApproval;
  }, [pendingApproval]);

  const currentAssistantIdRef = useRef("");
  const currentExecutionIdRef = useRef("");
  const currentKnowledgeRef = useRef<KnowledgeData | null>(null);
  const currentTokenUsageRef = useRef<TokenUsage | null>(null);
  const currentContextDataRef = useRef<ContextData | null>(null);

  const {
    activities, handleEvent: handleTraceEvent,
    reset: resetActivities, finalize: finalizeActivities,
  } = useExecutionActivities();

  const {
    messages, setMessages, executionDataMap, setExecutionDataMap, setInitialMessages: setInitialMessagesBase,
  } = useMessagePersistence(
    isStreaming, activities,
    currentAssistantIdRef, currentExecutionIdRef,
    currentKnowledgeRef, currentTokenUsageRef, currentContextDataRef,
  );

  const setInitialMessages = useCallback((msgs: Message[]) => {
    setInitialMessagesBase(msgs);
    setSelectedMessageId(null);
  }, [setInitialMessagesBase]);

  const { handleSendResponse } = useStreamManagement(adapter, {
    sourceRef, streamBufferRef, currentAssistantIdRef,
    currentExecutionIdRef, currentKnowledgeRef, currentTokenUsageRef, currentContextDataRef,
  }, {
    setMessages, setIsStreaming, setError, setStreamingMsgId, setSelectedMessageId,
    setExecutionDataMap, setPendingApproval, setApprovalDecision, setPendingPrompt,
    handleTraceEvent, resetActivities, finalizeActivities,
  });

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

      let attachmentIds: string[] = [];
      let uploadedAttachments: { id: string; filename: string; content_type: string; size_bytes: number }[] = [];
      if (files && files.length > 0) {
        try {
          const results = await Promise.all(files.map((f) => adapter.uploadAttachment(targetConvId, f)));
          attachmentIds = results.map((a) => a.id);
          uploadedAttachments = results;
        } catch (err) {
          setError({ message: err instanceof Error ? err.message : "Failed to upload attachments" });
          setIsStreaming(false);
          return;
        }
      }

      let tempUserMsg: Message | null = null;
      if (!skipUserMessage) {
        tempUserMsg = {
          id: `temp-${Date.now()}`, role: "user", content,
          created_at: new Date().toISOString(), metadata: {},
          attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        };
        setMessages((prev) => [...prev, tempUserMsg!]);
      }

      const assistantId = `assistant-${Date.now()}`;
      currentAssistantIdRef.current = assistantId;
      setStreamingMsgId(assistantId);
      setSelectedMessageId(assistantId);
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant" as const, content: "", created_at: new Date().toISOString(), metadata: {} },
      ]);

      if (supervisorMode) handleTraceEvent({ type: "trace:supervisor_routing" });

      const sendStartMs = Date.now();
      const body: { content: string; attachment_ids?: string[] } = { content };
      if (attachmentIds.length > 0) body.attachment_ids = attachmentIds;

      try {
        const res = await adapter.sendMessage(targetConvId, body);
        if (tempUserMsg && res.user_message) {
          setMessages((prev) => prev.map((m) => (m.id === tempUserMsg!.id ? res.user_message : m)));
        }
        handleSendResponse(res, assistantId, sendStartMs);
      } catch (err) {
        setError(parseApiError(err));
        setMessages((prev) => prev.filter((m) => m.id !== assistantId && (!tempUserMsg || m.id !== tempUserMsg.id)));
        currentAssistantIdRef.current = "";
        setIsStreaming(false);
      }
    },
    [conversationId, isStreaming, adapter, handleTraceEvent, resetActivities, handleSendResponse, setMessages],
  );

  const cancelStream = useCallback(() => {
    if (sourceRef.current) { sourceRef.current.close(); sourceRef.current = null; }
    const execId = currentExecutionIdRef.current;
    if (execId) { adapter.stopExecution(execId).catch(() => {}); currentExecutionIdRef.current = ""; }
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && !last.content) return prev.slice(0, -1);
      return prev;
    });
    currentAssistantIdRef.current = "";
    setIsStreaming(false);
  }, [adapter, setMessages]);

  useEffect(() => {
    return () => { if (sourceRef.current) { sourceRef.current.close(); sourceRef.current = null; } };
  }, []);

  const approveExecution = useCallback(async (executionId: string, notes?: string) => {
    const gatewayId = pendingApprovalRef.current?.approvalId;
    await adapter.approveExecution(executionId, gatewayId, notes);
    setApprovalDecision("approved");
    setPendingApproval(null);
  }, [adapter]);

  const rejectExecution = useCallback(async (executionId: string, notes?: string) => {
    const gatewayId = pendingApprovalRef.current?.approvalId;
    await adapter.rejectExecution(executionId, gatewayId, notes);
    setApprovalDecision("rejected");
    setPendingApproval(null);
  }, [adapter]);

  const respondToPrompt = useCallback(async (executionId: string, promptId: string, response: string) => {
    await adapter.respondToPrompt(executionId, promptId, response);
    setPendingPrompt(null);
  }, [adapter]);

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (isStreaming || !conversationId) return;
    const msgIdx = messages.findIndex((m) => m.id === messageId);
    if (msgIdx === -1) return;
    await adapter.deleteMessagesFrom(conversationId, messageId).catch(() => {});
    setMessages((prev) => prev.slice(0, msgIdx));
    sendMessage(newContent, conversationId, undefined, undefined, false);
  }, [isStreaming, conversationId, messages, adapter, sendMessage, setMessages]);

  const regenerateLastMessage = useCallback(async () => {
    if (isStreaming || !conversationId) return;
    let lastUserMsg: Message | undefined;
    let lastAssistant: Message | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (!lastAssistant && messages[i].role === "assistant") lastAssistant = messages[i];
      if (!lastUserMsg && messages[i].role === "user") lastUserMsg = messages[i];
      if (lastUserMsg && lastAssistant) break;
    }
    if (!lastUserMsg || !lastAssistant) return;
    await adapter.deleteMessagesFrom(conversationId, lastAssistant.id).catch(() => {});
    setMessages((prev) => prev.filter((m) => m.id !== lastAssistant.id));
    sendMessage(lastUserMsg.content, conversationId, undefined, undefined, true);
  }, [isStreaming, conversationId, messages, adapter, sendMessage, setMessages]);

  const clearError = useCallback(() => setError(null), []);

  const streamingMessageId = isStreaming ? streamingMsgId : null;

  return {
    messages, isStreaming, error, clearError, activities, executionDataMap,
    selectedMessageId, setSelectedMessageId, streamingMessageId,
    pendingApproval, approvalDecision, pendingPrompt, sendMessage, setInitialMessages,
    cancelStream, approveExecution, rejectExecution, respondToPrompt, regenerateLastMessage, editMessage,
  };
}
