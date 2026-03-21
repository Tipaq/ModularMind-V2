"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useChat, useConversations, useChatConfig } from "@modularmind/ui";
import { ConversationSidebar, ChatMessages, ChatInput, InsightsPanel, DEFAULT_CHAT_CONFIG, toggleArrayItem } from "@modularmind/ui";
import type { AttachedFile, ChatConfig } from "@modularmind/ui";
import { PanelRight } from "lucide-react";
import { chatAdapter, conversationAdapter, chatConfigAdapter } from "@/lib/chat-adapter";


const TITLE_MAX_LENGTH = 50;
const CONFIG_DEBOUNCE_MS = 500;

export default function ChatPage() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [enabledAgentIds, setEnabledAgentIds] = useState<string[]>([]);
  const [enabledGraphIds, setEnabledGraphIds] = useState<string[]>([]);
  const [chatConfig, setChatConfig] = useState<ChatConfig>(DEFAULT_CHAT_CONFIG);
  const [panelOpen, setPanelOpen] = useState(true);

  const { status: sessionStatus } = useSession();
  const { agents, graphs, models, supervisorLayers, load: loadConfig, updateSupervisorLayer } = useChatConfig(chatConfigAdapter);
  const {
    messages,
    isStreaming,
    error,
    activities,
    executionDataMap,
    selectedMessageId,
    setSelectedMessageId,
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

  // Auto-select the last assistant message when loading a conversation
  useEffect(() => {
    if (!selectedMessageId && messages.length > 0 && !isStreaming) {
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      if (lastAssistant) setSelectedMessageId(lastAssistant.id);
    }
  }, [messages, selectedMessageId, isStreaming, setSelectedMessageId]);

  // Compute selected execution data for the panel
  const isLiveSelected = isStreaming && selectedMessageId === streamingMessageId;
  const selectedExecution = useMemo(() => {
    if (!selectedMessageId) return null;
    return executionDataMap[selectedMessageId] ?? null;
  }, [selectedMessageId, executionDataMap]);

  // Derive effective config: auto-select model + force override when needed.
  // Computed during render instead of via setState-in-effect to avoid cascading renders.
  const effectiveChatConfig = useMemo(() => {
    let config = chatConfig;

    // Auto-select the active model when none is set
    if (!config.modelId && models.length > 0) {
      const available = models.filter((m) => !m.is_embedding && m.is_available);
      const active = available.find((m) => m.is_active) ?? available[0];
      if (active) {
        config = { ...config, modelId: `${active.provider}:${active.model_id}` };
      }
    }

    // Force model override ON when some agent models are unavailable
    if (!config.modelOverride) {
      const availableIds = new Set(
        models.filter((m) => m.is_available && !m.is_embedding).map((m) => `${m.provider}:${m.model_id}`),
      );
      if (Array.isArray(agents) && agents.some((a) => a.model_id && !availableIds.has(a.model_id))) {
        config = { ...config, modelOverride: true };
      }
    }

    return config;
  }, [chatConfig, models, agents]);

  // Context usage percentage from the latest execution
  const contextPercent = useMemo(() => {
    const bo = selectedExecution?.contextData?.budgetOverview;
    if (!bo || bo.effectiveContext <= 0) return null;
    const totalUsed = (bo.layers.system?.used ?? 0) + bo.layers.history.used + bo.layers.memory.used + bo.layers.rag.used;
    return Math.round((totalUsed / bo.effectiveContext) * 100);
  }, [selectedExecution]);

  // Selected model's context window for display when no execution data exists
  const selectedModelContextWindow = useMemo(() => {
    if (!effectiveChatConfig.modelId) return null;
    const m = models.find(
      (m) => m.id === effectiveChatConfig.modelId || `${m.provider}:${m.model_id}` === effectiveChatConfig.modelId,
    );
    return m?.context_window ?? null;
  }, [effectiveChatConfig.modelId, models]);

  // Determine if sending is blocked
  const sendDisabledReason = useMemo(() => {
    if (!effectiveChatConfig.modelId) return "Select a model before sending";
    return null;
  }, [effectiveChatConfig.modelId]);

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
    authenticated: sessionStatus === "authenticated",
    activeConversationId,
    setActiveConversationId,
    setInitialMessages,
    setChatConfig,
    setEnabledAgentIds,
    setEnabledGraphIds,
    enabledAgentIds,
    enabledGraphIds,
    supervisorMode: effectiveChatConfig.supervisorMode,
    modelId: effectiveChatConfig.modelId,
    adapter: conversationAdapter,
  });

  // Load engine config once session is authenticated
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    loadConfig();
  }, [sessionStatus, loadConfig]);

  const handleCreateConversation = useCallback(async () => {
    await createConversation();
  }, [createConversation]);

  // Debounce config persistence
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            supervisor_prompt: newConfig.supervisorPrompt,
          },
        }).catch(() => { /* best-effort persist */ });
      }, CONFIG_DEBOUNCE_MS);
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
    if ((!inputValue.trim() && attachedFiles.length === 0) || isStreaming || !effectiveChatConfig.modelId) return;

    let convId = activeConversationId;

    // Auto-create conversation if none is active
    if (!convId) {
      convId = await createConversation();
      if (!convId) return;
    }

    // Auto-title on first message
    const conv = conversations.find((c) => c.id === convId);
    if (conv && (conv.title === "New Chat" || !conv.title) && messages.length === 0) {
      const title = inputValue.trim().length > TITLE_MAX_LENGTH ? inputValue.trim().slice(0, TITLE_MAX_LENGTH) + "\u2026" : inputValue.trim();
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title } : c)),
      );
      conversationAdapter.patchConversation(convId, { title }).catch((e) => console.warn("[Chat] title update failed", e));
    }

    // Cancel any pending debounced PATCH to avoid concurrent writes
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // Persist config before sending — must complete before message POST
    // so the Engine sees the model_id in the conversation config
    await conversationAdapter.patchConversation(convId, {
      config: {
        enabled_agent_ids: enabledAgentIds,
        enabled_graph_ids: enabledGraphIds,
        model_id: effectiveChatConfig.modelId,
        model_override: effectiveChatConfig.modelOverride,
        supervisor_prompt: effectiveChatConfig.supervisorPrompt,
      },
    }).catch((e) => console.warn("[Chat] pre-send config persist failed", e));

    const files = attachedFiles.length > 0 ? attachedFiles.map((af) => af.file) : undefined;
    sendMessage(inputValue, convId ?? undefined, files, effectiveChatConfig.supervisorMode);
    setInputValue("");
    setAttachedFiles([]);
  }, [inputValue, attachedFiles, isStreaming, activeConversationId, createConversation, enabledAgentIds, enabledGraphIds, effectiveChatConfig, sendMessage, conversations, messages.length, setConversations]);

  const handleToggleAgent = useCallback((agentId: string) => {
    setEnabledAgentIds((prev) => toggleArrayItem(prev, agentId));
  }, []);

  const handleToggleGraph = useCallback((graphId: string) => {
    setEnabledGraphIds((prev) => toggleArrayItem(prev, graphId));
  }, []);

  const handleEditMessage = useCallback((messageId: string, newContent: string) => {
    editMessage(messageId, newContent);
  }, [editMessage]);

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
        {/* Header */}
        <div className="h-14 border-b flex items-center justify-between px-4 shrink-0">
          <p className="text-sm font-medium truncate min-w-0">
            {conversations.find((c) => c.id === activeConversationId)?.title || "New Chat"}
          </p>
          <button
            onClick={() => setPanelOpen((prev) => !prev)}
            className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Toggle insights panel"
          >
            <PanelRight className="h-4 w-4" />
          </button>
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
          selectedMessageId={selectedMessageId}
          onSelectMessage={setSelectedMessageId}
          attachmentBaseUrl="/api/chat"
          pendingApproval={pendingApproval}
          approvalDecision={approvalDecision}
          onApprove={approveExecution}
          onReject={rejectExecution}
          onRegenerate={regenerateLastMessage}
          onEditMessage={handleEditMessage}
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
              selectedModelId={effectiveChatConfig.modelId}
              onModelChange={(modelId) => handleConfigChange({ modelId })}
              getModelId={(m) => `${m.provider}:${m.model_id}`}
              onCompact={activeConversationId ? async () => {
                await conversationAdapter.compactConversation(activeConversationId);
              } : undefined}
              compactDisabled={messages.length < 4 || isStreaming}
              contextPercent={contextPercent}
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
          isLiveSelected={isLiveSelected}
          config={effectiveChatConfig}
          onConfigChange={handleConfigChange}
          models={models}
          supervisorLayers={supervisorLayers}
          onUpdateLayer={updateSupervisorLayer}
          selectedModelContextWindow={selectedModelContextWindow}
          enabledAgents={(agents || []).filter((a) => enabledAgentIds.includes(a.id))}
          enabledGraphs={(graphs || []).filter((g) => enabledGraphIds.includes(g.id))}
          allAgents={agents || []}
          allGraphs={graphs || []}
          onCompact={activeConversationId ? async () => {
            return conversationAdapter.compactConversation(activeConversationId);
          } : undefined}
        />
      )}
    </div>
  );
}
