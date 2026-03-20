export interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  parameters: Record<string, unknown>;
}

export interface ToolCategoryInfo {
  id: string;
  label: string;
  description: string;
  tool_count: number;
  enabled_by_default: boolean;
}

export interface ToolsOverview {
  categories: ToolCategoryInfo[];
  tools: ToolDefinition[];
  total_count: number;
}
