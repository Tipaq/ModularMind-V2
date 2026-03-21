import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Bot, Zap, PanelRight, Code2 } from "lucide-react";
import { useChat, useConversations, useChatConfig } from "@modularmind/ui";
import type { EngineModel, DetectedArtifact } from "@modularmind/ui";
import { ChatSidebar } from "../components/ChatSidebar";
import { ChatMessages, ChatInput, InsightsPanel, useAuthStore, DEFAULT_CHAT_CONFIG, toggleArrayItem, formatModelName } from "@modularmind/ui";
import { ArtifactPanel } from "@modularmind/ui";
import { useArtifacts } from "@modularmind/ui";
import type { AttachedFile, ChatConfig } from "@modularmind/ui";
import { chatAdapter, conversationAdapter, chatConfigAdapter } from "../lib/chat-adapter";


export default function Chat() {
  const [inputValue, setInputValue] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [enabledAgentIds, setEnabledAgentIds] = useState<string[]>([]);
  const [enabledGraphIds, setEnabledGraphIds] = useState<string[]>([]);
  const [chatConfig, setChatConfig] = useState<ChatConfig>(DEFAULT_CHAT_CONFIG);

  const user = useAuthStore((s) => s.user);
  const { agents, graphs, models, load: loadConfig } = useChatConfig(chatConfigAdapter);

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

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

  const {
    messages,
    isStreaming,
    error,
    activities,
    executionDataMap,
    streamingMessageId,
    pendingApproval,
    approvalDecision,
    sendMessage,
    setInitialMessages,
    cancelStream,
    approveExecution,
    rejectExecution,
    regenerateLastMessage,
    editMessage,
  } = useChat(activeConversationId, chatAdapter);

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
    authenticated: user,
    activeConversationId,
    setActiveConversationId,
    setInitialMessages,
    setChatConfig,
    setEnabledAgentIds,
    setEnabledGraphIds,
    enabledAgentIds,
    enabledGraphIds,
    supervisorMode: chatConfig.supervisorMode,
    modelId: effectiveModelId,
    adapter: conversationAdapter,
  });

  type RightPanel = "insights" | "artifacts" | null;
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const {
    artifacts,
    selectedArtifactId,
    selectedArtifact,
    addArtifact,
    selectArtifact,
    clearArtifacts,
  } = useArtifacts();

  // Debounce config persistence
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const conversationsRef = useRef(conversations);
  const messagesLengthRef = useRef(messages.length);
  const enabledAgentIdsRef = useRef(enabledAgentIds);
  const enabledGraphIdsRef = useRef(enabledGraphIds);
  const chatConfigRef = useRef(chatConfig);
  const effectiveModelIdRef = useRef(effectiveModelId);
  useEffect(() => {
    conversationsRef.current = conversations;
    messagesLengthRef.current = messages.length;
    enabledAgentIdsRef.current = enabledAgentIds;
    enabledGraphIdsRef.current = enabledGraphIds;
    chatConfigRef.current = chatConfig;
    effectiveModelIdRef.current = effectiveModelId;
  });

  // Load config once user is authenticated
  useEffect(() => {
    if (!user) return;
    loadConfig();
  }, [user, loadConfig]);

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
        conversationAdapter.patchConversation(activeConversationId, {
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
    if ((!inputValue.trim() && attachedFiles.length === 0) || isStreaming || !effectiveModelIdRef.current) return;

    let convId = activeConversationId;

    // Auto-create conversation if none is active
    if (!convId) {
      convId = await createConversation();
      if (!convId) return;
    }

    // Auto-title on first message
    const conv = conversationsRef.current.find((c) => c.id === convId);
    if (conv && (conv.title === "New Chat" || !conv.title) && messagesLengthRef.current === 0) {
      const title = inputValue.trim().length > 50 ? inputValue.trim().slice(0, 50) + "\u2026" : inputValue.trim();
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title } : c)),
      );
      conversationAdapter.patchConversation(convId, { title }).catch((err) => console.error("[Chat]", err));
    }

    // Cancel any pending debounced PATCH
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // Persist config before sending
    await conversationAdapter.patchConversation(convId, {
      config: {
        enabled_agent_ids: enabledAgentIdsRef.current,
        enabled_graph_ids: enabledGraphIdsRef.current,
        model_id: effectiveModelIdRef.current,
        model_override: chatConfigRef.current.modelOverride,
      },
    }).catch((err) => console.error("[Chat]", err));

    const files = attachedFiles.length > 0 ? attachedFiles.map((af) => af.file) : undefined;
    sendMessage(inputValue, convId ?? undefined, files, chatConfigRef.current.supervisorMode);
    setInputValue("");
    setAttachedFiles([]);
  }, [inputValue, attachedFiles, isStreaming, activeConversationId, createConversation, sendMessage, setConversations]);

  const handleToggleAgent = useCallback((agentId: string) => {
    setEnabledAgentIds((prev) => toggleArrayItem(prev, agentId));
  }, []);

  const handleToggleGraph = useCallback((graphId: string) => {
    setEnabledGraphIds((prev) => toggleArrayItem(prev, graphId));
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
    userPreferences: chatConfig.userPreferences,
  }), [chatConfig.supervisorMode, chatConfig.modelOverride, effectiveModelId, chatConfig.userPreferences]);

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

  // Use execution data from the streaming message, or null
  const isLiveSelected = isStreaming && !!streamingMessageId;
  const selectedExecution = useMemo(() => {
    if (!streamingMessageId) return null;
    return executionDataMap[streamingMessageId] ?? null;
  }, [streamingMessageId, executionDataMap]);

  // Token usage from the latest execution
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

  const handleCompactFromInput = useCallback(async () => {
    if (!activeConversationId) return;
    await conversationAdapter.compactConversation(activeConversationId);
  }, [activeConversationId]);

  const handleCompactFromPanel = useCallback(async () => {
    return conversationAdapter.compactConversation(activeConversationId!);
  }, [activeConversationId]);

  const noOpUpdateLayer = useCallback(async () => false, []);

  const handleArtifactDetected = useCallback(
    (artifact: DetectedArtifact) => {
      addArtifact(artifact);
      if (!rightPanel) {
        setRightPanel("artifacts");
        selectArtifact(artifact.id);
      }
    },
    [addArtifact, rightPanel, selectArtifact],
  );

  useEffect(() => {
    clearArtifacts();
  }, [activeConversationId, clearArtifacts]);

  const togglePanel = useCallback((panel: "insights" | "artifacts") => {
    setRightPanel((prev) => (prev === panel ? null : panel));
  }, []);

  const handleEditMessage = useCallback((messageId: string, newContent: string) => {
    editMessage(messageId, newContent);
  }, [editMessage]);

  const enabledAgentIdSet = useMemo(() => new Set(enabledAgentIds), [enabledAgentIds]);
  const enabledGraphIdSet = useMemo(() => new Set(enabledGraphIds), [enabledGraphIds]);

  const enabledAgents = useMemo(
    () => agents.filter((a) => enabledAgentIdSet.has(a.id)),
    [agents, enabledAgentIdSet],
  );
  const enabledGraphs = useMemo(
    () => graphs.filter((g) => enabledGraphIdSet.has(g.id)),
    [graphs, enabledGraphIdSet],
  );

  const activeTitle = useMemo(() => {
    const conv = conversations.find((c) => c.id === activeConversationId);
    return conv?.title || "Chat";
  }, [conversations, activeConversationId]);

  const runningActivityLabel = useMemo(() => {
    if (!isStreaming) return null;
    return activities.find((a) => a.status === "running")?.label || "Thinking...";
  }, [isStreaming, activities]);

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
              {runningActivityLabel && (
                <p className="text-xs text-muted-foreground truncate">
                  {runningActivityLabel}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Token usage */}
            {latestTokenUsage && (
              <span className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground">
                <Zap className="h-3 w-3" />
                {latestTokenUsage.total}
              </span>
            )}

            {/* Artifacts panel toggle */}
            <button
              onClick={() => togglePanel("artifacts")}
              className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${rightPanel === "artifacts" ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              title="Toggle artifacts panel"
            >
              <Code2 className="h-4 w-4" />
            </button>

            {/* Insights panel toggle */}
            <button
              onClick={() => togglePanel("insights")}
              className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${rightPanel === "insights" ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
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
          pendingApproval={pendingApproval}
          approvalDecision={approvalDecision}
          onApprove={approveExecution}
          onReject={rejectExecution}
          onRegenerate={regenerateLastMessage}
          onEditMessage={handleEditMessage}
          onArtifactDetected={handleArtifactDetected}
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
              modelLabel={(m) => formatModelName(m.model_id || m.name)}
              onCompact={handleCompactFromInput}
              compactDisabled={messages.length < 4 || isStreaming}
            />
          }
        />
      </div>

      {/* Right: Insights or Artifacts panel */}
      {rightPanel === "insights" && (
        <InsightsPanel
          selectedExecution={selectedExecution}
          liveActivities={activities}
          isStreaming={isStreaming}
          isLiveSelected={isLiveSelected}
          config={insightsConfig}
          onConfigChange={handleConfigChange}
          models={models}
          supervisorLayers={[]}
          onUpdateLayer={noOpUpdateLayer}
          selectedModelContextWindow={selectedModel?.context_window ?? null}
          enabledAgents={enabledAgents}
          enabledGraphs={enabledGraphs}
          allAgents={agents}
          allGraphs={graphs}
          onCompact={activeConversationId ? handleCompactFromPanel : undefined}
        />
      )}
      {rightPanel === "artifacts" && (
        <ArtifactPanel
          artifacts={artifacts}
          selectedArtifactId={selectedArtifactId}
          selectedArtifact={selectedArtifact}
          onSelectArtifact={selectArtifact}
          onClose={() => setRightPanel(null)}
        />
      )}
    </div>
  );
}
