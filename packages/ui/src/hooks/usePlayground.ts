"use client";

import { useState, useCallback } from "react";
import type { ConversationCreate } from "@modularmind/api-client";
import type { ChatAdapter } from "./chat-adapter";
import type { ConversationAdapter } from "./conversation-adapter";
import type { AttachedFile } from "../types/chat";
import { useChat } from "./useChat";

export interface UsePlaygroundOptions {
  storageKeyPrefix: string;
  entityId: string;
  entityName: string;
  createBody: Omit<ConversationCreate, "title">;
  chatAdapter: ChatAdapter;
  conversationAdapter: ConversationAdapter;
  patchConfigOnSend?: (conversationId: string) => Promise<void>;
}

export function usePlayground({
  storageKeyPrefix,
  entityId,
  entityName,
  createBody,
  chatAdapter: adapter,
  conversationAdapter: convAdapter,
  patchConfigOnSend,
}: UsePlaygroundOptions) {
  const storageKey = `${storageKeyPrefix}${entityId}`;

  const [conversationId, setConversationId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey) ?? null;
    } catch {
      return null;
    }
  });

  const [inputValue, setInputValue] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  const {
    messages,
    isStreaming,
    error,
    activities,
    sendMessage,
    setInitialMessages,
    cancelStream,
    pendingPrompt,
    respondToPrompt,
  } = useChat(conversationId, adapter);

  const createConversation = useCallback(async () => {
    const conv = await convAdapter.createConversation({
      ...createBody,
      title: entityName,
    });
    setConversationId(conv.id);
    try {
      localStorage.setItem(storageKey, conv.id);
    } catch { /* ignore */ }
    return conv.id;
  }, [convAdapter, createBody, entityName, storageKey]);

  const handleSend = useCallback(async () => {
    const content = inputValue.trim();
    if (!content) return;

    let targetConvId = conversationId;

    if (!targetConvId) {
      try {
        targetConvId = await createConversation();
      } catch {
        return;
      }
    }

    if (patchConfigOnSend) {
      await patchConfigOnSend(targetConvId).catch(() => {});
    }

    setInputValue("");
    sendMessage(content, targetConvId);
  }, [inputValue, conversationId, createConversation, patchConfigOnSend, sendMessage]);

  const handleNewConversation = useCallback(async () => {
    try {
      await createConversation();
      setInitialMessages([]);
      setInputValue("");
    } catch { /* ignore */ }
  }, [createConversation, setInitialMessages]);

  return {
    conversationId,
    inputValue,
    setInputValue,
    attachedFiles,
    setAttachedFiles,
    messages,
    isStreaming,
    error,
    activities,
    pendingPrompt,
    respondToPrompt,
    handleSend,
    handleNewConversation,
    cancelStream,
  };
}
