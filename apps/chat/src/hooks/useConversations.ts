import { useState, useCallback, useEffect, useRef } from "react";
import type { ConversationDetail, ConversationCreate, Conversation } from "@modularmind/api-client";
import type { Message } from "./useChat";
import { DEFAULT_CHAT_CONFIG } from "@modularmind/ui";
import type { ChatConfig } from "@modularmind/ui";
import { api } from "../lib/api";

interface UseConversationsOptions {
  /** User object -- conversations are loaded once this becomes truthy. */
  user: unknown;
  /** Current active conversation ID (owned by the caller). */
  activeConversationId: string | null;
  /** Setter for active conversation ID (owned by the caller). */
  setActiveConversationId: (id: string | null) => void;
  /** Callback to push loaded / cleared messages into useChat state. */
  setInitialMessages: (msgs: Message[]) => void;
  /** Callback to push restored / reset chat config into Chat.tsx state. */
  setChatConfig: (config: ChatConfig) => void;
  /** Callback to update the enabled agent IDs when a conversation is selected. */
  setEnabledAgentIds: (ids: string[]) => void;
  /** Callback to update the enabled graph IDs when a conversation is selected. */
  setEnabledGraphIds: (ids: string[]) => void;
  /** Current enabled agent IDs (read when creating a conversation). */
  enabledAgentIds: string[];
  /** Current enabled graph IDs (read when creating a conversation). */
  enabledGraphIds: string[];
  /** Current supervisor mode toggle (read when creating a conversation). */
  supervisorMode: boolean;
}

export function useConversations({
  user,
  activeConversationId,
  setActiveConversationId,
  setInitialMessages,
  setChatConfig,
  setEnabledAgentIds,
  setEnabledGraphIds,
  enabledAgentIds,
  enabledGraphIds,
  supervisorMode,
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
  const activeIdRef = useRef(activeConversationId);
  useEffect(() => {
    enabledAgentIdsRef.current = enabledAgentIds;
    enabledGraphIdsRef.current = enabledGraphIds;
    supervisorModeRef.current = supervisorMode;
    activeIdRef.current = activeConversationId;
  });

  // ─── Load conversations on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let active = true;
    async function fetchData() {
      try {
        const data = await api.get<{ items: Conversation[] }>("/conversations?page_size=50");
        if (!active) return;
        const items = data.items || [];

        // Clean up orphaned conversations (created but cancelled before first response)
        const orphans = items.filter((c) => c.message_count === 0);
        const valid = items.filter((c) => c.message_count > 0);
        if (orphans.length > 0) {
          orphans.forEach((c) => api.delete(`/conversations/${c.id}`).catch(() => {}));
        }

        setConversations(valid);
      } catch {
        showError("Failed to load conversations");
      }
    }
    fetchData();
    return () => {
      active = false;
    };
  }, [user, showError]);

  // ─── Select a conversation ────────────────────────────────────────────────
  const handleSelectConversation = useCallback(
    async (id: string) => {
      setActiveConversationId(id);
      try {
        const data = await api.get<ConversationDetail>(`/conversations/${id}`);
        const msgs: Message[] = (data.messages || []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          metadata: m.metadata || {},
          attachments: m.attachments,
        }));
        setInitialMessages(msgs);

        // Apply conversation config
        const convConfig = data.config || {};
        setEnabledAgentIds(convConfig.enabled_agent_ids || []);
        setEnabledGraphIds(convConfig.enabled_graph_ids || []);
        setChatConfig({
          supervisorMode: data.supervisor_mode ?? true,
          supervisorPrompt: (convConfig as Record<string, unknown>).supervisor_prompt as string || "",
          modelId: convConfig.model_id || null,
          modelOverride: convConfig.model_override || false,
          userPreferences: (convConfig as Record<string, unknown>).user_preferences as string | null ?? null,
        });
      } catch {
        showError("Failed to load conversation");
      }
    },
    [setActiveConversationId, setInitialMessages, setChatConfig, setEnabledAgentIds, setEnabledGraphIds, showError],
  );

  // ─── Create a new conversation ────────────────────────────────────────────
  const createConversation = useCallback(
    async (): Promise<string | null> => {
      try {
        const agentIds = enabledAgentIdsRef.current;
        const graphIds = enabledGraphIdsRef.current;
        const isSupervisor = supervisorModeRef.current;

        const body: ConversationCreate = {
          supervisor_mode: isSupervisor,
        };
        // If a single agent is selected, use direct mode
        if (agentIds.length === 1 && graphIds.length === 0) {
          body.agent_id = agentIds[0];
          body.supervisor_mode = false;
        }

        const conv = await api.post<Conversation>("/conversations", body);
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
    [setActiveConversationId, setInitialMessages, setChatConfig, showError],
  );

  // ─── Delete a conversation ────────────────────────────────────────────────
  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await api.delete(`/conversations/${id}`);
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
    [setActiveConversationId, setInitialMessages, setChatConfig, showError],
  );

  // ─── Rename a conversation ────────────────────────────────────────────────
  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      try {
        await api.patch(`/conversations/${id}`, { title });
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title } : c)),
        );
      } catch {
        showError("Failed to rename conversation");
      }
    },
    [showError],
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
