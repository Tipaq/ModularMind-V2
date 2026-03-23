import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatConfig, ConversationAdapter } from "@modularmind/ui";
import { DEFAULT_CHAT_CONFIG } from "@modularmind/ui";

const CONFIG_DEBOUNCE_MS = 500;

interface UseChatConfigPersistenceParams {
  activeConversationId: string | null;
  enabledAgentIds: string[];
  enabledGraphIds: string[];
  adapter: ConversationAdapter;
}

export function useChatConfigPersistence({
  activeConversationId,
  enabledAgentIds,
  enabledGraphIds,
  adapter,
}: UseChatConfigPersistenceParams) {
  const [chatConfig, setChatConfig] = useState<ChatConfig>(DEFAULT_CHAT_CONFIG);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const persistConfig = useCallback(
    (newConfig: ChatConfig) => {
      if (!activeConversationId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        adapter
          .patchConversation(activeConversationId, {
            supervisor_mode: newConfig.supervisorMode,
            config: {
              enabled_agent_ids: enabledAgentIds,
              enabled_graph_ids: enabledGraphIds,
              model_id: newConfig.modelId,
              model_override: newConfig.modelOverride,
              ...(newConfig.supervisorToolCategories !== null && {
                supervisor_tool_categories: newConfig.supervisorToolCategories,
              }),
            },
          })
          .catch((err: unknown) => console.error("[Chat]", err));
      }, CONFIG_DEBOUNCE_MS);
    },
    [activeConversationId, enabledAgentIds, enabledGraphIds, adapter],
  );

  const flushDebounce = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const handleModelChange = useCallback(
    (modelId: string | null) => {
      setChatConfig((prev) => {
        const next = { ...prev, modelId };
        persistConfig(next);
        return next;
      });
    },
    [persistConfig],
  );

  const handleConfigChange = useCallback(
    (patch: Partial<ChatConfig>) => {
      setChatConfig((prev) => {
        const next = {
          ...prev,
          ...(patch.supervisorMode !== undefined && { supervisorMode: patch.supervisorMode }),
          ...(patch.modelId !== undefined && { modelId: patch.modelId }),
          ...(patch.modelOverride !== undefined && { modelOverride: patch.modelOverride }),
          ...(patch.supervisorToolCategories !== undefined && {
            supervisorToolCategories: patch.supervisorToolCategories,
          }),
        };
        persistConfig(next);
        return next;
      });
    },
    [persistConfig],
  );

  return {
    chatConfig,
    setChatConfig,
    persistConfig,
    flushDebounce,
    handleModelChange,
    handleConfigChange,
  };
}
