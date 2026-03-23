"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../components/chat-messages";
import type { ExecutionActivity, MessageExecutionData } from "../types/chat";

type Message = ChatMessage;

function getExecutionId(metadata: Record<string, unknown> | undefined): string | undefined {
  if (metadata && "execution_id" in metadata) {
    const id = metadata.execution_id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

export function useMessagePersistence(
  isStreaming: boolean,
  activities: ExecutionActivity[],
  currentAssistantIdRef: React.MutableRefObject<string>,
  currentExecutionIdRef: React.MutableRefObject<string>,
  currentKnowledgeRef: React.MutableRefObject<MessageExecutionData["knowledgeData"]>,
  currentTokenUsageRef: React.MutableRefObject<MessageExecutionData["tokenUsage"]>,
  currentContextDataRef: React.MutableRefObject<MessageExecutionData["contextData"]>,
) {
  const [executionDataMap, setExecutionDataMap] = useState<Record<string, MessageExecutionData>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const restoredMsgIdsRef = useRef(new Set<string>());

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
      if (execId) {
        try {
          localStorage.setItem(`mm:exec:${execId}`, JSON.stringify(data));
        } catch {
          // Ignore storage errors
        }
      }
    }
  }, [
    isStreaming, activities, currentAssistantIdRef,
    currentExecutionIdRef, currentKnowledgeRef,
    currentTokenUsageRef, currentContextDataRef,
  ]);

  useEffect(() => {
    const newMessages = messages.filter(
      (m) => m.role === "assistant" && !restoredMsgIdsRef.current.has(m.id),
    );
    if (newMessages.length === 0) return;

    const restore = () => {
      const toRestore: Record<string, MessageExecutionData> = {};
      for (const msg of newMessages) {
        restoredMsgIdsRef.current.add(msg.id);
        try {
          const execId = getExecutionId(msg.metadata);
          if (execId) {
            const stored = localStorage.getItem(`mm:exec:${execId}`);
            if (stored) { toRestore[msg.id] = JSON.parse(stored) as MessageExecutionData; continue; }
          }
          const stored = localStorage.getItem(`mm:exec:${msg.id}`);
          if (stored) { toRestore[msg.id] = JSON.parse(stored) as MessageExecutionData; }
        } catch { /* ignore parse/storage errors */ }
      }
      if (Object.keys(toRestore).length > 0) {
        setExecutionDataMap((prev) => ({ ...prev, ...toRestore }));
      }
    };

    if (typeof requestIdleCallback === "function") {
      const handle = requestIdleCallback(restore);
      return () => cancelIdleCallback(handle);
    }
    restore();
  }, [messages]);

  const setInitialMessages = useCallback((msgs: Message[]) => {
    setMessages(msgs);
    restoredMsgIdsRef.current.clear();
    setExecutionDataMap({});
  }, []);

  return {
    messages,
    setMessages,
    executionDataMap,
    setExecutionDataMap,
    setInitialMessages,
  };
}
