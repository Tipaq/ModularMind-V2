"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useChat, type Message } from "@/hooks/useChat";
import { useChatConfig } from "@/hooks/useChatConfig";
import { ConversationSidebar, type Conversation } from "@/components/chat/ConversationSidebar";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { ExecutionPanel } from "@/components/chat/ExecutionPanel";

interface ChatConfig {
  supervisorMode: boolean;
  supervisorPrompt: string;
  modelId: string | null;
  modelOverride: boolean;
}

const DEFAULT_CONFIG: ChatConfig = {
  supervisorMode: true,
  supervisorPrompt: "",
  modelId: null,
  modelOverride: false,
};

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [enabledAgentIds, setEnabledAgentIds] = useState<string[]>([]);
  const [enabledGraphIds, setEnabledGraphIds] = useState<string[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [chatConfig, setChatConfig] = useState<ChatConfig>(DEFAULT_CONFIG);

  const { status: sessionStatus } = useSession();
  const { agents, graphs, models, supervisorLayers, load: loadConfig, updateSupervisorLayer } = useChatConfig();
  const {
    messages,
    isStreaming,
    error,
    tokenUsage,
    activities,
    sendMessage,
    setInitialMessages,
    cancelStream,
  } = useChat(activeConversationId);

  // Determine if sending is blocked
  const sendDisabledReason = useMemo(() => {
    if (!chatConfig.modelId) return "Select a model before sending";
    return null;
  }, [chatConfig.modelId]);

  // Debounce config persistence
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await fetch("/api/chat/conversations?page_size=50");
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.items || []);
    } catch {
      // Silent fail
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  // Load data once session is authenticated
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    loadConfig();
    fetchConversations();
  }, [sessionStatus, loadConfig, fetchConversations]);

  // Load messages when selecting a conversation
  const handleSelectConversation = useCallback(
    async (id: string) => {
      setActiveConversationId(id);
      try {
        const res = await fetch(`/api/chat/conversations/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        const msgs: Message[] = (data.messages || []).map(
          (m: { id: string; role: string; content: string; created_at: string; metadata?: Record<string, unknown> }) => ({
            id: m.id,
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
            created_at: m.created_at,
            metadata: m.metadata || {},
          }),
        );
        setInitialMessages(msgs);

        // Apply conversation config
        const convConfig = data.config || {};
        setEnabledAgentIds(convConfig.enabled_agent_ids || []);
        setEnabledGraphIds(convConfig.enabled_graph_ids || []);
        setChatConfig({
          supervisorMode: data.supervisor_mode ?? true,
          supervisorPrompt: convConfig.supervisor_prompt || "",
          modelId: convConfig.model_id || null,
          modelOverride: convConfig.model_override || false,
        });
      } catch {
        // Silent fail
      }
    },
    [setInitialMessages],
  );

  const createConversation = useCallback(async (): Promise<string | null> => {
    try {
      const body: Record<string, unknown> = {
        title: "New Chat",
        supervisor_mode: chatConfig.supervisorMode,
      };
      // If a single agent is selected, use direct mode
      if (enabledAgentIds.length === 1 && enabledGraphIds.length === 0) {
        body.agent_id = enabledAgentIds[0];
        body.supervisor_mode = false;
      }

      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const conv = await res.json();
      setConversations((prev) => [conv, ...prev]);
      setActiveConversationId(conv.id);
      setInitialMessages([]);
      setChatConfig({ ...DEFAULT_CONFIG, supervisorMode: chatConfig.supervisorMode });
      return conv.id as string;
    } catch {
      return null;
    }
  }, [enabledAgentIds, enabledGraphIds, chatConfig.supervisorMode, setInitialMessages]);

  const handleCreateConversation = useCallback(async () => {
    await createConversation();
  }, [createConversation]);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeConversationId === id) {
          setActiveConversationId(null);
          setInitialMessages([]);
          setChatConfig(DEFAULT_CONFIG);
        }
      } catch {
        // Silent fail
      }
    },
    [activeConversationId, setInitialMessages],
  );

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      try {
        await fetch(`/api/chat/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title } : c)),
        );
      } catch {
        // Silent fail
      }
    },
    [],
  );

  // Persist config changes to conversation (debounced)
  const persistConfig = useCallback(
    (newConfig: ChatConfig) => {
      if (!activeConversationId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetch(`/api/chat/conversations/${activeConversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supervisor_mode: newConfig.supervisorMode,
            config: {
              enabled_agent_ids: enabledAgentIds,
              enabled_graph_ids: enabledGraphIds,
              model_id: newConfig.modelId,
              model_override: newConfig.modelOverride,
              supervisor_prompt: newConfig.supervisorPrompt,
            },
          }),
        }).catch(() => {});
      }, 500);
    },
    [activeConversationId, enabledAgentIds, enabledGraphIds],
  );

  const handleConfigChange = useCallback(
    (patch: Partial<ChatConfig>) => {
      setChatConfig((prev) => {
        const next = { ...prev, ...patch };
        persistConfig(next);
        return next;
      });
    },
    [persistConfig],
  );

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isStreaming || !chatConfig.modelId) return;

    let convId = activeConversationId;

    // Auto-create conversation if none is active
    if (!convId) {
      convId = await createConversation();
      if (!convId) return;
    }

    // Cancel any pending debounced PATCH to avoid concurrent writes
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // Persist config before sending — must complete before message POST
    // so the Engine sees the model_id in the conversation config
    await fetch(`/api/chat/conversations/${convId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: {
          enabled_agent_ids: enabledAgentIds,
          enabled_graph_ids: enabledGraphIds,
          model_id: chatConfig.modelId,
          model_override: chatConfig.modelOverride,
          supervisor_prompt: chatConfig.supervisorPrompt,
        },
      }),
    }).catch(() => {});

    sendMessage(inputValue, convId ?? undefined);
    setInputValue("");
  }, [inputValue, isStreaming, activeConversationId, createConversation, enabledAgentIds, enabledGraphIds, chatConfig, sendMessage]);

  const handleToggleAgent = useCallback((agentId: string) => {
    setEnabledAgentIds((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId],
    );
  }, []);

  const handleToggleGraph = useCallback((graphId: string) => {
    setEnabledGraphIds((prev) =>
      prev.includes(graphId)
        ? prev.filter((id) => id !== graphId)
        : [...prev, graphId],
    );
  }, []);

  return (
    <div className="flex h-full w-full">
      {/* Left: Conversation sidebar */}
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onCreate={handleCreateConversation}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
      />

      {/* Center: Messages + Input */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {error && (
          <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm border-b border-destructive/20 shrink-0">
            {error}
          </div>
        )}

        <ChatMessages
          messages={messages}
          isStreaming={isStreaming}
          activities={activities}
        />

        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          isStreaming={isStreaming}
          onCancel={cancelStream}
          agents={agents}
          graphs={graphs}
          enabledAgentIds={enabledAgentIds}
          enabledGraphIds={enabledGraphIds}
          onToggleAgent={handleToggleAgent}
          onToggleGraph={handleToggleGraph}
          disabledReason={sendDisabledReason}
        />
      </div>

      {/* Right: Execution panel */}
      <ExecutionPanel
        activities={activities}
        tokenUsage={tokenUsage}
        isStreaming={isStreaming}
        config={chatConfig}
        onConfigChange={handleConfigChange}
        models={models}
        supervisorLayers={supervisorLayers}
        onUpdateLayer={updateSupervisorLayer}
      />
    </div>
  );
}
