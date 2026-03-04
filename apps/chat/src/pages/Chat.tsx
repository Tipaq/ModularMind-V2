import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Bot, Zap, PanelRight } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@modularmind/ui";
import type { ConversationDetail, ConversationConfig, ConversationCreate } from "@modularmind/api-client";
import { useChat, type Message } from "../hooks/useChat";
import { useChatConfig, type EngineModel } from "../hooks/useChatConfig";
import { ChatSidebar, type Conversation } from "../components/ChatSidebar";
import { ChatMessages } from "../components/ChatMessages";
import { ChatInput } from "../components/ChatInput";
import { RightPanel } from "../components/RightPanel";
import { useAuthStore } from "@modularmind/ui";
import { api } from "../lib/api";

interface ChatConfig {
  supervisorMode: boolean;
  modelId: string | null;
  modelOverride: boolean;
}

const DEFAULT_CONFIG: ChatConfig = {
  supervisorMode: true,
  modelId: null,
  modelOverride: false,
};

export default function Chat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [enabledAgentIds, setEnabledAgentIds] = useState<string[]>([]);
  const [enabledGraphIds, setEnabledGraphIds] = useState<string[]>([]);
  const [chatConfig, setChatConfig] = useState<ChatConfig>(DEFAULT_CONFIG);

  const user = useAuthStore((s) => s.user);
  const { agents, graphs, models, load: loadConfig } = useChatConfig();
  const {
    messages,
    isStreaming,
    error,
    tokenUsage,
    activities,
    panelState,
    sendMessage,
    setInitialMessages,
    cancelStream,
  } = useChat(activeConversationId);

  const [panelOpen, setPanelOpen] = useState(false);

  // Determine if sending is blocked
  const sendDisabledReason = useMemo(() => {
    if (!chatConfig.modelId) return "Select a model before sending";
    return null;
  }, [chatConfig.modelId]);

  // Debounce config persistence
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build the full model identifier the Engine expects: "provider:model_id"
  const toEngineModelId = useCallback((m: EngineModel) => `${m.provider}:${m.model_id}`, []);

  const availableModels = useMemo(
    () => models.filter((m) => m.is_active && m.is_available && !m.is_embedding),
    [models],
  );

  // Auto-select first available model when none is selected
  useEffect(() => {
    if (!chatConfig.modelId && availableModels.length > 0) {
      setChatConfig((prev) => ({ ...prev, modelId: toEngineModelId(availableModels[0]) }));
    }
  }, [chatConfig.modelId, availableModels, toEngineModelId]);

  const fetchConversations = useCallback(async () => {
    try {
      const data = await api.get<{ items: Conversation[] }>("/conversations?page_size=50");
      setConversations(data.items || []);
    } catch (err) {
      console.error("[Chat]", err);
    }
  }, []);

  // Load data once user is authenticated
  useEffect(() => {
    if (!user) return;
    loadConfig();
    fetchConversations();
  }, [user, loadConfig, fetchConversations]);

  // Load messages when selecting a conversation
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
        }));
        setInitialMessages(msgs);

        // Apply conversation config
        const convConfig = data.config || {};
        setEnabledAgentIds(convConfig.enabled_agent_ids || []);
        setEnabledGraphIds(convConfig.enabled_graph_ids || []);
        setChatConfig({
          supervisorMode: data.supervisor_mode ?? true,
          modelId: convConfig.model_id || null,
          modelOverride: convConfig.model_override || false,
        });
      } catch (err) {
        console.error("[Chat]", err);
      }
    },
    [setInitialMessages],
  );

  const createConversation = useCallback(async (): Promise<string | null> => {
    try {
      const body: ConversationCreate = {
        supervisor_mode: chatConfig.supervisorMode,
      };
      // If a single agent is selected, use direct mode
      if (enabledAgentIds.length === 1 && enabledGraphIds.length === 0) {
        body.agent_id = enabledAgentIds[0];
        body.supervisor_mode = false;
      }

      const conv = await api.post<Conversation>("/conversations", body);
      setConversations((prev) => [conv, ...prev]);
      setActiveConversationId(conv.id);
      setInitialMessages([]);
      setChatConfig({ ...DEFAULT_CONFIG, supervisorMode: chatConfig.supervisorMode });
      return conv.id;
    } catch (err) {
      console.error("[Chat]", err);
      return null;
    }
  }, [enabledAgentIds, enabledGraphIds, chatConfig.supervisorMode, setInitialMessages]);

  const handleCreateConversation = useCallback(async () => {
    await createConversation();
  }, [createConversation]);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await api.delete(`/conversations/${id}`);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeConversationId === id) {
          setActiveConversationId(null);
          setInitialMessages([]);
          setChatConfig(DEFAULT_CONFIG);
        }
      } catch (err) {
        console.error("[Chat]", err);
      }
    },
    [activeConversationId, setInitialMessages],
  );

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      try {
        await api.patch(`/conversations/${id}`, { title });
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title } : c)),
        );
      } catch (err) {
        console.error("[Chat]", err);
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
        api.patch(`/conversations/${activeConversationId}`, {
          supervisor_mode: newConfig.supervisorMode,
          config: {
            enabled_agent_ids: enabledAgentIds,
            enabled_graph_ids: enabledGraphIds,
            model_id: newConfig.modelId,
            model_override: newConfig.modelOverride,
          },
        }).catch((err) => console.error("[Chat]", err));
      }, 500);
    },
    [activeConversationId, enabledAgentIds, enabledGraphIds],
  );

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isStreaming || !chatConfig.modelId) return;

    let convId = activeConversationId;

    // Auto-create conversation if none is active
    if (!convId) {
      convId = await createConversation();
      if (!convId) return;
    }

    // Auto-title on first message
    const conv = conversations.find((c) => c.id === convId);
    if (conv && (conv.title === "New Chat" || !conv.title) && messages.length === 0) {
      const title = inputValue.trim().length > 50 ? inputValue.trim().slice(0, 50) + "\u2026" : inputValue.trim();
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title } : c)),
      );
      api.patch(`/conversations/${convId}`, { title }).catch((err) => console.error("[Chat]", err));
    }

    // Cancel any pending debounced PATCH
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // Persist config before sending
    await api.patch(`/conversations/${convId}`, {
      config: {
        enabled_agent_ids: enabledAgentIds,
        enabled_graph_ids: enabledGraphIds,
        model_id: chatConfig.modelId,
        model_override: chatConfig.modelOverride,
      },
    }).catch((err) => console.error("[Chat]", err));

    sendMessage(inputValue, convId ?? undefined);
    setInputValue("");
  }, [inputValue, isStreaming, activeConversationId, createConversation, enabledAgentIds, enabledGraphIds, chatConfig, sendMessage, conversations, messages.length]);

  const handleToggleAgent = useCallback((agentId: string) => {
    setEnabledAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId],
    );
  }, []);

  const handleToggleGraph = useCallback((graphId: string) => {
    setEnabledGraphIds((prev) =>
      prev.includes(graphId) ? prev.filter((id) => id !== graphId) : [...prev, graphId],
    );
  }, []);

  const handleModelChange = useCallback(
    (modelId: string | null) => {
      setChatConfig((prev) => {
        const next = { ...prev, modelId };
        persistConfig(next);
        return next;
      });
    },
    [persistConfig],
  );

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const activeTitle = activeConv?.title || "Chat";

  return (
    <div className="flex h-full w-full">
      {/* Left: Conversation sidebar */}
      <ChatSidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onCreate={handleCreateConversation}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
      />

      {/* Center: Header + Messages + Input */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="h-14 border-b flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{activeTitle}</p>
              {isStreaming && (
                <p className="text-xs text-muted-foreground truncate">
                  {activities.find((a) => a.status === "running")?.label || "Thinking..."}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Model dropdown */}
            {availableModels.length > 0 && (
              <Select
                value={chatConfig.modelId ?? ""}
                onValueChange={(v) => handleModelChange(v)}
              >
                <SelectTrigger className="w-[200px] h-8 text-xs">
                  <SelectValue placeholder="Select a model..." />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((m) => (
                    <SelectItem key={m.id} value={toEngineModelId(m)} className="text-xs">
                      {m.display_name || m.name} ({m.provider})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Token usage */}
            {tokenUsage && (
              <span className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground">
                <Zap className="h-3 w-3" />
                {tokenUsage.total}
              </span>
            )}

            {/* Panel toggle */}
            <button
              onClick={() => setPanelOpen((prev) => !prev)}
              className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Toggle insights panel"
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </div>
        </div>

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

      {/* Right: Insights panel */}
      {panelOpen && (
        <RightPanel
          supervisor={panelState.supervisor}
          knowledge={panelState.knowledge}
          memory={panelState.memory}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}
