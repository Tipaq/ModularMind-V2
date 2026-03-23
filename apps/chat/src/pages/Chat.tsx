import { useEffect, useState, useCallback, useMemo } from "react";
import { Bot, Zap, PanelRight, Code2 } from "lucide-react";
import {
  useChat, useConversations, useChatConfig, useArtifacts,
  ChatMessages, ChatInput, InsightsPanel, ArtifactPanel,
  useAuthStore, toggleArrayItem, formatModelName,
} from "@modularmind/ui";
import type { EngineModel, DetectedArtifact } from "@modularmind/ui";
import { ChatSidebar } from "../components/ChatSidebar";
import { chatAdapter, conversationAdapter, chatConfigAdapter } from "../lib/chat-adapter";
import { useChatConfigPersistence } from "../hooks/useChatConfigPersistence";
import { useChatSend } from "../hooks/useChatSend";
import { useExecutionData } from "../hooks/useExecutionData";

const MIN_MESSAGES_FOR_COMPACT = 4;

type RightPanel = "insights" | "artifacts" | null;

export function Chat() {
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
    messages, isStreaming, error, activities, executionDataMap, streamingMessageId,
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

  return (
    <div className="flex h-full w-full">
      <ChatSidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onCreate={createConversation}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="h-14 border-b flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{activeTitle}</p>
              {runningActivityLabel && (
                <p className="text-xs text-muted-foreground truncate">{runningActivityLabel}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {latestTokenUsage && (
              <span className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground">
                <Zap className="h-3 w-3" />
                {latestTokenUsage.total}
              </span>
            )}
            <button
              onClick={() => togglePanel("artifacts")}
              className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${rightPanel === "artifacts" ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              title="Toggle artifacts panel"
            >
              <Code2 className="h-4 w-4" />
            </button>
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

      {rightPanel === "insights" && (
        <InsightsPanel
          selectedExecution={selectedExecution}
          liveActivities={activities}
          isStreaming={isStreaming}
          isLiveSelected={isLiveSelected}
          config={insightsConfig}
          onConfigChange={handleConfigChange}
          models={models}
          supervisorLayers={supervisorLayers ?? []}
          onUpdateLayer={updateSupervisorLayer ?? (async () => false)}
          selectedModelContextWindow={selectedModel?.context_window ?? null}
          enabledAgents={enabledAgents}
          enabledGraphs={enabledGraphs}
          allAgents={agents}
          allGraphs={graphs}
          onCompact={activeConversationId ? handleCompact : undefined}
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

export default Chat;
