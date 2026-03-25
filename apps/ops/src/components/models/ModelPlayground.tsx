import { useCallback, useMemo, useRef, useEffect } from "react";
import { RotateCcw } from "lucide-react";
import {
  usePlayground,
  ChatMessages,
  ChatInput,
  ChatEmptyState,
  Button,
} from "@modularmind/ui";
import { chatAdapter, conversationAdapter } from "../../lib/chat-adapter";

interface ModelPlaygroundProps {
  provider: string;
  modelName: string;
  displayName: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

export function ModelPlayground({
  provider,
  modelName,
  displayName,
  temperature,
  maxTokens,
  systemPrompt,
}: ModelPlaygroundProps) {
  const modelId = `${provider}:${modelName}`;

  const temperatureRef = useRef(temperature);
  const maxTokensRef = useRef(maxTokens);
  const systemPromptRef = useRef(systemPrompt);

  useEffect(() => { temperatureRef.current = temperature; }, [temperature]);
  useEffect(() => { maxTokensRef.current = maxTokens; }, [maxTokens]);
  useEffect(() => { systemPromptRef.current = systemPrompt; }, [systemPrompt]);

  const createBody = useMemo(
    () => ({
      config: {
        model_id: modelId,
        system_prompt: systemPrompt,
        temperature,
        max_tokens: maxTokens,
      },
    }),
    [modelId, systemPrompt, temperature, maxTokens],
  );

  const patchConfigOnSend = useCallback(
    async (convId: string) => {
      await conversationAdapter.patchConversation(convId, {
        config: {
          model_id: modelId,
          system_prompt: systemPromptRef.current,
          temperature: temperatureRef.current,
          max_tokens: maxTokensRef.current,
        },
      });
    },
    [modelId],
  );

  const {
    conversationId, inputValue, setInputValue, setAttachedFiles,
    messages, isStreaming, error, activities,
    pendingPrompt, respondToPrompt,
    handleSend, handleNewConversation, cancelStream,
  } = usePlayground({
    storageKeyPrefix: "mm:model-playground:",
    entityId: modelId,
    entityName: displayName,
    createBody,
    chatAdapter,
    conversationAdapter,
    patchConfigOnSend,
  });

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
            title={`Test ${displayName}`}
            subtitle="Send a message to test this model directly"
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
        />
      </div>
    </div>
  );
}
