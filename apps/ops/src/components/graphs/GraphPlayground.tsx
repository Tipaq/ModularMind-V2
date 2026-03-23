import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
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
import type { ExecutionActivity } from "@modularmind/ui";
import type { ValidationIssue } from "@modularmind/api-client";
import {
  chatAdapter,
  conversationAdapter,
  chatConfigAdapter,
} from "../../lib/chat-adapter";

const STORAGE_KEY_PREFIX = "mm:graph-playground:";

interface GraphPlaygroundProps {
  graphId: string;
  graphName: string;
  isValid: boolean;
  validationIssues: ValidationIssue[];
  onActivitiesChange?: (activities: ExecutionActivity[], isStreaming: boolean) => void;
}

export function GraphPlayground({
  graphId,
  graphName,
  isValid,
  validationIssues,
  onActivitiesChange,
}: GraphPlaygroundProps) {
  const user = useAuthStore((s) => s.user);

  const [conversationId, setConversationId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(`${STORAGE_KEY_PREFIX}${graphId}`) ?? null;
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

  const onActivitiesChangeRef = useRef(onActivitiesChange);

  useEffect(() => {
    onActivitiesChangeRef.current = onActivitiesChange;
  }, [onActivitiesChange]);

  useEffect(() => {
    onActivitiesChangeRef.current?.(activities, isStreaming);
  }, [activities, isStreaming]);

  const handleSend = useCallback(async () => {
    const content = inputValue.trim();
    if (!content) return;

    let targetConvId = conversationId;

    if (!targetConvId) {
      try {
        const conv = await conversationAdapter.createConversation({
          graph_id: graphId,
          title: graphName,
          supervisor_mode: false,
        });
        targetConvId = conv.id;
        setConversationId(conv.id);
        try {
          localStorage.setItem(`${STORAGE_KEY_PREFIX}${graphId}`, conv.id);
        } catch { /* ignore */ }
      } catch {
        return;
      }
    }

    setInputValue("");
    sendMessage(content, targetConvId);
  }, [inputValue, conversationId, graphId, graphName, sendMessage]);

  const handleNewConversation = useCallback(async () => {
    try {
      const conv = await conversationAdapter.createConversation({
        graph_id: graphId,
        title: graphName,
        supervisor_mode: false,
      });
      setConversationId(conv.id);
      setInitialMessages([]);
      setInputValue("");
      try {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${graphId}`, conv.id);
      } catch { /* ignore */ }
    } catch { /* ignore */ }
  }, [graphId, graphName, setInitialMessages]);

  const disabledReason = !isValid
    ? "Fix validation issues first"
    : !effectiveModelId
      ? "No model available"
      : null;

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
            title="Test this graph"
            subtitle="Send a message to run the graph and see the execution"
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

      {!isValid && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
          <div className="text-center px-6 max-w-xs">
            <AlertTriangle className="h-8 w-8 text-warning mx-auto mb-3" />
            <p className="text-sm font-medium">Graph incomplete</p>
            <p className="text-xs text-muted-foreground mt-1">
              {validationIssues.map((i) => i.message).join(" · ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
