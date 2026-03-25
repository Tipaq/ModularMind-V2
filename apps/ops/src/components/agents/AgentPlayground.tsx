import { useState, useCallback, useMemo, useEffect } from "react";
import { RotateCcw } from "lucide-react";
import {
  usePlayground,
  useChatConfig,
  ChatMessages,
  ChatInput,
  ChatEmptyState,
  Button,
  useAuthStore,
} from "@modularmind/ui";
import type { EngineModel } from "@modularmind/ui";
import {
  chatAdapter,
  conversationAdapter,
  chatConfigAdapter,
} from "../../lib/chat-adapter";

interface AgentPlaygroundProps {
  agentId: string;
  agentName: string;
}

export function AgentPlayground({ agentId, agentName }: AgentPlaygroundProps) {
  const user = useAuthStore((s) => s.user);
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

  const createBody = useMemo(
    () => ({ agent_id: agentId, supervisor_mode: false as const }),
    [agentId],
  );

  const {
    conversationId, inputValue, setInputValue, setAttachedFiles,
    messages, isStreaming, error, activities,
    pendingPrompt, respondToPrompt,
    handleSend, handleNewConversation, cancelStream,
  } = usePlayground({
    storageKeyPrefix: "mm:agent-playground:",
    entityId: agentId,
    entityName: agentName,
    createBody,
    chatAdapter,
    conversationAdapter,
  });

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
            pendingPrompt={pendingPrompt}
            onRespondToPrompt={respondToPrompt}
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
