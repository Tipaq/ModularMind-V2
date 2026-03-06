import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Bot, Zap, PanelRight } from "lucide-react";
import { useChat } from "../hooks/useChat";
import { useChatConfig, type EngineModel } from "../hooks/useChatConfig";
import { useConversations } from "../hooks/useConversations";
import { ChatSidebar } from "../components/ChatSidebar";
import { ChatMessages, ChatInput, InsightsPanel, useAuthStore, DEFAULT_CHAT_CONFIG } from "@modularmind/ui";
import type { AttachedFile, MessageExecutionData, ChatConfig } from "@modularmind/ui";
import { api } from "../lib/api";


export default function Chat() {
  const [inputValue, setInputValue] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [enabledAgentIds, setEnabledAgentIds] = useState<string[]>([]);
  const [enabledGraphIds, setEnabledGraphIds] = useState<string[]>([]);
  const [chatConfig, setChatConfig] = useState<ChatConfig>(DEFAULT_CHAT_CONFIG);

  const user = useAuthStore((s) => s.user);
  const { agents, graphs, models, load: loadConfig } = useChatConfig();

  // ─── useChat (messages, streaming, SSE) ─────────────────────────────────
  // We need activeConversationId before calling useChat, but useConversations
  // depends on setInitialMessages from useChat.  Break the cycle by lifting
  // activeConversationId into a local useState that both hooks can share via
  // the returned setter from useConversations.
  //
  // useChat only reads the id for its sendMessage closure, so we can safely
  // initialise it as null and let useConversations keep it updated.
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

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

  // ─── useConversations (CRUD, list, selection) ───────────────────────────
  const {
    conversations,
    setConversations,
    crudError,
    handleSelectConversation,
    createConversation,
    handleDeleteConversation,
    handleRenameConversation,
  } = useConversations({
    user,
    activeConversationId,
    setActiveConversationId,
    setInitialMessages,
    setChatConfig,
    setEnabledAgentIds,
    setEnabledGraphIds,
    enabledAgentIds,
    enabledGraphIds,
    supervisorMode: chatConfig.supervisorMode,
  });

  const [panelOpen, setPanelOpen] = useState(false);

  // Debounce config persistence
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load config once user is authenticated
  // (conversations are loaded by useConversations internally)
  useEffect(() => {
    if (!user) return;
    loadConfig();
  }, [user, loadConfig]);

  // Build the full model identifier the Engine expects: "provider:model_id"
  const toEngineModelId = useCallback((m: EngineModel) => `${m.provider}:${m.model_id}`, []);

  const availableModels = useMemo(
    () => models.filter((m) => m.is_active && m.is_available && !m.is_embedding),
    [models],
  );

  // Derived model ID: use explicit selection, or fall back to first available model
  const effectiveModelId = useMemo(() => {
    if (chatConfig.modelId) return chatConfig.modelId;
    if (availableModels.length > 0) return toEngineModelId(availableModels[0]);
    return null;
  }, [chatConfig.modelId, availableModels, toEngineModelId]);

  // Determine if sending is blocked
  const sendDisabledReason = useMemo(() => {
    if (!effectiveModelId) return "Select a model before sending";
    return null;
  }, [effectiveModelId]);

  const handleCreateConversation = useCallback(async () => {
    await createConversation();
  }, [createConversation]);

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
    if ((!inputValue.trim() && attachedFiles.length === 0) || isStreaming || !effectiveModelId) return;

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
        model_id: effectiveModelId,
        model_override: chatConfig.modelOverride,
      },
    }).catch((err) => console.error("[Chat]", err));

    const files = attachedFiles.length > 0 ? attachedFiles.map((af) => af.file) : undefined;
    sendMessage(inputValue, convId ?? undefined, files);
    setInputValue("");
    setAttachedFiles([]);
  }, [inputValue, attachedFiles, isStreaming, activeConversationId, createConversation, enabledAgentIds, enabledGraphIds, chatConfig, effectiveModelId, sendMessage, conversations, messages.length, setConversations]);

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

  // ─── Shared InsightsPanel adapter ─────────────────────────────────────────
  const selectedModel = useMemo(
    () => availableModels.find((m) => toEngineModelId(m) === effectiveModelId || m.id === effectiveModelId) ?? null,
    [availableModels, effectiveModelId, toEngineModelId],
  );

  const insightsConfig = useMemo(() => ({
    supervisorMode: chatConfig.supervisorMode,
    supervisorPrompt: "",
    modelId: effectiveModelId,
    modelOverride: chatConfig.modelOverride,
  }), [chatConfig.supervisorMode, chatConfig.modelOverride, effectiveModelId]);

  const handleConfigChange = useCallback((patch: Partial<typeof insightsConfig>) => {
    setChatConfig((prev) => {
      const next = {
        ...prev,
        ...(patch.supervisorMode !== undefined && { supervisorMode: patch.supervisorMode }),
        ...(patch.modelId !== undefined && { modelId: patch.modelId }),
        ...(patch.modelOverride !== undefined && { modelOverride: patch.modelOverride }),
      };
      persistConfig(next);
      return next;
    });
  }, [persistConfig]);

  const selectedExecution = useMemo<MessageExecutionData>(() => ({
    activities,
    memoryEntries: panelState.memory,
    knowledgeData: panelState.knowledge.totalResults > 0 ? panelState.knowledge : null,
    tokenUsage,
    contextData: null,
  }), [activities, panelState.memory, panelState.knowledge, tokenUsage]);

  const handleCompactFromInput = useCallback(async () => {
    if (!activeConversationId) return;
    await api.post(`/conversations/${activeConversationId}/compact`);
  }, [activeConversationId]);

  const handleCompactFromPanel = useCallback(async () => {
    const result = await api.post<{
      summary_preview: string;
      compacted_count: number;
      duration_ms: number;
    }>(`/conversations/${activeConversationId}/compact`);
    return result;
  }, [activeConversationId]);

  const noOpUpdateLayer = useCallback(async () => false, []);

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

        {(error || crudError) && (
          <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm border-b border-destructive/20 shrink-0">
            {error || crudError}
          </div>
        )}

        <ChatMessages
          messages={messages}
          isStreaming={isStreaming}
          activities={activities}
          showRoutingMetadata
          stickyFooter={
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
              onFilesChange={setAttachedFiles}
              disabledReason={sendDisabledReason}
              models={models}
              selectedModelId={effectiveModelId}
              onModelChange={handleModelChange}
              modelLabel={(m) => `${m.display_name || m.name} (${m.provider})`}
              onCompact={handleCompactFromInput}
              compactDisabled={messages.length < 4 || isStreaming}
            />
          }
        />
      </div>

      {/* Right: Insights panel */}
      {panelOpen && (
        <InsightsPanel
          selectedExecution={selectedExecution}
          liveActivities={activities}
          isStreaming={isStreaming}
          isLiveSelected={true}
          config={insightsConfig}
          onConfigChange={handleConfigChange}
          models={models}
          supervisorLayers={[]}
          onUpdateLayer={noOpUpdateLayer}
          selectedModelContextWindow={selectedModel?.context_window ?? null}
          enabledAgents={agents.filter((a) => enabledAgentIds.includes(a.id))}
          enabledGraphs={graphs.filter((g) => enabledGraphIds.includes(g.id))}
          allAgents={agents}
          allGraphs={graphs}
          onCompact={activeConversationId ? handleCompactFromPanel : undefined}
        />
      )}
    </div>
  );
}
