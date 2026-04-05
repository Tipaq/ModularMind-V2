import { useState, useCallback } from "react";
import type { AttachedFile, ChatConfig, ConversationAdapter } from "@modularmind/ui";
import type { Conversation } from "@modularmind/api-client";
import { useRecentConversationsStore } from "../stores/recent-conversations-store";

const MAX_CONVERSATION_TITLE_LENGTH = 50;
const DEFAULT_CONVERSATION_TITLE = "New Chat";

interface UseChatSendParams {
  activeConversationId: string | null;
  conversations: Conversation[];
  messages: { length: number };
  isStreaming: boolean;
  effectiveModelId: string | null;
  chatConfig: ChatConfig;
  enabledAgentIds: string[];
  enabledGraphIds: string[];
  createConversation: () => Promise<string | null>;
  sendMessage: (
    content: string,
    conversationId: string | undefined,
    files: File[] | undefined,
    supervisorMode: boolean,
  ) => void;
  setConversations: (updater: (prev: Conversation[]) => Conversation[]) => void;
  flushDebounce: () => void;
  adapter: ConversationAdapter;
}

export function useChatSend({
  activeConversationId,
  conversations,
  messages,
  isStreaming,
  effectiveModelId,
  chatConfig,
  enabledAgentIds,
  enabledGraphIds,
  createConversation,
  sendMessage,
  setConversations,
  flushDebounce,
  adapter,
}: UseChatSendParams) {
  const [inputValue, setInputValue] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const updateRecentConversation = useRecentConversationsStore((s) => s.updateConversation);

  const handleSend = useCallback(async () => {
    if ((!inputValue.trim() && attachedFiles.length === 0) || isStreaming || !effectiveModelId)
      return;

    let convId = activeConversationId;

    if (!convId) {
      convId = await createConversation();
      if (!convId) return;
    }

    const conv = conversations.find((c) => c.id === convId);
    if (
      conv &&
      (conv.title === DEFAULT_CONVERSATION_TITLE || !conv.title) &&
      messages.length === 0
    ) {
      const title =
        inputValue.trim().length > MAX_CONVERSATION_TITLE_LENGTH
          ? inputValue.trim().slice(0, MAX_CONVERSATION_TITLE_LENGTH) + "\u2026"
          : inputValue.trim();
      setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, title } : c)));
      updateRecentConversation(convId, { title });
      adapter.patchConversation(convId, { title }).catch((err: unknown) => console.error("[Chat]", err));
    }

    flushDebounce();

    await adapter
      .patchConversation(convId, {
        config: {
          enabled_agent_ids: enabledAgentIds,
          enabled_graph_ids: enabledGraphIds,
          model_id: effectiveModelId,
          model_override: chatConfig.modelOverride,
        },
      })
      .catch((err: unknown) => console.error("[Chat]", err));

    const files = attachedFiles.length > 0 ? attachedFiles.map((af) => af.file) : undefined;
    sendMessage(inputValue, convId ?? undefined, files, chatConfig.supervisorMode);
    setInputValue("");
    setAttachedFiles([]);
  }, [
    inputValue,
    attachedFiles,
    isStreaming,
    effectiveModelId,
    activeConversationId,
    conversations,
    messages.length,
    enabledAgentIds,
    enabledGraphIds,
    chatConfig.modelOverride,
    chatConfig.supervisorMode,
    createConversation,
    sendMessage,
    setConversations,
    flushDebounce,
    adapter,
  ]);

  return { inputValue, setInputValue, attachedFiles, setAttachedFiles, handleSend };
}
