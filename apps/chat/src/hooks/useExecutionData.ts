import { useMemo } from "react";
import type { ChatMessage, MessageExecutionData } from "@modularmind/ui";

interface UseExecutionDataParams {
  messages: ChatMessage[];
  executionDataMap: Record<string, MessageExecutionData>;
  streamingMessageId: string | null;
  selectedMessageId: string | null;
  isStreaming: boolean;
}

export function useExecutionData({
  messages,
  executionDataMap,
  streamingMessageId,
  selectedMessageId,
  isStreaming,
}: UseExecutionDataParams) {
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

  const activeMessageId = selectedMessageId ?? streamingMessageId ?? lastAssistantId;
  const isLiveSelected = isStreaming && !!streamingMessageId && !selectedMessageId;

  const selectedExecution = useMemo(() => {
    if (!activeMessageId) return null;
    return executionDataMap[activeMessageId] ?? null;
  }, [activeMessageId, executionDataMap]);

  const latestTokenUsage = useMemo(() => {
    if (streamingMessageId && executionDataMap[streamingMessageId]?.tokenUsage) {
      return executionDataMap[streamingMessageId].tokenUsage;
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && executionDataMap[msg.id]?.tokenUsage) {
        return executionDataMap[msg.id].tokenUsage;
      }
    }
    return null;
  }, [streamingMessageId, executionDataMap, messages]);

  return { activeMessageId, isLiveSelected, selectedExecution, latestTokenUsage };
}
