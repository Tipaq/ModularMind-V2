import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import {
  useChat, useConversations, useChatConfig, useArtifacts,
  useAuthStore, toggleArrayItem, formatModelName,
} from "@modularmind/ui";
import type { EngineModel, DetectedArtifact } from "@modularmind/ui";
import { chatAdapter, conversationAdapter } from "@modularmind/api-client";
import { chatConfigAdapter } from "../lib/chat-adapter";
import { useChatConfigPersistence } from "./useChatConfigPersistence";
import { useChatSend } from "./useChatSend";
import { useExecutionData } from "./useExecutionData";

const MIN_MESSAGES_FOR_COMPACT = 4;

type RightPanel = "insights" | "artifacts" | null;

export function useChatPage() {
  const { conversationId: routeConversationId, projectId } = useParams<{
    conversationId: string;
    projectId: string;
  }>();
  const location = useLocation();
  const initialMessageRef = useRef<string | null>(
    (location.state as { initialMessage?: string } | null)?.initialMessage ?? null,
  );
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
    cancelStream, approveExecution, rejectExecution, respondToPrompt, regenerateLastMessage, editMessage,
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

  const { inputValue, setInputValue, setAttachedFiles, handleSend, sendDirectMessage } = useChatSend({
    activeConversationId, conversations, messageCount: messages.length, isStreaming, effectiveModelId, chatConfig,
    enabledAgentIds, enabledGraphIds, createConversation, sendMessage, setConversations,
    flushDebounce, adapter: conversationAdapter,
  });

  const { isLiveSelected, selectedExecution, latestTokenUsage } = useExecutionData({
    messages, executionDataMap, streamingMessageId, selectedMessageId, isStreaming,
  });

  useEffect(() => { if (user) reloadConfig(); }, [user, reloadConfig]);
  useEffect(() => { clearArtifacts(); }, [activeConversationId, clearArtifacts]);

  useEffect(() => {
    const pending = initialMessageRef.current;
    if (!pending || !activeConversationId || !effectiveModelId) return;
    initialMessageRef.current = null;
    window.history.replaceState({}, "");
    sendDirectMessage(pending);
  }, [activeConversationId, effectiveModelId, sendDirectMessage]);

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

  const isCompactDisabled = messages.length < MIN_MESSAGES_FOR_COMPACT || isStreaming;
  const disabledReason = effectiveModelId ? null : "Select a model before sending";

  const modelLabel = useCallback(
    (m: EngineModel) => formatModelName(m.model_id || m.name),
    [],
  );

  const handleCloseRightPanel = useCallback(() => setRightPanel(null), []);

  return {
    projectId,
    activeConversationId,
    rightPanel,
    conversationContextValue,
    activeTitle,
    runningActivityLabel,
    latestTokenUsage,
    togglePanel,
    error,
    crudError,
    clearError,
    regenerateLastMessage,
    messages,
    isStreaming,
    activities,
    pendingApproval,
    approvalDecision,
    approveExecution,
    rejectExecution,
    respondToPrompt,
    editMessage,
    handleArtifactDetected,
    selectedMessageId,
    setSelectedMessageId,
    inputValue,
    setInputValue,
    handleSend,
    cancelStream,
    agents,
    graphs,
    enabledAgentIds,
    enabledGraphIds,
    handleToggleAgent,
    handleToggleGraph,
    setAttachedFiles,
    disabledReason,
    models,
    effectiveModelId,
    handleModelChange,
    modelLabel,
    handleCompact,
    isCompactDisabled,
    handleCloseRightPanel,
    selectedExecution,
    isLiveSelected,
    insightsConfig,
    handleConfigChange,
    supervisorLayers,
    updateSupervisorLayer,
    selectedModel,
    enabledAgents,
    enabledGraphs,
    artifacts,
    selectedArtifactId,
    selectedArtifact,
    selectArtifact,
  };
}
