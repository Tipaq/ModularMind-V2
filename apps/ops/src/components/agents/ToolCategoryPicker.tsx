import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Switch } from "@modularmind/ui";
import type { ToolCategories, ToolDefinition } from "@modularmind/api-client";
import { useToolsStore } from "../../stores/tools";
import {
  TOOL_CATEGORIES,
  isCategoryEnabled,
  getToolEnabled,
  getEnabledToolCount,
} from "./tool-categories";

interface ToolCategoryPickerProps {
  categories: ToolCategories;
  onChange: (categories: ToolCategories) => void;
  disabled?: boolean;
}

function buildToolMap(
  currentValue: boolean | Record<string, boolean> | undefined,
  categoryTools: ToolDefinition[],
): Record<string, boolean> {
  if (typeof currentValue === "object" && currentValue !== null) {
    return { ...currentValue };
  }
  const toolMap: Record<string, boolean> = {};
  for (const tool of categoryTools) {
    toolMap[tool.name] = true;
  }
  return toolMap;
}

export function ToolCategoryPicker({
  categories,
  onChange,
  disabled = false,
}: ToolCategoryPickerProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const { tools: allTools, categories: allCategories, fetchTools } = useToolsStore();

  useEffect(() => {
    if (allTools.length === 0) fetchTools();
  }, [allTools.length, fetchTools]);

  const mcpCategories = useMemo(
    () =>
      allCategories
        .filter((c) => c.id.startsWith("mcp:") && c.tool_count > 0)
        .map((c) => ({ key: c.id, label: c.label, description: c.description })),
    [allCategories],
  );

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

  const handleCategoryToggle = (key: string, checked: boolean) => {
    onChange({ ...categories, [key]: checked });
  };

  const handleToolToggle = (categoryKey: string, toolName: string, checked: boolean) => {
    const categoryTools = toolsByCategory[categoryKey] || [];
    const toolMap = buildToolMap(categories[categoryKey], categoryTools);
    toolMap[toolName] = checked;

    const allOn = Object.values(toolMap).every(Boolean);
    const allOff = Object.values(toolMap).every((v) => !v);

    if (allOn) onChange({ ...categories, [categoryKey]: true });
    else if (allOff) onChange({ ...categories, [categoryKey]: false });
    else onChange({ ...categories, [categoryKey]: toolMap });
  };

  const renderCategory = (cat: { key: string; label: string; description: string }) => {
    const categoryValue = categories[cat.key];
    const isEnabled = isCategoryEnabled(categoryValue);
    const categoryTools = toolsByCategory[cat.key] || [];
    const hasTools = categoryTools.length > 0;
    const isExpanded = expandedCategories.has(cat.key);
    const enabledToolCount = getEnabledToolCount(categoryValue, categoryTools.length);

    return (
      <div key={cat.key}>
        <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {hasTools ? (
              <button
                type="button"
                onClick={() => toggleExpand(cat.key)}
                className="p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
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
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium">{cat.label}</span>
              {isEnabled && hasTools && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {enabledToolCount}/{categoryTools.length}
                </span>
              )}
            </div>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => handleCategoryToggle(cat.key, checked)}
            disabled={disabled}
          />
        </div>

        {isExpanded && hasTools && (
          <div className="ml-8 mb-1 rounded-lg bg-muted/20 border border-border/50 overflow-hidden">
            {categoryTools.map((tool, index) => {
              const toolEnabled = isEnabled && getToolEnabled(categoryValue, tool.name);
              return (
                <div
                  key={tool.name}
                  className={`flex items-center justify-between py-2 px-3.5 hover:bg-muted/30 transition-colors ${
                    index < categoryTools.length - 1 ? "border-b border-border/30" : ""
                  } ${!isEnabled ? "opacity-50" : ""}`}
                >
                  <div className="min-w-0 mr-3">
                    <p className="text-xs font-medium font-mono text-foreground/80">{tool.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {tool.description}
                    </p>
                  </div>
                  <Switch
                    checked={toolEnabled}
                    onCheckedChange={(checked) =>
                      handleToolToggle(cat.key, tool.name, checked)
                    }
                    disabled={disabled || !isEnabled}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-0.5">
      {TOOL_CATEGORIES.map(renderCategory)}
      {mcpCategories.length > 0 && (
        <>
          <div className="pt-3 pb-1 px-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              MCP Servers
            </span>
          </div>
          {mcpCategories.map(renderCategory)}
        </>
      )}
    </div>
  );
}
