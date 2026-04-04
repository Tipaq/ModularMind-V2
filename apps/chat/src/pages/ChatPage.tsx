import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  useChat, useConversations, useChatConfig, useArtifacts,
  ChatMessages, ChatInput, ChatErrorBanner,
  useAuthStore, toggleArrayItem, formatModelName,
} from "@modularmind/ui";
import type { EngineModel, DetectedArtifact } from "@modularmind/ui";
import { ConversationProvider } from "../contexts/ConversationContext";
import { chatAdapter, conversationAdapter, chatConfigAdapter } from "../lib/chat-adapter";
import { useChatConfigPersistence } from "../hooks/useChatConfigPersistence";
import { useChatSend } from "../hooks/useChatSend";
import { useExecutionData } from "../hooks/useExecutionData";
import { ChatHeader } from "../components/chat/ChatHeader";
import { ChatRightPanels } from "../components/chat/ChatRightPanels";

const MIN_MESSAGES_FOR_COMPACT = 4;

type RightPanel = "insights" | "artifacts" | null;

export function ChatPage() {
  const { conversationId: routeConversationId } = useParams<{ conversationId: string }>();
  const [enabledAgentIds, setEnabledAgentIds] = useState<string[]>([]);
  const [enabledGraphIds, setEnabledGraphIds] = useState<string[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);

  const user = useAuthStore((s) => s.user);
  const { agents, graphs, models, supervisorLayers, updateSupervisorLayer, reload: reloadConfig } =
    useChatConfig(chatConfigAdapter);

  const toEngineModelId = useCallback((m: EngineModel) => `${m.provider}:${m.model_id}`, []);
  const availableModels = useMemo(
    () => models.filter((m) => m.is_active && m.is_available && !m.is_embedding),
    [models],
  );

  const { chatConfig, setChatConfig, flushDebounce, handleModelChange, handleConfigChange } =
    useChatConfigPersistence({
      activeConversationId, enabledAgentIds, enabledGraphIds, adapter: conversationAdapter,
    });

  const effectiveModelId = useMemo(() => {
    if (chatConfig.modelId) return chatConfig.modelId;
    if (availableModels.length > 0) return toEngineModelId(availableModels[0]);
    return null;
  }, [chatConfig.modelId, availableModels, toEngineModelId]);

  const {
    messages, isStreaming, error, clearError, activities, executionDataMap, streamingMessageId,
    pendingApproval, approvalDecision, sendMessage, setInitialMessages,
    cancelStream, approveExecution, rejectExecution, regenerateLastMessage, editMessage,
  } = useChat(activeConversationId, chatAdapter);

  const {
    conversations, setConversations, crudError, handleSelectConversation,
    createConversation, handleDeleteConversation, handleRenameConversation,
  } = useConversations({
    authenticated: user, activeConversationId, setActiveConversationId,
    setInitialMessages, setChatConfig, setEnabledAgentIds, setEnabledGraphIds,
    enabledAgentIds, enabledGraphIds,
    supervisorMode: chatConfig.supervisorMode, modelId: effectiveModelId,
    adapter: conversationAdapter,
  });

  const { artifacts, selectedArtifactId, selectedArtifact, addArtifact, selectArtifact, clearArtifacts } =
    useArtifacts();

  const { inputValue, setInputValue, setAttachedFiles, handleSend } = useChatSend({
    activeConversationId, conversations, messages, isStreaming, effectiveModelId, chatConfig,
    enabledAgentIds, enabledGraphIds, createConversation, sendMessage, setConversations,
    flushDebounce, adapter: conversationAdapter,
  });

  const { isLiveSelected, selectedExecution, latestTokenUsage } = useExecutionData({
    messages, executionDataMap, streamingMessageId, selectedMessageId, isStreaming,
  });

  useEffect(() => { if (user) reloadConfig(); }, [user, reloadConfig]);
  useEffect(() => { clearArtifacts(); }, [activeConversationId, clearArtifacts]);

  useEffect(() => {
    if (routeConversationId && routeConversationId !== activeConversationId) {
      handleSelectConversation(routeConversationId);
    }
  }, [routeConversationId, activeConversationId, handleSelectConversation]);

  const handleToggleAgent = useCallback(
    (agentId: string) => setEnabledAgentIds((prev) => toggleArrayItem(prev, agentId)), [],
  );
  const handleToggleGraph = useCallback(
    (graphId: string) => setEnabledGraphIds((prev) => toggleArrayItem(prev, graphId)), [],
  );

  const selectedModel = useMemo(
    () => availableModels.find(
      (m) => toEngineModelId(m) === effectiveModelId || m.id === effectiveModelId,
    ) ?? null,
    [availableModels, effectiveModelId, toEngineModelId],
  );

  const insightsConfig = useMemo(() => ({
    supervisorMode: chatConfig.supervisorMode,
    supervisorPrompt: "",
    modelId: effectiveModelId,
    modelOverride: chatConfig.modelOverride,
    userPreferences: chatConfig.userPreferences,
    supervisorToolCategories: chatConfig.supervisorToolCategories,
  }), [chatConfig, effectiveModelId]);

  const handleCompact = useCallback(async () => {
    if (!activeConversationId) return { summary_preview: "", compacted_count: 0, duration_ms: 0 };
    return conversationAdapter.compactConversation(activeConversationId);
  }, [activeConversationId]);

  const handleArtifactDetected = useCallback((artifact: DetectedArtifact) => {
    addArtifact(artifact);
    if (!rightPanel) {
      setRightPanel("artifacts");
      selectArtifact(artifact.id);
    }
  }, [addArtifact, rightPanel, selectArtifact]);

  const togglePanel = useCallback(
    (panel: "insights" | "artifacts") => setRightPanel((prev) => (prev === panel ? null : panel)), [],
  );

  const enabledAgents = useMemo(() => agents.filter((a) => enabledAgentIds.includes(a.id)), [agents, enabledAgentIds]);
  const enabledGraphs = useMemo(() => graphs.filter((g) => enabledGraphIds.includes(g.id)), [graphs, enabledGraphIds]);
  const activeTitle = conversations.find((c) => c.id === activeConversationId)?.title || "Chat";

  const runningActivityLabel = useMemo(() => {
    if (!isStreaming) return null;
    return activities.find((a) => a.status === "running")?.label || "Thinking...";
  }, [isStreaming, activities]);

  const conversationContextValue = useMemo(() => ({
    conversations,
    activeConversationId,
    onSelect: handleSelectConversation,
    onCreate: createConversation,
    onDelete: handleDeleteConversation,
    onRename: handleRenameConversation,
  }), [conversations, activeConversationId, handleSelectConversation, createConversation, handleDeleteConversation, handleRenameConversation]);

  return (
    <ConversationProvider value={conversationContextValue}>
      <div className="flex h-full w-full">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ChatHeader
            title={activeTitle}
            runningActivityLabel={runningActivityLabel}
            latestTokenUsage={latestTokenUsage}
            rightPanel={rightPanel}
            onTogglePanel={togglePanel}
          />

          <ChatErrorBanner
            error={error}
            crudError={crudError}
            onDismiss={clearError}
            onRetry={regenerateLastMessage}
          />

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
            onEditMessage={editMessage}
            onArtifactDetected={handleArtifactDetected}
            selectedMessageId={selectedMessageId}
            onSelectMessage={setSelectedMessageId}
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
                disabledReason={effectiveModelId ? null : "Select a model before sending"}
                models={models}
                selectedModelId={effectiveModelId}
                onModelChange={handleModelChange}
                modelLabel={(m) => formatModelName(m.model_id || m.name)}
                onCompact={handleCompact}
                compactDisabled={messages.length < MIN_MESSAGES_FOR_COMPACT || isStreaming}
              />
            }
          />
        </div>

        <ChatRightPanels
          rightPanel={rightPanel}
          onCloseArtifacts={() => setRightPanel(null)}
          insightsProps={{
            selectedExecution, liveActivities: activities, isStreaming, isLiveSelected,
            config: insightsConfig, onConfigChange: handleConfigChange, models,
            supervisorLayers: supervisorLayers ?? [],
            onUpdateLayer: updateSupervisorLayer ?? (async () => false),
            selectedModelContextWindow: selectedModel?.context_window ?? null,
            enabledAgents, enabledGraphs, allAgents: agents, allGraphs: graphs,
            onCompact: activeConversationId ? handleCompact : undefined,
          }}
          artifactProps={{
            artifacts, selectedArtifactId, selectedArtifact, onSelectArtifact: selectArtifact,
          }}
        />
      </div>
    </ConversationProvider>
  );
}

export default ChatPage;
