import type { ToolCategories } from "@modularmind/api-client";

export const TOOL_CATEGORIES: { key: string; label: string; description: string }[] = [
  { key: "knowledge", label: "Knowledge", description: "Search and retrieve from knowledge bases" },
  { key: "filesystem", label: "Filesystem", description: "Read and write local files" },
  { key: "shell", label: "Shell", description: "Execute shell commands in sandbox" },
  { key: "network", label: "Network", description: "Make HTTP requests to external APIs" },
  { key: "file_storage", label: "File Storage", description: "Upload and manage S3/MinIO files" },
  { key: "human_interaction", label: "Human Interaction", description: "Request input or approval from users" },
  { key: "image_generation", label: "Image Generation", description: "Generate images via AI models" },
  { key: "custom_tools", label: "Custom Tools", description: "User-defined MCP tool servers" },
  { key: "mini_apps", label: "Mini Apps", description: "Execute mini app workflows" },
  { key: "github", label: "GitHub", description: "Interact with GitHub repositories and issues" },
  { key: "web", label: "Web", description: "Browse and scrape web pages" },
  { key: "git", label: "Git", description: "Execute git operations" },
  { key: "scheduling", label: "Scheduling", description: "Create and manage scheduled tasks" },
];

export function isCategoryEnabled(
  value: boolean | Record<string, boolean> | undefined,
): boolean {
  if (value === undefined || value === false) return false;
  if (value === true) return true;
  return Object.values(value).some(Boolean);
}

export function getToolEnabled(
  categoryValue: boolean | Record<string, boolean> | undefined,
  toolName: string,
): boolean {
  if (categoryValue === undefined || categoryValue === false) return false;
  if (categoryValue === true) return true;
  return categoryValue[toolName] ?? true;
}

export function getEnabledToolCount(
  categoryValue: boolean | Record<string, boolean> | undefined,
  totalTools: number,
): number {
  if (categoryValue === undefined || categoryValue === false) return 0;
  if (categoryValue === true) return totalTools;
  return Object.values(categoryValue).filter(Boolean).length;
}

export function countEnabledCategories(categories: ToolCategories): number {
  return Object.values(categories).filter(isCategoryEnabled).length;
}
