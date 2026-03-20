"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { Conversation, ConversationCreate } from "@modularmind/api-client";
import type { ChatMessage } from "../components/chat-messages";
import type { ChatConfig } from "../lib/chat-config";
import { DEFAULT_CHAT_CONFIG } from "../lib/chat-config";
import type { ConversationAdapter } from "./conversation-adapter";

export interface UseConversationsOptions {
  /** Truthy value indicating the user is authenticated. Conversations load once this is truthy. */
  authenticated: unknown;
  /** Current active conversation ID (owned by the caller). */
  activeConversationId: string | null;
  /** Setter for active conversation ID. */
  setActiveConversationId: (id: string | null) => void;
  /** Push loaded / cleared messages into useChat state. */
  setInitialMessages: (msgs: ChatMessage[]) => void;
  /** Push restored / reset chat config. */
  setChatConfig: (config: ChatConfig) => void;
  /** Update enabled agent IDs when a conversation is selected. */
  setEnabledAgentIds: (ids: string[]) => void;
  /** Update enabled graph IDs when a conversation is selected. */
  setEnabledGraphIds: (ids: string[]) => void;
  /** Current enabled agent IDs (read when creating a conversation). */
  enabledAgentIds: string[];
  /** Current enabled graph IDs (read when creating a conversation). */
  enabledGraphIds: string[];
  /** Current supervisor mode (read when creating a conversation). */
  supervisorMode: boolean;
  /** Current model ID (read when creating a conversation in raw LLM mode). */
  modelId?: string | null;
  /** Transport adapter. */
  adapter: ConversationAdapter;
}

const PAGE_SIZE = 50;

export function useConversations({
  authenticated,
  activeConversationId,
  setActiveConversationId,
  setInitialMessages,
  setChatConfig,
  setEnabledAgentIds,
  setEnabledGraphIds,
  enabledAgentIds,
  enabledGraphIds,
  supervisorMode,
  modelId,
  adapter,
}: UseConversationsOptions) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [crudError, setCrudError] = useState<string | null>(null);

  // Auto-dismiss CRUD errors after 5 seconds
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showError = useCallback((msg: string) => {
    setCrudError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setCrudError(null), 5000);
  }, []);

  // Keep mutable refs for values read inside createConversation so the
  // callback identity stays stable while still seeing the latest values.
  const enabledAgentIdsRef = useRef(enabledAgentIds);
  const enabledGraphIdsRef = useRef(enabledGraphIds);
  const supervisorModeRef = useRef(supervisorMode);
  const modelIdRef = useRef(modelId);
  const activeIdRef = useRef(activeConversationId);
  useEffect(() => {
    enabledAgentIdsRef.current = enabledAgentIds;
    enabledGraphIdsRef.current = enabledGraphIds;
    supervisorModeRef.current = supervisorMode;
    modelIdRef.current = modelId;
    activeIdRef.current = activeConversationId;
  });

  // ─── Load conversations on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    (async () => {
      try {
        const data = await adapter.listConversations(PAGE_SIZE);
        if (!active) return;
        const items = data.items || [];

        // Clean up orphaned conversations (created but cancelled before first message)
        const orphans = items.filter((c) => c.message_count === 0);
        const valid = items.filter((c) => c.message_count > 0);
        if (orphans.length > 0) {
          orphans.forEach((c) => adapter.deleteConversation(c.id).catch(() => {}));
        }

        setConversations(valid);
      } catch {
        showError("Failed to load conversations");
      }
    })();
    return () => { active = false; };
  }, [authenticated, adapter, showError]);

  // ─── Select a conversation ────────────────────────────────────────────────
  const handleSelectConversation = useCallback(
    async (id: string) => {
      setActiveConversationId(id);
      try {
        const data = await adapter.getConversation(id);
        const msgs: ChatMessage[] = (data.messages || []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          metadata: m.metadata || {},
          attachments: m.attachments,
        }));
        setInitialMessages(msgs);

        // Apply conversation config
        const convConfig = (data.config || {}) as Record<string, unknown>;
        setEnabledAgentIds((convConfig.enabled_agent_ids as string[]) || []);
        setEnabledGraphIds((convConfig.enabled_graph_ids as string[]) || []);
        setChatConfig({
          supervisorMode: data.supervisor_mode ?? true,
          supervisorPrompt: (convConfig.supervisor_prompt as string) || "",
          modelId: (convConfig.model_id as string) || null,
          modelOverride: (convConfig.model_override as boolean) || false,
          userPreferences: (convConfig.user_preferences as string | null) ?? null,
        });
      } catch {
        showError("Failed to load conversation");
      }
    },
    [adapter, setActiveConversationId, setInitialMessages, setChatConfig, setEnabledAgentIds, setEnabledGraphIds, showError],
  );

  // ─── Create a new conversation ────────────────────────────────────────────
  const createConversation = useCallback(
    async (): Promise<string | null> => {
      try {
        const agentIds = enabledAgentIdsRef.current;
        const graphIds = enabledGraphIdsRef.current;
        const isSupervisor = supervisorModeRef.current;
        const currentModelId = modelIdRef.current;

        const body: ConversationCreate = {
          supervisor_mode: isSupervisor,
        };

        // If a single agent is selected, use direct mode
        if (agentIds.length === 1 && graphIds.length === 0) {
          body.agent_id = agentIds[0];
          body.supervisor_mode = false;
        } else if (agentIds.length === 0 && graphIds.length === 1) {
          body.graph_id = graphIds[0];
          body.supervisor_mode = false;
        }

        // Raw LLM mode — no agent, no supervisor, just model_id
        if (!body.agent_id && !body.supervisor_mode && currentModelId) {
          body.config = { model_id: currentModelId };
        }

        const conv = await adapter.createConversation(body);
        setConversations((prev) => [conv, ...prev]);
        setActiveConversationId(conv.id);
        setInitialMessages([]);
        setChatConfig({ ...DEFAULT_CHAT_CONFIG, supervisorMode: isSupervisor });
        return conv.id;
      } catch {
        showError("Failed to create conversation");
        return null;
      }
    },
    [adapter, setActiveConversationId, setInitialMessages, setChatConfig, showError],
  );

  // ─── Delete a conversation ────────────────────────────────────────────────
  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await adapter.deleteConversation(id);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeIdRef.current === id) {
          setActiveConversationId(null);
          setInitialMessages([]);
          setChatConfig(DEFAULT_CHAT_CONFIG);
        }
      } catch {
        showError("Failed to delete conversation");
      }
    },
    [adapter, setActiveConversationId, setInitialMessages, setChatConfig, showError],
  );

  // ─── Rename a conversation ────────────────────────────────────────────────
  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      try {
        await adapter.patchConversation(id, { title });
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title } : c)),
        );
      } catch {
        showError("Failed to rename conversation");
      }
    },
    [adapter, showError],
  );

  return {
    conversations,
    setConversations,
    crudError,
    clearCrudError: useCallback(() => setCrudError(null), []),
    handleSelectConversation,
    createConversation,
    handleDeleteConversation,
    handleRenameConversation,
  };
}
