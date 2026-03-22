export interface ChatConfig {
  supervisorMode: boolean;
  supervisorPrompt: string;
  modelId: string | null;
  modelOverride: boolean;
  userPreferences: string | null;
  supervisorToolCategories: string[] | null;
}

export const DEFAULT_CHAT_CONFIG: ChatConfig = {
  supervisorMode: true,
  supervisorPrompt: "",
  modelId: null,
  modelOverride: false,
  userPreferences: null,
  supervisorToolCategories: null,
};

export const ALL_TOOL_CATEGORIES = [
  { id: "knowledge", label: "Knowledge", description: "Search documents and knowledge bases" },
  { id: "scheduling", label: "Scheduling", description: "Create/manage scheduled tasks" },
  { id: "web", label: "Web", description: "Web search, browse URLs" },
  { id: "file_storage", label: "File Storage", description: "Upload/download files" },
  { id: "image_generation", label: "Image Gen", description: "Generate images" },
  { id: "github", label: "GitHub", description: "Repos, issues, PRs" },
  { id: "git", label: "Git", description: "Clone, commit, push" },
  { id: "filesystem", label: "Filesystem", description: "Read/write local files" },
  { id: "human_interaction", label: "Human Input", description: "Request user approval" },
  { id: "custom_tools", label: "Custom Tools", description: "Agent-defined tools" },
  { id: "mini_apps", label: "Mini Apps", description: "Interactive applications" },
  { id: "mcp", label: "MCP", description: "External MCP server tools" },
  { id: "gateway", label: "Gateway", description: "Shell, network access" },
  { id: "builtin", label: "Built-in", description: "Conversations, user profile" },
] as const;
