"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useChat, type Message } from "@/hooks/useChat";
import { useChatConfig } from "@/hooks/useChatConfig";
import type { Conversation } from "@modularmind/api-client";
import { ConversationSidebar, ChatMessages, ChatInput, InsightsPanel, DEFAULT_CHAT_CONFIG, toggleArrayItem } from "@modularmind/ui";
import type { AttachedFile, ChatConfig } from "@modularmind/ui";
import { PanelRight } from "lucide-react";


const CONVERSATION_PAGE_SIZE = 50;
const TITLE_MAX_LENGTH = 50;
const CONFIG_DEBOUNCE_MS = 500;

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [enabledAgentIds, setEnabledAgentIds] = useState<string[]>([]);
  const [enabledGraphIds, setEnabledGraphIds] = useState<string[]>([]);
  const [chatConfig, setChatConfig] = useState<ChatConfig>(DEFAULT_CHAT_CONFIG);
  const [panelOpen, setPanelOpen] = useState(true);

  const { status: sessionStatus } = useSession();
  const { agents, graphs, models, supervisorLayers, load: loadConfig, updateSupervisorLayer } = useChatConfig();
  const {
    messages,
    isStreaming,
    error,
    activities,
    executionDataMap,
    selectedMessageId,
    setSelectedMessageId,
    streamingMessageId,
    sendMessage,
    setInitialMessages,
    cancelStream,
  } = useChat(activeConversationId);

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

  // Debounce config persistence
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load data once session is authenticated
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    let active = true;
    loadConfig();
    (async () => {
      try {
        const res = await fetch(`/api/chat/conversations?page_size=${CONVERSATION_PAGE_SIZE}`);
        if (!res.ok || !active) return;
        const data = await res.json();
        const items: Conversation[] = data.items || [];

        // Clean up orphaned conversations (created but cancelled before first response)
        const orphans = items.filter((c) => c.message_count === 0);
        const valid = items.filter((c) => c.message_count > 0);
        if (orphans.length > 0) {
          orphans.forEach((c) =>
            fetch(`/api/chat/conversations/${c.id}`, { method: "DELETE" }).catch(() => {}),
          );
        }

        if (active) setConversations(valid);
      } catch {
        // Silently ignore – component will show empty state
      }
    })();
    return () => { active = false; };
  }, [sessionStatus, loadConfig]);

  // Load messages when selecting a conversation
  const handleSelectConversation = useCallback(
    async (id: string) => {
      setActiveConversationId(id);
      try {
        const res = await fetch(`/api/chat/conversations/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        const msgs: Message[] = (data.messages || []).map(
          (m: { id: string; role: string; content: string; created_at: string; metadata?: Record<string, unknown>; attachments?: { id: string; filename: string; content_type: string; size_bytes: number }[] }) => ({
            id: m.id,
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
            created_at: m.created_at,
            metadata: m.metadata || {},
            attachments: m.attachments,
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
          userPreferences: convConfig.user_preferences || null,
        });
      } catch {
        // Fetch failed – conversation panel stays in previous state
      }
    },
    [setInitialMessages],
  );

  const createConversation = useCallback(async (): Promise<string | null> => {
    try {
      const body: Record<string, unknown> = {
        title: "New Chat",
        supervisor_mode: effectiveChatConfig.supervisorMode,
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
      setChatConfig({ ...DEFAULT_CHAT_CONFIG, supervisorMode: effectiveChatConfig.supervisorMode });
      return conv.id as string;
    } catch (err) {
      console.error("[Chat]", err);
      return null;
    }
  }, [enabledAgentIds, enabledGraphIds, effectiveChatConfig.supervisorMode, setInitialMessages]);

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
          setChatConfig(DEFAULT_CHAT_CONFIG);
        }
      } catch {
        // Delete failed – keep conversation in list
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
        // Rename failed – keep previous title
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
      fetch(`/api/chat/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }).catch((e) => console.warn("[Chat] title update failed", e));
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
          model_id: effectiveChatConfig.modelId,
          model_override: effectiveChatConfig.modelOverride,
          supervisor_prompt: effectiveChatConfig.supervisorPrompt,
        },
      }),
    }).catch((e) => console.warn("[Chat] pre-send config persist failed", e));

    const files = attachedFiles.length > 0 ? attachedFiles.map((af) => af.file) : undefined;
    sendMessage(inputValue, convId ?? undefined, files);
    setInputValue("");
    setAttachedFiles([]);
  }, [inputValue, attachedFiles, isStreaming, activeConversationId, createConversation, enabledAgentIds, enabledGraphIds, effectiveChatConfig, sendMessage, conversations, messages.length]);

  const handleToggleAgent = useCallback((agentId: string) => {
    setEnabledAgentIds((prev) => toggleArrayItem(prev, agentId));
  }, []);

  const handleToggleGraph = useCallback((graphId: string) => {
    setEnabledGraphIds((prev) => toggleArrayItem(prev, graphId));
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

        {error && (
          <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm border-b border-destructive/20 shrink-0">
            {error}
          </div>
        )}

        <ChatMessages
          messages={messages}
          isStreaming={isStreaming}
          activities={activities}
          selectedMessageId={selectedMessageId}
          onSelectMessage={setSelectedMessageId}
          attachmentBaseUrl="/api/chat"
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
              onCompact={async () => {
                if (!activeConversationId) return;
                const res = await fetch("/api/chat/compact", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ conversation_id: activeConversationId }),
                });
                if (!res.ok) throw new Error("Compaction failed");
              }}
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
          config={chatConfig}
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
            const res = await fetch("/api/chat/compact", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ conversation_id: activeConversationId }),
            });
            if (!res.ok) throw new Error("Compaction failed");
            return res.json();
          } : undefined}
        />
      )}
    </div>
  );
}
