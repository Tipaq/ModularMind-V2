export interface ChatConfig {
  supervisorMode: boolean;
  supervisorPrompt: string;
  modelId: string | null;
  modelOverride: boolean;
}

export const DEFAULT_CHAT_CONFIG: ChatConfig = {
  supervisorMode: true,
  supervisorPrompt: "",
  modelId: null,
  modelOverride: false,
};
