import { useState, useCallback, useMemo, useEffect } from "react";
import { RotateCcw } from "lucide-react";
import {
  useChat,
  useChatConfig,
  ChatMessages,
  ChatInput,
  ChatEmptyState,
  Button,
  useAuthStore,
} from "@modularmind/ui";
import type { EngineModel, AttachedFile } from "@modularmind/ui";
import {
  chatAdapter,
  conversationAdapter,
  chatConfigAdapter,
} from "../../lib/chat-adapter";

const STORAGE_KEY_PREFIX = "mm:agent-playground:";

interface AgentPlaygroundProps {
  agentId: string;
  agentName: string;
}

export function AgentPlayground({ agentId, agentName }: AgentPlaygroundProps) {
  const user = useAuthStore((s) => s.user);

  const [conversationId, setConversationId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(`${STORAGE_KEY_PREFIX}${agentId}`) ?? null;
    } catch {
      return null;
    }
  });

  const [inputValue, setInputValue] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  const { models, load: loadConfig } = useChatConfig(chatConfigAdapter);

  useEffect(() => {
    if (user) loadConfig();
  }, [user, loadConfig]);

  const availableModels = useMemo(
    () => models.filter((m) => m.is_active && m.is_available && !m.is_embedding),
    [models],
  );

  const toEngineModelId = useCallback(
    (m: EngineModel) => `${m.provider}:${m.model_id}`,
    [],
  );

  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const effectiveModelId = useMemo(() => {
    if (selectedModelId) return selectedModelId;
    if (availableModels.length > 0) return toEngineModelId(availableModels[0]);
    return null;
  }, [selectedModelId, availableModels, toEngineModelId]);

  const {
    messages,
    isStreaming,
    error,
    activities,
    sendMessage,
    setInitialMessages,
    cancelStream,
  } = useChat(conversationId, chatAdapter);

  const createConversation = useCallback(async () => {
    const conv = await conversationAdapter.createConversation({
      agent_id: agentId,
      title: agentName,
      supervisor_mode: false,
    });
    setConversationId(conv.id);
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${agentId}`, conv.id);
    } catch { /* ignore */ }
    return conv.id;
  }, [agentId, agentName]);

  const handleSend = useCallback(async () => {
    const content = inputValue.trim();
    if (!content) return;

    let targetConvId = conversationId;
    if (!targetConvId) {
      try {
        targetConvId = await createConversation();
      } catch {
        return;
      }
    }

    setInputValue("");
    sendMessage(content, targetConvId);
  }, [inputValue, conversationId, createConversation, sendMessage]);

  const handleNewConversation = useCallback(async () => {
    try {
      await createConversation();
      setInitialMessages([]);
      setInputValue("");
    } catch { /* ignore */ }
  }, [createConversation, setInitialMessages]);

  const disabledReason = !effectiveModelId ? "No model available" : null;

  return (
    <div className="flex flex-col h-full relative">
      {conversationId && (
        <div className="absolute top-2 right-2 z-10">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleNewConversation}
            className="h-7 text-xs gap-1"
          >
            <RotateCcw className="h-3 w-3" />
            New
          </Button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {messages.length === 0 ? (
          <ChatEmptyState
            title="Test this agent"
            subtitle="Send a message to test the agent and see its response"
          />
        ) : (
          <ChatMessages
            messages={messages}
            isStreaming={isStreaming}
            activities={activities}
          />
        )}
      </div>

      {error && (
        <div className="px-3 py-2 text-xs text-destructive bg-destructive/10 border-t border-destructive/20">
          {error}
        </div>
      )}

      <div className="border-t border-border shrink-0">
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          isStreaming={isStreaming}
          onCancel={cancelStream}
          agents={[]}
          graphs={[]}
          enabledAgentIds={[]}
          enabledGraphIds={[]}
          onToggleAgent={() => {}}
          onToggleGraph={() => {}}
          onFilesChange={setAttachedFiles}
          disabledReason={disabledReason}
          models={availableModels}
          selectedModelId={effectiveModelId}
          onModelChange={setSelectedModelId}
          getModelId={toEngineModelId}
        />
      </div>
    </div>
  );
}
