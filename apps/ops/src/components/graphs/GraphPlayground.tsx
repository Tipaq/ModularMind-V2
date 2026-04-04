import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import {
  usePlayground,
  ChatMessages,
  ChatInput,
  ChatEmptyState,
  Button,
} from "@modularmind/ui";
import type { EngineModel } from "@modularmind/ui";
import type { ExecutionActivity } from "@modularmind/ui";
import type { ValidationIssue } from "@modularmind/api-client";
import { chatAdapter, conversationAdapter } from "../../lib/chat-adapter";
import { useModelsStore } from "../../stores/models";

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
  const { unifiedCatalog, fetchUnifiedCatalog } = useModelsStore();

  useEffect(() => {
    if (unifiedCatalog.length === 0) fetchUnifiedCatalog();
  }, [unifiedCatalog.length, fetchUnifiedCatalog]);

  const availableModels: EngineModel[] = useMemo(
    () =>
      unifiedCatalog
        .filter((m) => m.unifiedStatus === "ready")
        .map((m) => ({
          id: m.id,
          name: m.name,
          provider: m.provider,
          model_id: m.model_name,
          display_name: m.name,
          context_window: m.context_window,
          is_active: true,
          is_available: true,
          is_embedding: false,
        })),
    [unifiedCatalog],
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
    () => ({ graph_id: graphId, supervisor_mode: false as const }),
    [graphId],
  );

  const patchConfigOnSend = useCallback(
    async (convId: string) => {
      if (effectiveModelId) {
        await conversationAdapter.patchConversation(convId, {
          config: { model_id: effectiveModelId },
        });
      }
    },
    [effectiveModelId],
  );

  const {
    conversationId, inputValue, setInputValue, setAttachedFiles,
    messages, isStreaming, error, activities,
    pendingPrompt, respondToPrompt,
    handleSend, handleNewConversation, cancelStream,
  } = usePlayground({
    storageKeyPrefix: "mm:graph-playground:",
    entityId: graphId,
    entityName: graphName,
    createBody,
    chatAdapter,
    conversationAdapter,
    patchConfigOnSend,
  });

  const onActivitiesChangeRef = useRef(onActivitiesChange);

  useEffect(() => {
    onActivitiesChangeRef.current = onActivitiesChange;
  }, [onActivitiesChange]);

  useEffect(() => {
    onActivitiesChangeRef.current?.(activities, isStreaming);
  }, [activities, isStreaming]);

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
            pendingPrompt={pendingPrompt}
            onRespondToPrompt={respondToPrompt}
          />
        )}
      </div>

      {error && (
        <div className="px-3 py-2 text-xs text-destructive bg-destructive/10 border-t border-destructive/20">
          {error.message}
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
