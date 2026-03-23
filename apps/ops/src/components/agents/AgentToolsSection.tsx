import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { Switch } from "@modularmind/ui";
import type {
  AgentDetail,
  AgentUpdateInput,
  ToolCategories,
  ToolDefinition,
} from "@modularmind/api-client";
import { useToolsStore } from "../../stores/tools";

interface AgentToolsSectionProps {
  agent: AgentDetail;
  isEditing: boolean;
  onChange: (data: AgentUpdateInput) => void;
}

const TOOL_CATEGORIES: { key: string; label: string; description: string }[] = [
  { key: "knowledge", label: "Knowledge", description: "Search and retrieve from knowledge bases" },
  { key: "filesystem", label: "Filesystem", description: "Read and write local files" },
  { key: "shell", label: "Shell", description: "Execute shell commands in sandbox" },
  { key: "network", label: "Network", description: "Make HTTP requests to external APIs" },
  { key: "file_storage", label: "File Storage", description: "Upload and manage S3/MinIO files" },
  {
    key: "human_interaction",
    label: "Human Interaction",
    description: "Request input or approval from users",
  },
  {
    key: "image_generation",
    label: "Image Generation",
    description: "Generate images via AI models",
  },
  { key: "custom_tools", label: "Custom Tools", description: "User-defined MCP tool servers" },
  { key: "mini_apps", label: "Mini Apps", description: "Execute mini app workflows" },
  { key: "github", label: "GitHub", description: "Interact with GitHub repositories and issues" },
  { key: "web", label: "Web", description: "Browse and scrape web pages" },
  { key: "git", label: "Git", description: "Execute git operations" },
  { key: "scheduling", label: "Scheduling", description: "Create and manage scheduled tasks" },
];

function isCategoryEnabled(value: boolean | Record<string, boolean> | undefined): boolean {
  if (value === undefined || value === false) return false;
  if (value === true) return true;
  return Object.values(value).some(Boolean);
}

function getToolEnabled(
  categoryValue: boolean | Record<string, boolean> | undefined,
  toolName: string,
): boolean {
  if (categoryValue === undefined || categoryValue === false) return false;
  if (categoryValue === true) return true;
  return categoryValue[toolName] ?? true;
}

export function AgentToolsSection({ agent, isEditing, onChange }: AgentToolsSectionProps) {
  const [categories, setCategories] = useState<ToolCategories>(agent.tool_categories || {});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const { tools: allTools, fetchTools } = useToolsStore();

  useEffect(() => {
    if (allTools.length === 0) fetchTools();
  }, [allTools.length, fetchTools]);

  useEffect(() => {
    if (!isEditing) {
      setCategories(agent.tool_categories || {});
      setExpandedCategories(new Set());
    }
  }, [isEditing, agent]);

  const toolsByCategory = allTools.reduce<Record<string, ToolDefinition[]>>((acc, tool) => {
    const cat = tool.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(tool);
    return acc;
  }, {});

  const toggleExpand = (key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updateCategories = (next: ToolCategories) => {
    setCategories(next);
    onChange({ tool_categories: next });
  };

  const handleCategoryToggle = (key: string, checked: boolean) => {
    updateCategories({ ...categories, [key]: checked });
  };

  const handleToolToggle = (categoryKey: string, toolName: string, checked: boolean) => {
    const currentValue = categories[categoryKey];
    const categoryTools = toolsByCategory[categoryKey] || [];

    let toolMap: Record<string, boolean>;
    if (typeof currentValue === "object" && currentValue !== null) {
      toolMap = { ...currentValue };
    } else {
      toolMap = {};
      for (const tool of categoryTools) {
        toolMap[tool.name] = true;
      }
    }

    toolMap[toolName] = checked;

    const allOn = Object.values(toolMap).every(Boolean);
    const allOff = Object.values(toolMap).every((v) => !v);

    if (allOn) updateCategories({ ...categories, [categoryKey]: true });
    else if (allOff) updateCategories({ ...categories, [categoryKey]: false });
    else updateCategories({ ...categories, [categoryKey]: toolMap });
  };

  const currentCategories = isEditing ? categories : agent.tool_categories;
  const enabledCount = Object.values(currentCategories).filter(isCategoryEnabled).length;

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Wrench className="h-3.5 w-3.5" />
        Tool Categories ({enabledCount} enabled)
      </div>

      <div className="space-y-1">
        {TOOL_CATEGORIES.map((cat) => {
          const categoryValue = currentCategories[cat.key];
          const isEnabled = isCategoryEnabled(categoryValue);
          const categoryTools = toolsByCategory[cat.key] || [];
          const hasTools = categoryTools.length > 0;
          const isExpanded = expandedCategories.has(cat.key);

          return (
            <div key={cat.key}>
              <div className="flex items-center justify-between py-2.5 px-3 rounded-md hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {hasTools ? (
                    <button
                      type="button"
                      onClick={() => toggleExpand(cat.key)}
                      className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                  ) : (
                    <span className="w-[22px]" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{cat.label}</p>
                    <p className="text-xs text-muted-foreground">{cat.description}</p>
                  </div>
                </div>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(checked) => handleCategoryToggle(cat.key, checked)}
                  disabled={!isEditing}
                />
              </div>

              {isExpanded && hasTools && isEnabled && (
                <div className="ml-9 border-l border-border pl-3 py-1 space-y-0.5">
                  {categoryTools.map((tool) => {
                    const toolEnabled = getToolEnabled(categoryValue, tool.name);
                    return (
                      <div
                        key={tool.name}
                        className="flex items-center justify-between py-1.5 px-3 rounded-md hover:bg-muted/30 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium font-mono">{tool.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {tool.description}
                          </p>
                        </div>
                        <Switch
                          checked={toolEnabled}
                          onCheckedChange={(checked) =>
                            handleToolToggle(cat.key, tool.name, checked)
                          }
                          disabled={!isEditing}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
